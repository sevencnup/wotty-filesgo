const CHUNK_SIZE = 16 * 1024 * 1024
const MAX_RETRIES = 4
const SESSION_KEY_PREFIX = 'filesgo:upload:v2:'

export interface UploadResult {
  code: string
  filename: string
  size: number
  download_url: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
  bytesPerSecond: number | null
  etaSeconds: number | null
}

interface UploadStatus {
  upload_id: string
  filename: string
  size: number
  chunk_size: number
  total_chunks: number
  uploaded_chunks: number[]
}

interface UploadOptions {
  file: File
  password: string
  signal: AbortSignal
  onProgress: (progress: UploadProgress) => void
}

export class UploadCancelledError extends Error {
  constructor() {
    super('上传已取消')
    this.name = 'UploadCancelledError'
  }
}

class UploadRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'UploadRequestError'
  }
}

const authHeaders = (password: string): Record<string, string> => ({
  'X-Upload-Password': password,
})

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new UploadCancelledError()
}

const responseError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json()
    return new UploadRequestError(data.error || fallback, response.status)
  } catch {
    return new UploadRequestError(fallback, response.status)
  }
}

const webCryptoAvailable = () => typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'

// Pure-JS SHA-256 fallback for plain-HTTP contexts where Web Crypto is unavailable.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits))

function jsSha256(input: Uint8Array): Uint8Array {
  const bitLength = input.length * 8
  const padLength = (64 - ((input.length + 9) % 64)) % 64
  const total = input.length + 1 + padLength + 8
  const bytes = new Uint8Array(total)
  bytes.set(input)
  bytes[input.length] = 0x80
  const view = new DataView(bytes.buffer)
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(total - 4, bitLength >>> 0)

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const words = new Uint32Array(64)

  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4
      words[i] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3)
      const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10)
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0
    }

    let a = h0, b = h1, c = h2, d = h3
    let e = h4, f = h5, g = h6, h = h7
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temp1 = (h + sigma1 + choose + SHA256_K[i] + words[i]) >>> 0
      const sigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  const digest = new Uint8Array(32)
  const digestView = new DataView(digest.buffer)
  digestView.setUint32(0, h0); digestView.setUint32(4, h1)
  digestView.setUint32(8, h2); digestView.setUint32(12, h3)
  digestView.setUint32(16, h4); digestView.setUint32(20, h5)
  digestView.setUint32(24, h6); digestView.setUint32(28, h7)
  return digest
}

const sha256Hex = async (value: Blob) => {
  const buffer = await value.arrayBuffer()
  const digest = webCryptoAvailable()
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
    : jsSha256(new Uint8Array(buffer))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const fileFingerprint = async (file: File) => {
  const source = new TextEncoder().encode(`${file.name}\u0000${file.size}\u0000${file.lastModified}`)
  const digest = webCryptoAvailable()
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', source))
    : jsSha256(source)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const storageGet = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const storageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private browsing or a full storage quota should not block uploads.
  }
}

const storageRemove = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage failures after the server has completed the upload.
  }
}

const getUploadStatus = async (uploadId: string, password: string, signal: AbortSignal) => {
  const response = await fetch(`/api/uploads/${encodeURIComponent(uploadId)}`, {
    headers: authHeaders(password),
    signal,
  })
  if (response.status === 404) return null
  if (!response.ok) throw await responseError(response, '恢复上传会话失败')
  return response.json() as Promise<UploadStatus>
}

const createUpload = async (file: File, password: string, signal: AbortSignal) => {
  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: {
      ...authHeaders(password),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename: file.name, size: file.size, chunk_size: CHUNK_SIZE }),
    signal,
  })
  if (!response.ok) throw await responseError(response, '创建上传会话失败')
  return response.json() as Promise<UploadStatus>
}

const abortableDelay = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => {
    signal.removeEventListener('abort', abort)
    resolve()
  }, milliseconds)
  const abort = () => {
    window.clearTimeout(timer)
    reject(new UploadCancelledError())
  }
  signal.addEventListener('abort', abort, { once: true })
})

const putChunk = (
  status: UploadStatus,
  index: number,
  chunk: Blob,
  hash: string,
  password: string,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
) => new Promise<void>((resolve, reject) => {
  throwIfAborted(signal)
  const xhr = new XMLHttpRequest()
  const abort = () => xhr.abort()
  const cleanup = () => signal.removeEventListener('abort', abort)

  xhr.open('PUT', `/api/uploads/${encodeURIComponent(status.upload_id)}/chunks/${index}`)
  xhr.timeout = 10 * 60 * 1000
  xhr.setRequestHeader('Content-Type', 'application/octet-stream')
  xhr.setRequestHeader('X-Upload-Password', password)
  xhr.setRequestHeader('X-Chunk-SHA256', hash)
  xhr.upload.addEventListener('progress', event => {
    if (event.lengthComputable) onProgress(Math.min(event.loaded, chunk.size))
  })
  xhr.addEventListener('load', () => {
    cleanup()
    if (xhr.status >= 200 && xhr.status < 300) {
      onProgress(chunk.size)
      resolve()
      return
    }
    try {
      const data = JSON.parse(xhr.responseText)
      reject(new UploadRequestError(data.error || '上传分片失败', xhr.status))
    } catch {
      reject(new UploadRequestError('上传分片失败', xhr.status))
    }
  })
  xhr.addEventListener('error', () => {
    cleanup()
    reject(new UploadRequestError('网络中断，正在重试', 0))
  })
  xhr.addEventListener('timeout', () => {
    cleanup()
    reject(new UploadRequestError('分片上传超时，正在重试', 0))
  })
  xhr.addEventListener('abort', () => {
    cleanup()
    reject(new UploadCancelledError())
  })
  signal.addEventListener('abort', abort, { once: true })
  xhr.send(chunk)
})

const cancelUpload = async (uploadId: string, password: string) => {
  try {
    await fetch(`/api/uploads/${encodeURIComponent(uploadId)}`, {
      method: 'DELETE',
      headers: authHeaders(password),
      keepalive: true,
    })
  } catch {
    // Stale sessions are cleaned by the server if cancellation cannot be delivered.
  }
}

const connectionConcurrency = () => {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection
  if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === '3g') return 2
  return 3
}

export async function uploadFileResumable({ file, password, signal, onProgress }: UploadOptions): Promise<UploadResult> {
  throwIfAborted(signal)
  const fingerprint = await fileFingerprint(file)
  const storageKey = SESSION_KEY_PREFIX + fingerprint
  let status: UploadStatus | null = null
  let uploadId = storageGet(storageKey)

  try {
    if (uploadId) {
      status = await getUploadStatus(uploadId, password, signal)
      if (status && (status.size !== file.size || status.filename !== file.name || status.chunk_size !== CHUNK_SIZE)) {
        status = null
      }
    }
    if (!status) {
      storageRemove(storageKey)
      status = await createUpload(file, password, signal)
      uploadId = status.upload_id
      storageSet(storageKey, uploadId)
    }

    const completed = new Set(status.uploaded_chunks)
    const progressByChunk = new Map<number, number>()
    const chunkLength = (index: number) => Math.min(status!.chunk_size, file.size - index * status!.chunk_size)
    completed.forEach(index => progressByChunk.set(index, chunkLength(index)))

    let lastEmitted = 0
    const samples: Array<{ time: number; loaded: number }> = []
    const emitProgress = (force = false) => {
      const now = performance.now()
      if (!force && now - lastEmitted < 100) return
      const loaded = Math.min(file.size, Array.from(progressByChunk.values()).reduce((sum, value) => sum + value, 0))
      samples.push({ time: now, loaded })
      while (samples.length > 1 && samples[0].time < now - 2000) samples.shift()
      const first = samples[0]
      const elapsed = first ? (now - first.time) / 1000 : 0
      const bytesPerSecond = elapsed > 0 ? Math.max(0, (loaded - first.loaded) / elapsed) : null
      onProgress({
        loaded,
        total: file.size,
        percent: file.size === 0 ? 100 : (loaded / file.size) * 100,
        bytesPerSecond: bytesPerSecond && bytesPerSecond > 0 ? bytesPerSecond : null,
        etaSeconds: bytesPerSecond && bytesPerSecond > 0 ? (file.size - loaded) / bytesPerSecond : null,
      })
      lastEmitted = now
    }
    emitProgress(true)

    const pending = Array.from({ length: status.total_chunks }, (_, index) => index)
      .filter(index => !completed.has(index))
    let cursor = 0
    const workerController = new AbortController()
    const abortWorkers = () => workerController.abort()
    signal.addEventListener('abort', abortWorkers, { once: true })
    const originalStatus = status
    const transferWorker = async () => {
      while (cursor < pending.length) {
        throwIfAborted(workerController.signal)
        const index = pending[cursor++]
        const start = index * originalStatus.chunk_size
        const chunk = file.slice(start, start + originalStatus.chunk_size)
        const hash = await sha256Hex(chunk)
        let lastError: unknown
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            await putChunk(originalStatus, index, chunk, hash, password, workerController.signal, loaded => {
              const previous = progressByChunk.get(index) || 0
              progressByChunk.set(index, Math.max(previous, loaded))
              emitProgress()
            })
            progressByChunk.set(index, chunk.size)
            emitProgress(true)
            lastError = null
            break
          } catch (error) {
            if (signal.aborted) throw new UploadCancelledError()
            if (error instanceof UploadCancelledError) throw error
            lastError = error
            if (attempt === MAX_RETRIES) break
            await abortableDelay(500 * 2 ** attempt + Math.random() * 250, workerController.signal)
          }
        }
        if (lastError) throw lastError
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(connectionConcurrency(), pending.length || 1) }, transferWorker))
    } catch (error) {
      workerController.abort()
      throw error
    } finally {
      signal.removeEventListener('abort', abortWorkers)
    }

    const response = await fetch(`/api/uploads/${encodeURIComponent(status.upload_id)}/complete`, {
      method: 'POST',
      headers: authHeaders(password),
      signal,
    })
    if (!response.ok) throw await responseError(response, '完成上传失败')
    const result = await response.json() as UploadResult
    storageRemove(storageKey)
    progressByChunk.clear()
    progressByChunk.set(0, file.size)
    emitProgress(true)
    return result
  } catch (error) {
    if (signal.aborted || error instanceof UploadCancelledError) {
      if (uploadId) await cancelUpload(uploadId, password)
      storageRemove(storageKey)
      throw new UploadCancelledError()
    }
    throw error
  }
}

