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

const sha256Hex = async (value: Blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await value.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const fileFingerprint = async (file: File) => {
  const source = new TextEncoder().encode(`${file.name}\u0000${file.size}\u0000${file.lastModified}`)
  const digest = await crypto.subtle.digest('SHA-256', source)
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
