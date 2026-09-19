'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Github,
  HelpCircle,
  KeyRound,
  Link2,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  DEFAULT_UPLOAD_CONFIG,
  fetchUploadConfig,
  uploadFileResumable,
  UploadCancelledError,
  type UploadConfig,
  type UploadStage,
} from '@/lib/resumable-upload'

const translations = {
  zh: {
    title: 'wotty FilesGO',
    subtitle: '安全 · 高效 · 便捷',
    sendTab: '发送文件',
    receiveTab: '接收文件',
    passwordPlaceholder: '请输入上传密码',
    passwordLabel: '上传密码',
    passwordHint: '验证密码后即可上传文件',
    verify: '验证',
    dropzoneText: '点击上传文件或拖拽到此处',
    dropzoneHint: '单个文件最大',
    uploading: '正在上传...',
    uploadPreparing: '正在准备上传...',
    uploadUploading: '正在上传并校验分片...',
    uploadAssembling: '正在合并文件...',
    waiting: '等待上传',
    pickupCode: '取件码',
    clickToCopy: '取件码已复制，可分享给对方',
    shareLink: '分享链接',
    copyLink: '复制链接',
    copyCode: '复制取件码',
    shareCode: '分享取件码',
    continueSend: '继续发送',
    addMore: '添加更多文件',
    enterCode: '输入 6 位取件码',
    downloadBtn: '立即下载',
    finding: '正在查找...',
    fileFound: '找到文件',
    downloadStarted: '下载已开始',
    fileNotFound: '文件不存在或已过期',
    networkError: '网络错误',
    validPeriod: '有效期',
    validPeriodValue: '2小时候自动删除',
    codeProtection: '取件码保护',
    codeProtectionValue: '仅凭取件码可提取',
    downloadLimit: '下载次数限制',
    downloadLimitValue: '2小时内不限次数下载',
    securityTip: '文件采用加密存储，保障您的数据安全',
    securityMore: '查看文件加密说明',
    help: '帮助中心',
    codeCopied: '取件码已复制',
    linkCopied: '链接已复制',
    copyFailed: '复制失败，请手动复制',
    uploadFailed: '上传失败',
    uploadCancelled: '上传已取消',
    confirmCancel: '确定要取消上传',
    fileTooLarge: '超过单文件大小限制，已跳过',
    totalTooLarge: '超过单次上传总大小限制，已跳过',
    passwordRequired: '请先验证上传密码',
    siteAccessTitle: '站点访问保护',
    siteAccessSubtitle: '请输入访问密码后继续使用文件传输服务',
    sitePasswordPlaceholder: '请输入站点访问密码',
    sitePasswordHint: '密码由站点管理员在 config.yaml 中设置',
    siteLogin: '进入站点',
    siteChecking: '正在检查访问权限...',
    siteLoginFailed: '密码错误，请重试',
    siteNetworkError: '暂时无法连接服务器，请稍后重试',
  },
}

type UploadItem = {
  id: string
  file: File
  status: 'waiting' | 'uploading'
}

type UploadResult = {
  filename: string
  code: string
  size: number
  download_url: string
}

export default function HomePage() {
  const [authState, setAuthState] = useState<'checking' | 'locked' | 'authenticated'>('checking')
  const [sitePassword, setSitePassword] = useState('')
  const [showSitePassword, setShowSitePassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [currentTab, setCurrentTab] = useState<'send' | 'receive'>('send')
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [currentUpload, setCurrentUpload] = useState<{ filename: string; size: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const dragDepthRef = useRef(0)
  const [progress, setProgress] = useState(0)
  const [uploadSpeedBps, setUploadSpeedBps] = useState<number | null>(null)
  const [uploadEtaSec, setUploadEtaSec] = useState<number | null>(null)
  const [uploadStage, setUploadStage] = useState<UploadStage>('preparing')
  const [uploadConfig, setUploadConfig] = useState<UploadConfig>(DEFAULT_UPLOAD_CONFIG)
  const [receiveCode, setReceiveCode] = useState('')
  const [receiveCodeSlots, setReceiveCodeSlots] = useState<string[]>(() => Array(6).fill(''))
  const [receiveStatus, setReceiveStatus] = useState({ text: '', type: '' })
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSecurityDetailsOpen, setIsSecurityDetailsOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const receiveInputRefs = useRef<Array<HTMLInputElement | null>>([])
  const uploadControllerRef = useRef<AbortController | null>(null)
  const lastAutoCodeRef = useRef<string>('')
  const t = translations.zh

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const timeoutId = window.setTimeout(() => controller.abort(), 5000)
    fetch('/api/auth/status', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('auth status failed')
        return response.json() as Promise<{ protected: boolean; authenticated: boolean }>
      })
      .then((data) => {
        setAuthState(!data.protected || data.authenticated ? 'authenticated' : 'locked')
      })
      .catch(() => {
        if (!disposed) {
          setAuthState('locked')
          setAuthError(t.siteNetworkError)
        }
      })
      .finally(() => window.clearTimeout(timeoutId))
    return () => {
      disposed = true
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [t.siteNetworkError])

  const handleSiteLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sitePassword.trim() || isLoggingIn) return

    setIsLoggingIn(true)
    setAuthError('')
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: sitePassword }),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({})) as { error?: string; authenticated?: boolean }
      if (!response.ok || !data.authenticated) {
        setAuthError(data.error || t.siteLoginFailed)
        return
      }
      setSitePassword('')
      setAuthState('authenticated')
    } catch {
      setAuthError(controller.signal.aborted ? '验证请求超时，请检查服务状态' : t.siteNetworkError)
    } finally {
      window.clearTimeout(timeoutId)
      setIsLoggingIn(false)
    }
  }

  const showToast = useCallback((message: string, type: string = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2200)
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatSpeed = (bps: number | null) => {
    if (!bps || bps <= 0) return '--'
    const k = 1024
    if (bps < k) return `${Math.round(bps)} B/s`
    if (bps < k * k) return `${(bps / k).toFixed(1)} KB/s`
    if (bps < k * k * k) return `${(bps / (k * k)).toFixed(1)} MB/s`
    return `${(bps / (k * k * k)).toFixed(1)} GB/s`
  }

  const formatEta = (sec: number | null) => {
    if (sec === null || !isFinite(sec) || sec < 0) return '--'
    const s = Math.ceil(sec)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const uploadStageLabel = uploadStage === 'preparing'
    ? t.uploadPreparing
    : uploadStage === 'assembling'
      ? t.uploadAssembling
      : t.uploadUploading
  const maxFileSizeLabel = formatSize(uploadConfig.maxFileSizeBytes)
  const maxTotalSizeLabel = formatSize(uploadConfig.maxTotalSizeBytes)

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const queuedSize = uploadQueue.reduce((sum, item) => sum + item.file.size, 0)
    let selectedSize = 0
    const newFiles: UploadItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > uploadConfig.maxFileSizeBytes) {
        showToast(`${file.name} ${t.fileTooLarge}`, 'error')
        continue
      }
      if (queuedSize + selectedSize + file.size > uploadConfig.maxTotalSizeBytes) {
        showToast(`${file.name} ${t.totalTooLarge}`, 'error')
        continue
      }
      selectedSize += file.size
      newFiles.push({
        id: Date.now() + Math.random().toString(36).substring(2),
        file,
        status: 'waiting',
      })
    }
    if (newFiles.length > 0) setUploadQueue((prev) => [...prev, ...newFiles])
  }

  const removeFromQueue = (index: number) => {
    const item = uploadQueue[index]
    if (!item) return

    if (item.status === 'uploading') {
      if (confirm(`${t.confirmCancel} "${item.file.name}"?`)) uploadControllerRef.current?.abort()
      return
    }
    setUploadQueue((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadSingleFile = async (file: File) => {
    const controller = new AbortController()
    uploadControllerRef.current = controller
    try {
      return await uploadFileResumable({
        file,
        config: uploadConfig,
        signal: controller.signal,
        onProgress: ({ percent, bytesPerSecond, etaSeconds, stage }) => {
          setProgress(percent)
          setUploadSpeedBps(bytesPerSecond)
          setUploadEtaSec(etaSeconds)
          setUploadStage(stage)
        },
      })
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null
    }
  }

  const processQueue = useCallback(async () => {
    if (isUploading || uploadQueue.length === 0) return
    const waitingIndex = uploadQueue.findIndex((item) => item.status === 'waiting')
    if (waitingIndex === -1) return

    setIsUploading(true)
    const currentItem = uploadQueue[waitingIndex]
    setUploadQueue((prev) => prev.map((item, i) => (i === waitingIndex ? { ...item, status: 'uploading' } : item)))
    setCurrentUpload({ filename: currentItem.file.name, size: currentItem.file.size })
    setProgress(0)
    setUploadSpeedBps(null)
    setUploadEtaSec(null)
    setUploadStage('preparing')

    try {
      const result = await uploadSingleFile(currentItem.file)
      setUploadResults((prev) => [
        ...prev,
        {
          filename: currentItem.file.name,
          code: result.code,
          size: currentItem.file.size,
          download_url: window.location.origin + '/?code=' + result.code,
        },
      ])
      setUploadQueue((prev) => prev.filter((_, i) => i !== waitingIndex))
    } catch (e: any) {
      const message = e instanceof UploadCancelledError ? t.uploadCancelled : e.message || t.uploadFailed
      showToast(`${currentItem.file.name} ${message}`, 'error')
      setUploadQueue((prev) => prev.filter((_, i) => i !== waitingIndex))
    }

    setIsUploading(false)
    setCurrentUpload(null)
  }, [isUploading, uploadQueue, showToast, uploadConfig])

  useEffect(() => {
    if (uploadQueue.some((item) => item.status === 'waiting') && !isUploading) processQueue()
  }, [uploadQueue, isUploading, processQueue])

  useEffect(() => {
    if (authState !== 'authenticated') return
    const controller = new AbortController()
    fetchUploadConfig(controller.signal)
      .then(setUploadConfig)
      .catch(() => {
        // Keep the safe defaults when the public configuration endpoint is unavailable.
      })
    return () => controller.abort()
  }, [authState])

  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const handleDownload = async (code: string) => {
    const normalized = code.trim().toUpperCase()
    if (normalized.length !== 6) {
      setReceiveStatus({ text: '请输入 6 位取件码', type: 'error' })
      return
    }

    setIsDownloading(true)
    setReceiveStatus({ text: t.finding, type: 'info' })
    try {
      const res = await fetch(`/api/file/${normalized}`)
      if (res.ok) {
        const file = await res.json()
        setReceiveStatus({ text: `${t.fileFound}: ${file.filename} (${formatSize(file.size)})`, type: 'success' })
        window.location.href = `/api/download/${normalized}`
        setTimeout(() => {
          setIsDownloading(false)
          setReceiveStatus({ text: t.downloadStarted, type: 'info' })
        }, 2000)
      } else {
        setReceiveStatus({ text: t.fileNotFound, type: 'error' })
        setIsDownloading(false)
      }
    } catch {
      setReceiveStatus({ text: t.networkError, type: 'error' })
      setIsDownloading(false)
    }
  }

  const updateReceiveSlots = (slots: string[], autoDownload = true) => {
    const normalizedSlots = slots.slice(0, 6).map((slot) => slot.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(-1))
    while (normalizedSlots.length < 6) normalizedSlots.push('')
    const normalized = normalizedSlots.join('')
    setReceiveCodeSlots(normalizedSlots)
    setReceiveCode(normalized)
    if (autoDownload && normalized.length === 6 && normalized !== lastAutoCodeRef.current) {
      lastAutoCodeRef.current = normalized
      handleDownload(normalized)
    }
    return normalized
  }

  const updateReceiveCode = (value: string, autoDownload = true) => {
    const normalized = value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6)
    return updateReceiveSlots(normalized.split(''), autoDownload)
  }

  const focusReceiveInput = (index: number) => {
    receiveInputRefs.current[index]?.focus()
    receiveInputRefs.current[index]?.select()
  }

  const handleReceiveInput = (index: number, value: string) => {
    const character = value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(-1)
    const nextSlots = [...receiveCodeSlots]
    nextSlots[index] = character
    updateReceiveSlots(nextSlots)
    if (character && index < 5) focusReceiveInput(index + 1)
  }

  const handleReceiveKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !receiveCodeSlots[index] && index > 0) {
      event.preventDefault()
      const nextSlots = [...receiveCodeSlots]
      nextSlots[index - 1] = ''
      updateReceiveSlots(nextSlots, false)
      focusReceiveInput(index - 1)
    }
  }

  const handleReceivePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6 - index)
    if (!pasted) return
    const nextSlots = [...receiveCodeSlots]
    pasted.split('').forEach((character, offset) => { nextSlots[index + offset] = character })
    updateReceiveSlots(nextSlots)
    focusReceiveInput(Math.min(index + pasted.length, 5))
  }

  useEffect(() => {
    if (authState !== 'authenticated') return
    const path = window.location.pathname
    const urlParams = new URLSearchParams(window.location.search)
    let potentialCode = urlParams.get('code')
    if (!potentialCode) {
      const match = path.match(/\/([A-Z0-9]{6})\/?$/i)
      if (match && match[1]) potentialCode = match[1]
    }
    if (potentialCode) {
      potentialCode = potentialCode.toUpperCase()
      setCurrentTab('receive')
      updateReceiveCode(potentialCode, false)
      lastAutoCodeRef.current = potentialCode
      handleDownload(potentialCode)
    }
  }, [authState])

  const copyToClipboard = async (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        textarea.style.pointerEvents = 'none'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!copied) throw new Error('copy failed')
      }
      showToast(successMessage, 'success')
    } catch {
      showToast(t.copyFailed, 'error')
    }
  }

  const resetUpload = () => {
    uploadControllerRef.current?.abort()
    setUploadQueue([])
    setUploadResults([])
    setCurrentUpload(null)
    setProgress(0)
    setUploadSpeedBps(null)
    setUploadEtaSec(null)
    setUploadStage('preparing')
  }

  const primaryResult = uploadResults[0]
  const displayCode = primaryResult?.code || '------'

  if (authState === 'checking') {
    return (
      <main className="site-gate">
        <div className="site-gate-card site-gate-loading">
          <Image src="/logo.webp" alt="wotty FilesGO" width={62} height={62} className="site-gate-logo" />
          <span>{t.siteChecking}</span>
        </div>
      </main>
    )
  }

  if (authState === 'locked') {
    return (
      <main className="site-gate">
        <div className="site-gate-card">
          <div className="site-gate-brand">
            <Image src="/logo.webp" alt="wotty FilesGO" width={62} height={62} className="site-gate-logo" />
            <span className="site-gate-kicker"><ShieldCheck size={15} /> PRIVATE TRANSFER SPACE</span>
          </div>
          <h1>{t.siteAccessTitle}</h1>
          <p className="site-gate-subtitle">{t.siteAccessSubtitle}</p>
          <form className="site-gate-form" onSubmit={handleSiteLogin}>
            <label htmlFor="site-password">访问密码</label>
            <div className="site-password-field">
              <KeyRound size={18} aria-hidden="true" />
              <input
                id="site-password"
                type={showSitePassword ? 'text' : 'password'}
                value={sitePassword}
                onChange={(event) => setSitePassword(event.target.value)}
                placeholder={t.sitePasswordPlaceholder}
                autoComplete="current-password"
                autoFocus
                disabled={isLoggingIn}
              />
              <button
                type="button"
                className="site-password-toggle"
                onClick={() => setShowSitePassword((visible) => !visible)}
                aria-label={showSitePassword ? '隐藏密码' : '显示密码'}
              >
                {showSitePassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {authError && <p className="site-gate-error" role="alert">{authError}</p>}
            <button className="site-gate-submit" type="submit" disabled={!sitePassword.trim() || isLoggingIn}>
              <KeyRound size={17} />
              {isLoggingIn ? '验证中...' : t.siteLogin}
              {!isLoggingIn && <ChevronRight size={17} />}
            </button>
          </form>
          <p className="site-gate-hint">{t.sitePasswordHint}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flash-page">
      {toast && <div className={`flash-toast ${toast.type === 'error' ? 'is-error' : toast.type === 'success' ? 'is-success' : ''}`}>{toast.message}</div>}

      <header className="site-header">
        <div className="header-inner">
          <div className="brand-lockup">
            <div className="brand-mark"><Image src="/logo.webp" alt="Logo" width={52} height={52} className="brand-logo" /></div>
            <div>
              <h1>{t.title}</h1>
              <p>{t.subtitle}</p>
            </div>
          </div>

          <nav className="main-nav" aria-label="主导航">
            <button className={`nav-item ${currentTab === 'send' ? 'is-active' : ''}`} onClick={() => setCurrentTab('send')}>
              <Image src="/1.webp" alt="发送文件" width={19} height={19} className="nav-tab-icon" />
              {t.sendTab}
            </button>
            <button className={`nav-item ${currentTab === 'receive' ? 'is-active' : ''}`} onClick={() => setCurrentTab('receive')}>
              <Image src="/2.webp" alt="接收文件" width={19} height={19} className="nav-tab-icon" />
              {t.receiveTab}
            </button>
          </nav>

          <div className="header-actions">
            <a
              className="github-link"
              href="https://github.com/sevencnup/wotty-filesgo"
              target="_blank"
              rel="noreferrer"
              aria-label="在 GitHub 查看 wotty FilesGO 开源仓库"
              title="GitHub 开源仓库"
            >
              <Github size={21} strokeWidth={1.9} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <section className={`workspace ${currentTab === 'receive' ? 'is-receive' : ''}`}>
        {currentTab === 'send' ? (
          <div className={`upload-card panel-card${dragActive ? ' is-dragging' : ''}`} onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragDepthRef.current++; setDragActive(true) }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (dragDepthRef.current === 0) setDragActive(false) }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragDepthRef.current = 0; setDragActive(false); handleFileSelect(e.dataTransfer.files) }}>
            <input ref={fileInputRef} type="file" multiple onChange={(e) => handleFileSelect(e.target.files)} className="visually-hidden" />

            <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
              <div className="upload-illustration"><Image src="/download.webp" alt="上传文件" width={320} height={160} className="upload-image" /></div>
              <h2>{t.dropzoneText}</h2>
              <p>{t.dropzoneHint} {maxFileSizeLabel}，单次最多 {maxTotalSizeLabel}</p>
            </div>

            {uploadQueue.length > 0 && (
              <div className="file-list">
                {uploadQueue.map((item, index) => (
                  <div key={item.id} className="file-row">
                    <div className="file-type-icon"><FileText size={20} /></div>
                    <div className="file-meta"><strong title={item.file.name}>{item.file.name}</strong><span>{formatSize(item.file.size)}</span></div>
                    <span className={`file-status ${item.status === 'uploading' ? 'is-uploading' : ''}`}>{item.status === 'uploading' ? t.uploading : t.waiting}</span>
                    <button className="icon-button" onClick={() => removeFromQueue(index)} aria-label="移除文件"><X size={18} /></button>
                  </div>
                ))}
              </div>
            )}

            {uploadResults.length > 0 && (
              <div className="result-list">
                {uploadResults.map((result, index) => (
                  <div className="result-inline" key={`${result.code}-${index}`}>
                    <CheckCircle2 size={19} />
                    <span>{result.filename}</span>
                    <button onClick={() => copyToClipboard(result.code, t.codeCopied)}>{result.code}</button>
                  </div>
                ))}
              </div>
            )}

            {!currentUpload && (
              <button className="add-files-button" onClick={() => fileInputRef.current?.click()}><Plus size={18} /> {t.addMore}</button>
            )}
            {uploadResults.length > 0 && <button className="continue-button" onClick={resetUpload}>{t.continueSend}<ChevronRight size={17} /></button>}
          </div>
        ) : (
          <div className="receive-card panel-card">
            <div className="receive-form-panel">
              <h2>输入取件码提取文件</h2>
              <p className="receive-description">请向发送方获取取件码，并输入下方输入框</p>
              <div className="receive-code-inputs" role="group" aria-label="6 位取件码">
                {Array.from({ length: 6 }, (_, index) => (
                  <input
                    key={index}
                    ref={(element) => { receiveInputRefs.current[index] = element }}
                    className="receive-code-input"
                    type="text"
                    inputMode="text"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={receiveCodeSlots[index]}
                    onChange={(e) => handleReceiveInput(index, e.target.value)}
                    onKeyDown={(e) => handleReceiveKeyDown(index, e)}
                    onPaste={(e) => handleReceivePaste(index, e)}
                    disabled={isDownloading}
                    aria-label={`取件码第 ${index + 1} 位`}
                  />
                ))}
              </div>
              <button className="download-button" onClick={() => handleDownload(receiveCode)} disabled={isDownloading}>
                <Download size={19} /> {isDownloading ? t.finding : '提取文件'}
              </button>
              <div className="receive-case-hint">取件码不区分大小写</div>
              <div className={`receive-status ${receiveStatus.type === 'error' ? 'is-error' : receiveStatus.type === 'success' ? 'is-success' : ''}`}>{receiveStatus.text}</div>
            </div>
          </div>
        )}

        {currentTab === 'send' && (
          <aside className="share-card panel-card">
          {isUploading && currentUpload ? (
            <div className="share-upload-progress">
              <h2>{uploadStageLabel}</h2>
              <div className="upload-progress">
                <div className="upload-progress-heading"><span>{uploadStageLabel}</span><strong>{Math.round(progress)}%</strong></div>
                <p>{currentUpload.filename} · {formatSize(currentUpload.size)}</p>
                <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
                <small>{formatSpeed(uploadSpeedBps)} · 剩余 {formatEta(uploadEtaSec)}</small>
              </div>
            </div>
          ) : uploadResults.length > 1 ? (
            <>
              <h2>文件已准备好分享</h2>
              <div className="code-note"><CheckCircle2 size={17} /> 共 {uploadResults.length} 个取件码，每个文件对应一个</div>

              <div className="share-code-list">
                {uploadResults.map((result, index) => (
                  <div className="result-inline" key={`${result.code}-${index}`}>
                    <CheckCircle2 size={19} />
                    <span title={result.filename}>{result.filename}</span>
                    <button onClick={() => copyToClipboard(result.code, t.codeCopied)}>{result.code}</button>
                    <button className="link-btn" onClick={() => copyToClipboard(result.download_url, t.linkCopied)} aria-label="复制分享链接"><Link2 size={15} /></button>
                  </div>
                ))}
              </div>

              <div className="share-details">
                <div className="detail-row"><Clock3 size={19} /><strong>{t.validPeriod}</strong><span>{t.validPeriodValue}</span></div>
                <div className="detail-row"><ShieldCheck size={19} /><strong>{t.codeProtection}</strong><span>{t.codeProtectionValue}</span></div>
                <div className="detail-row"><Download size={19} /><strong>{t.downloadLimit}</strong><span>{t.downloadLimitValue}</span></div>
              </div>
            </>
          ) : (
            <>
              <h2>文件已准备好分享</h2>
              <div className="code-display" onClick={() => primaryResult && copyToClipboard(primaryResult.code, t.codeCopied)} role={primaryResult ? 'button' : undefined} tabIndex={primaryResult ? 0 : undefined}>
                {displayCode.split('').map((digit, index) => <span key={`${digit}-${index}`} className={!primaryResult ? 'is-placeholder' : ''}>{digit}</span>)}
              </div>
              <div className="code-note"><CheckCircle2 size={17} /> {primaryResult ? t.clickToCopy : '上传完成后将在这里生成取件码'}</div>

              <div className="share-details">
                <div className="detail-row"><Clock3 size={19} /><strong>{t.validPeriod}</strong><span>{t.validPeriodValue}</span></div>
                <div className="detail-row"><ShieldCheck size={19} /><strong>{t.codeProtection}</strong><span>{t.codeProtectionValue}</span></div>
                <div className="detail-row"><Download size={19} /><strong>{t.downloadLimit}</strong><span>{t.downloadLimitValue}</span></div>
              </div>

              <div className="share-actions">
                <button className="secondary-action" disabled={!primaryResult} onClick={() => primaryResult && copyToClipboard(primaryResult.code, t.codeCopied)}><Copy size={18} /> {t.copyCode}</button>
                <button className="primary-action" disabled={!primaryResult} onClick={() => primaryResult && copyToClipboard(primaryResult.download_url, t.linkCopied)}><Link2 size={18} /> {t.shareCode}</button>
              </div>

              {primaryResult && <div className="share-link-row"><span>{primaryResult.download_url}</span><button onClick={() => copyToClipboard(primaryResult.download_url, t.linkCopied)}><Copy size={15} /></button></div>}
            </>
          )}
          </aside>
        )}
      </section>

      <footer className="security-footer">
        <div><ShieldCheck size={19} /><span>{t.securityTip}</span></div>
        <span className="footer-copyright">© 2026 星七七 wotty FilesGO 文件传输 · 2H Auto-Destruct</span>
        <button
          type="button"
          aria-expanded={isSecurityDetailsOpen}
          aria-controls="security-details"
          onClick={() => setIsSecurityDetailsOpen((open) => !open)}
        >
          {t.securityMore} <ChevronRight size={17} />
        </button>
      </footer>

      {isSecurityDetailsOpen && (
        <div className="security-details-backdrop" role="presentation" onClick={() => setIsSecurityDetailsOpen(false)}>
          <section
            id="security-details"
            className="security-details-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="security-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="security-details-header">
              <div>
                <div className="security-details-kicker"><ShieldCheck size={16} /> 文件落盘加密</div>
                <h2 id="security-details-title">文件如何受到加密保护</h2>
              </div>
              <button type="button" className="security-details-close" onClick={() => setIsSecurityDetailsOpen(false)} aria-label="关闭加密说明"><X size={20} /></button>
            </div>
            <div className="security-details-content">
              <p>文件上传完成后，服务端会在写入存储前使用 <strong>AES-256-GCM</strong> 加密；磁盘上保存的是密文，而不是原始文件内容。</p>
              <div className="security-details-item">
                <strong>每个文件独立加密</strong>
                <span>系统会为每个文件随机生成独立的 256 位数据密钥，并为每个分片使用唯一 nonce，避免不同文件共用加密材料。</span>
              </div>
              <div className="security-details-item">
                <strong>密钥采用信封加密保护</strong>
                <span>文件的数据密钥会由服务端主密钥再次加密后随文件保存，主密钥仅保留在服务端配置或受限密钥文件中。</span>
              </div>
              <div className="security-details-item">
                <strong>下载时即时解密</strong>
                <span>验证取件码并下载时，服务端按分片流式解密后发送给浏览器，不会在存储中额外生成完整明文副本。</span>
              </div>
              <p className="security-details-note">该机制主要防护磁盘被直接拷贝或备份泄露等场景；这是服务端透明加密，服务端本身具备解密能力。</p>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
