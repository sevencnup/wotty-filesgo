'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  FolderOpen,
  HelpCircle,
  Link2,
  LockKeyhole,
  Plus,
  Send,
  ShieldCheck,
  UserCircle,
  X,
} from 'lucide-react'
import { uploadFileResumable, UploadCancelledError } from '@/lib/resumable-upload'

const translations = {
  zh: {
    title: '闪传',
    subtitle: '安全 · 高效 · 便捷',
    sendTab: '发送文件',
    receiveTab: '接收文件',
    passwordPlaceholder: '请输入上传密码',
    passwordLabel: '上传密码',
    passwordHint: '验证密码后即可上传文件',
    verify: '验证',
    dropzoneText: '点击上传文件或拖拽到此处',
    dropzoneHint: '单个文件最大 10GB，单次最多 20GB',
    uploading: '正在上传...',
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
    validPeriodValue: '7 天后过期',
    codeProtection: '取件码保护',
    codeProtectionValue: '仅凭取件码可提取',
    downloadLimit: '下载次数限制',
    downloadLimitValue: '不限次数',
    securityTip: '文件采用加密存储，保障您的数据安全',
    securityMore: '了解更多安全说明',
    help: '帮助中心',
    passwordError: '密码错误，请重新输入',
    passwordVerifyFailed: '密码验证失败',
    codeCopied: '取件码已复制',
    linkCopied: '链接已复制',
    copyFailed: '复制失败，请手动复制',
    uploadFailed: '上传失败',
    uploadCancelled: '上传已取消',
    confirmCancel: '确定要取消上传',
    fileTooLarge: '超过 10GB 限制，已跳过',
    passwordRequired: '请先验证上传密码',
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
  const [currentTab, setCurrentTab] = useState<'send' | 'receive'>('send')
  const [uploadPassword, setUploadPassword] = useState('')
  const [isPasswordVerified, setIsPasswordVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [currentUpload, setCurrentUpload] = useState<{ filename: string; size: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploadSpeedBps, setUploadSpeedBps] = useState<number | null>(null)
  const [uploadEtaSec, setUploadEtaSec] = useState<number | null>(null)
  const [receiveCode, setReceiveCode] = useState('')
  const [receiveCodeSlots, setReceiveCodeSlots] = useState<string[]>(() => Array(6).fill(''))
  const [receiveStatus, setReceiveStatus] = useState({ text: '', type: '' })
  const [isDownloading, setIsDownloading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const receiveInputRefs = useRef<Array<HTMLInputElement | null>>([])
  const uploadControllerRef = useRef<AbortController | null>(null)
  const lastAutoCodeRef = useRef<string>('')
  const t = translations.zh

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

  const verifyPassword = async () => {
    if (!uploadPassword.trim()) return
    setIsVerifying(true)
    try {
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: uploadPassword.trim() }),
      })
      const data = await res.json()

      if (data.valid) {
        setIsPasswordVerified(true)
        showToast('密码验证成功', 'success')
      } else {
        showToast(t.passwordError, 'error')
        setUploadPassword('')
      }
    } catch {
      showToast(t.passwordVerifyFailed, 'error')
    }
    setIsVerifying(false)
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    if (!isPasswordVerified) {
      showToast(t.passwordRequired, 'error')
      return
    }

    const maxSize = 10 * 1024 * 1024 * 1024
    const newFiles: UploadItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > maxSize) {
        showToast(`${file.name} ${t.fileTooLarge}`, 'error')
        continue
      }
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
        password: uploadPassword,
        signal: controller.signal,
        onProgress: ({ percent, bytesPerSecond, etaSeconds }) => {
          setProgress(percent)
          setUploadSpeedBps(bytesPerSecond)
          setUploadEtaSec(etaSeconds)
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
  }, [isUploading, uploadQueue, uploadPassword, showToast])

  useEffect(() => {
    if (uploadQueue.some((item) => item.status === 'waiting') && !isUploading) processQueue()
  }, [uploadQueue, isUploading, processQueue])

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
  }, [])

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
  }

  const primaryResult = uploadResults[0]
  const displayCode = primaryResult?.code || '------'

  return (
    <main className="flash-page">
      {toast && <div className={`flash-toast ${toast.type === 'error' ? 'is-error' : toast.type === 'success' ? 'is-success' : ''}`}>{toast.message}</div>}

      <header className="site-header">
        <div className="header-inner">
          <div className="brand-lockup">
            <div className="brand-mark"><Image src="/logo.png" alt="Logo" width={52} height={52} className="brand-logo" /></div>
            <div>
              <h1>{t.title}</h1>
              <p>{t.subtitle}</p>
            </div>
          </div>

          <nav className="main-nav" aria-label="主导航">
            <button className={`nav-item ${currentTab === 'send' ? 'is-active' : ''}`} onClick={() => setCurrentTab('send')}>
              <Send size={19} strokeWidth={2.3} />
              {t.sendTab}
            </button>
            <button className={`nav-item ${currentTab === 'receive' ? 'is-active' : ''}`} onClick={() => setCurrentTab('receive')}>
              <Download size={19} strokeWidth={2.3} />
              {t.receiveTab}
            </button>
          </nav>

          {/* <div className="header-actions">
            <button className="help-button" onClick={() => showToast('文件将在有效期后自动清理', 'info')}>
              <HelpCircle size={19} />
              <span>{t.help}</span>
            </button>
            <UserCircle className="avatar-icon" size={38} strokeWidth={1.5} />
          </div> */}
        </div>
      </header>

      <section className={`workspace ${currentTab === 'receive' ? 'is-receive' : ''}`}>
        {currentTab === 'send' ? (
          <div className="upload-card panel-card">
            <input ref={fileInputRef} type="file" multiple onChange={(e) => handleFileSelect(e.target.files)} className="visually-hidden" />

            {!isPasswordVerified && (
              <div className="password-gate">
                <div className="password-gate-title"><LockKeyhole size={16} /> {t.passwordLabel}</div>
                <div className="password-gate-controls">
                  <input
                    type="password"
                    value={uploadPassword}
                    onChange={(e) => setUploadPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !isVerifying) verifyPassword() }}
                    placeholder={t.passwordPlaceholder}
                    disabled={isVerifying}
                  />
                  <button onClick={verifyPassword} disabled={isVerifying || !uploadPassword.trim()}>{isVerifying ? '验证中' : t.verify}</button>
                </div>
                <p>{t.passwordHint}</p>
              </div>
            )}

            <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileSelect(e.dataTransfer.files) }}>
              <div className="upload-illustration"><Image src="/upload.png" alt="上传文件" width={260} height={190} className="upload-image" /></div>
              <h2>{t.dropzoneText}</h2>
              <p>{t.dropzoneHint}</p>
              <button className="choose-file-button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}><FolderOpen size={18} /> 选择文件</button>
            </div>

            {currentUpload && (
              <div className="upload-progress">
                <div className="upload-progress-heading"><span>{t.uploading}</span><strong>{Math.round(progress)}%</strong></div>
                <p>{currentUpload.filename} · {formatSize(currentUpload.size)}</p>
                <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
                <small>{formatSpeed(uploadSpeedBps)} · 剩余 {formatEta(uploadEtaSec)}</small>
              </div>
            )}

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

            {!currentUpload && isPasswordVerified && (
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
              <div className="receive-case-hint">取件码区分大小写</div>
              <div className={`receive-status ${receiveStatus.type === 'error' ? 'is-error' : receiveStatus.type === 'success' ? 'is-success' : ''}`}>{receiveStatus.text}</div>
            </div>
            <div className="receive-info-panel">
              <Image src="/download.png" alt="下载文件" width={360} height={260} className="download-image" />
              <h3>什么是取件码？</h3>
              <p>取件码是文件的唯一提取凭证</p>
              <p>输入正确的取件码后，即可安全下载文件。</p>
            </div>
          </div>
        )}

        {currentTab === 'send' && (
          <aside className="share-card panel-card">
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
          </aside>
        )}
      </section>

      <footer className="security-footer">
        <div><ShieldCheck size={19} /><span>{t.securityTip}</span></div>
        <span className="footer-copyright">© 2026 星七七 FilesGO 文件传输 · 2H Auto-Destruct</span>
        <button onClick={() => showToast('文件将在有效期后自动清理', 'info')}>{t.securityMore} <ChevronRight size={17} /></button>
      </footer>
    </main>
  )
}
