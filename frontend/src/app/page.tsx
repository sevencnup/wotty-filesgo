'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'

const translations = {
  zh: {
    title: 'FilesGO',
    subtitle: '安全 · 高效',
    sendTab: '我要发送',
    receiveTab: '我要接收',
    passwordPlaceholder: '请输入上传密码',
    passwordHint: '需要密码才能上传文件',
    dropzoneText: '点击或拖拽文件',
    dropzoneHint: '支持任意格式 · 最大 10GB',
    uploading: '正在上传...',
    waiting: '等待',
    uploadComplete: '上传完成',
    pickupCode: '取件码',
    clickToCopy: '点击复制取件码',
    shareLink: '分享链接',
    copyLink: '复制链接',
    copyAllCodes: '复制全部取件码',
    continueSend: '继续发送',
    enterCode: '输入 6 位取件码',
    downloadBtn: '立即下载',
    finding: '正在查找...',
    fileFound: '找到文件',
    downloading: '正在下载...',
    fileNotFound: '文件不存在或已过期',
    networkError: '网络错误',
    downloadStarted: '下载已开始',
    footer: '© 2026 星七七  FilesGO 文件传输· 2H Auto-Destruct',
    passwordError: '密码错误，请重新输入',
    passwordVerifyFailed: '密码验证失败',
    copied: '已复制',
    codeCopied: '取件码已复制',
    linkCopied: '链接已复制',
    encrypting: '正在加密',
    encryptFailed: '加密失败，是否以明文继续上传？',
    uploadFailed: '上传失败',
    uploadCancelled: '上传已取消',
    uploadTimeout: '上传超时',
    networkOrCancelled: '网络错误或上传被取消',
    confirmCancel: '确定要取消上传',
    fileTooLarge: '超过 10GB 限制，已跳过',
  }
}

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState<'send' | 'receive'>('send')
  const [uploadPassword, setUploadPassword] = useState('')
  const [isPasswordVerified, setIsPasswordVerified] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<any[]>([])
  const [uploadResults, setUploadResults] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [currentUpload, setCurrentUpload] = useState<any>(null)
  const [progress, setProgress] = useState(0)
  const [receiveCode, setReceiveCode] = useState('')
  const [receiveStatus, setReceiveStatus] = useState({ text: '', type: '' })
  const [isDownloading, setIsDownloading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const t = translations.zh

  const showToast = useCallback((message: string, type: string = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  useEffect(() => {
    const path = window.location.pathname
    const urlParams = new URLSearchParams(window.location.search)
    let potentialCode = urlParams.get('code')
    
    if (!potentialCode) {
      const match = path.match(/\/([A-Z0-9]{6})\/?$/i)
      if (match && match[1]) {
        potentialCode = match[1]
      }
    }
    
    if (potentialCode) {
      potentialCode = potentialCode.toUpperCase()
      setCurrentTab('receive')
      setReceiveCode(potentialCode)
    }
  }, [])

  const verifyPassword = async () => {
    if (!uploadPassword.trim()) return
    try {
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: uploadPassword.trim() })
      })
      const data = await res.json()
      
      if (data.valid) {
        setIsPasswordVerified(true)
      } else {
        showToast(t.passwordError, 'error')
        setUploadPassword('')
      }
    } catch (e) {
      showToast(t.passwordVerifyFailed, 'error')
    }
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    const MAX_SIZE = 10 * 1024 * 1024 * 1024
    const newFiles: any[] = []
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > MAX_SIZE) {
        showToast(`${file.name} ${t.fileTooLarge}`, 'error')
        continue
      }
      newFiles.push({
        id: Date.now() + Math.random().toString(36).substring(2),
        file,
        status: 'waiting'
      })
    }
    
    if (newFiles.length > 0) {
      setUploadQueue(prev => [...prev, ...newFiles])
    }
  }

  const removeFromQueue = (index: number) => {
    const item = uploadQueue[index]
    if (!item) return

    if (item.status === 'uploading') {
      if (confirm(`${t.confirmCancel} "${item.file.name}"?`)) {
        if (xhrRef.current) {
          xhrRef.current.abort()
          xhrRef.current = null
        }
      }
      return
    }
    
    setUploadQueue(prev => prev.filter((_, i) => i !== index))
  }

  const encryptBuffer = async (buffer: ArrayBuffer, password: string) => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const enc = new TextEncoder()
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    )
    
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    )
    
    const encryptedContent = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      buffer
    )
    
    const result = new Uint8Array(16 + 12 + encryptedContent.byteLength)
    result.set(salt, 0)
    result.set(iv, 16)
    result.set(new Uint8Array(encryptedContent), 28)
    
    return result
  }

  const uploadSingleFile = async (file: File): Promise<{ code: string }> => {
    let fileToSend: File | Blob = file
    
    if (uploadPassword) {
      try {
        const buffer = await file.arrayBuffer()
        const encryptedData = await encryptBuffer(buffer, uploadPassword)
        fileToSend = new Blob([encryptedData], { type: 'application/octet-stream' })
      } catch (e) {
        if (!confirm(t.encryptFailed)) {
          throw new Error('User cancelled')
        }
      }
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          setProgress(percent)
        }
      })

      xhr.addEventListener('load', () => {
        xhrRef.current = null
        try {
          const data = JSON.parse(xhr.responseText)
          if (xhr.status === 200 && data.code) {
            resolve({ code: data.code })
          } else {
            reject(new Error(data.error || t.uploadFailed))
          }
        } catch {
          reject(new Error(t.uploadFailed))
        }
      })

      xhr.addEventListener('error', () => {
        xhrRef.current = null
        reject(new Error(t.networkOrCancelled))
      })
      
      xhr.addEventListener('abort', () => {
        xhrRef.current = null
        reject(new Error(t.uploadCancelled))
      })

      xhr.timeout = 30 * 60 * 1000
      xhr.addEventListener('timeout', () => {
        xhrRef.current = null
        reject(new Error(t.uploadTimeout))
      })

      const formData = new FormData()
      formData.append('file', fileToSend, file.name)
      
      xhr.open('POST', '/api/upload', true)
      xhr.setRequestHeader('X-Upload-Password', uploadPassword)
      xhr.send(formData)
    })
  }

  const processQueue = useCallback(async () => {
    if (isUploading || uploadQueue.length === 0) return
    
    const waitingIndex = uploadQueue.findIndex(item => item.status === 'waiting')
    if (waitingIndex === -1) return
    
    setIsUploading(true)
    const currentItem = uploadQueue[waitingIndex]
    
    setUploadQueue(prev => prev.map((item, i) => 
      i === waitingIndex ? { ...item, status: 'uploading' } : item
    ))
    
    setCurrentUpload({ filename: currentItem.file.name, size: currentItem.file.size })
    setProgress(0)
    
    try {
      const result = await uploadSingleFile(currentItem.file)
      
      setUploadResults(prev => [...prev, {
        filename: currentItem.file.name,
        code: result.code,
        size: currentItem.file.size,
        download_url: window.location.origin + '/' + result.code
      }])
      
      setUploadQueue(prev => prev.filter((_, i) => i !== waitingIndex))
    } catch (e: any) {
      showToast(`${currentItem.file.name} ${e.message}`, 'error')
      setUploadQueue(prev => prev.filter((_, i) => i !== waitingIndex))
    }
    
    setIsUploading(false)
    setCurrentUpload(null)
  }, [isUploading, uploadQueue, uploadPassword])

  useEffect(() => {
    if (uploadQueue.some(item => item.status === 'waiting') && !isUploading) {
      processQueue()
    }
  }, [uploadQueue, isUploading, processQueue])

  const handleDownload = async () => {
    const code = receiveCode.trim().toUpperCase()
    if (code.length !== 6) {
      setReceiveStatus({ text: '请输入 6 位提取码', type: 'error' })
      return
    }

    setIsDownloading(true)
    setReceiveStatus({ text: t.finding, type: 'info' })

    try {
      const res = await fetch(`/api/file/${code}`)
      if (res.ok) {
        const file = await res.json()
        setReceiveStatus({ text: `${t.fileFound}: ${file.filename} (${formatSize(file.size)})`, type: 'success' })
        window.location.href = `/api/download/${code}`
        
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

  const copyToClipboard = (text: string, successMessage: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage, 'success')
    })
  }

  const resetUpload = () => {
    setUploadQueue([])
    setUploadResults([])
    setIsPasswordVerified(false)
    setUploadPassword('')
    setCurrentUpload(null)
    setProgress(0)
  }

  return (
    <div className="h-screen text-slate-800 font-sans flex flex-col relative overflow-hidden">

      {toast && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 ${
          toast.type === 'error' ? 'bg-red-500' : toast.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        } text-white`}>
          {toast.message}
        </div>
      )}

      <div className="container mx-auto px-4 py-6 md:py-12 max-w-xl flex-grow flex flex-col justify-center">
        <header className="mb-6 md:mb-12 flex items-center justify-center gap-x-4 md:gap-x-6">
          <div className="inline-flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="Logo" width={96} height={96} className="w-16 h-16 md:w-24 md:h-24 object-contain" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-0 md:mb-1 tracking-tight">{t.title}</h1>
            <p className="text-slate-500 text-sm md:text-base font-medium">{t.subtitle}</p>
          </div>
        </header>

        <div className="glass rounded-3xl border border-white/60 overflow-hidden transition-all duration-300">
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setCurrentTab('send')}
              className={`flex-1 py-4 md:py-5 text-center text-sm tracking-wide transition-all ${currentTab === 'send' ? 'tab-active' : 'tab-inactive'}`}
            >
              {t.sendTab}
            </button>
            <button
              onClick={() => setCurrentTab('receive')}
              className={`flex-1 py-4 md:py-5 text-center text-sm tracking-wide transition-all ${currentTab === 'receive' ? 'tab-active' : 'tab-inactive'}`}
            >
              {t.receiveTab}
            </button>
          </div>

          <div className="p-6 md:p-10 min-h-[380px] md:min-h-[460px] flex flex-col justify-center">
            {currentTab === 'send' ? (
              <div className="space-y-6">
                {!isPasswordVerified ? (
                  <div>
                    <input
                      type="password"
                      value={uploadPassword}
                      onChange={(e) => setUploadPassword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && verifyPassword()}
                      onBlur={() => uploadPassword.trim() && verifyPassword()}
                      placeholder={t.passwordPlaceholder}
                      className="block w-full px-4 py-4 text-base text-slate-800 border-2 border-slate-200 rounded-xl focus:ring-0 focus:border-blue-500 focus:bg-white placeholder-slate-300 bg-slate-50 transition-all outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-2 ml-1">{t.passwordHint}</p>
                  </div>
                ) : (
                  <>
                    {uploadQueue.length > 0 && (
                      <div className="space-y-3">
                        {uploadQueue.map((item, index) => (
                          <div key={item.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{item.file.name}</p>
                                <p className="text-xs text-slate-400">{formatSize(item.file.size)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {item.status === 'uploading' ? (
                                <span className="text-xs text-blue-600 font-medium animate-pulse">{t.uploading}</span>
                              ) : (
                                <span className="text-xs text-slate-400">{t.waiting}</span>
                              )}
                              <button onClick={() => removeFromQueue(index)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                                <svg className="w-4 h-4 text-slate-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {currentUpload && (
                      <div className="text-center py-4">
                        <p className="text-slate-600 font-medium mb-3">{t.uploading}: {currentUpload.filename}</p>
                        <div className="w-full max-w-xs mx-auto mb-2">
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 font-medium">{progress}%</p>
                      </div>
                    )}

                    {uploadResults.length > 0 && (
                      <div className="space-y-4">
                        {uploadResults.map((result, index) => (
                          <div key={index} className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-5">
                            <div className="flex items-start justify-between mb-3">
                              <p className="text-slate-700 text-sm font-medium truncate pr-2">{result.filename}</p>
                              <span className="text-xs text-slate-400 whitespace-nowrap bg-blue-100/50 px-2 py-0.5 rounded">{t.pickupCode}</span>
                            </div>
                            <div 
                              onClick={() => copyToClipboard(result.code, t.codeCopied)}
                              className="text-3xl font-mono font-bold tracking-[0.15em] text-blue-600 cursor-pointer hover:bg-blue-200/50 rounded-xl p-3 transition-all text-center mb-3 select-all"
                            >
                              {result.code}
                            </div>
                            <p className="text-xs text-slate-400 text-center mb-4">{t.clickToCopy}</p>
                            
                            <div className="border-t border-blue-200/50 pt-4 mt-2">
                              <p className="text-xs text-slate-400 mb-2 text-left">{t.shareLink}</p>
                              <div className="flex items-center gap-2 bg-white/80 rounded-xl p-2.5 border border-blue-200/50 shadow-sm">
                                <input type="text" readOnly className="flex-1 text-xs text-slate-600 bg-transparent outline-none font-mono truncate" value={result.download_url} />
                                <button onClick={() => copyToClipboard(result.download_url, t.linkCopied)} className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
                                  {t.copyLink}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        <div className="bg-slate-50/80 border border-slate-200/50 rounded-xl p-4 flex items-center justify-center gap-4">
                          <button onClick={resetUpload} className="text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            {t.continueSend}
                          </button>
                        </div>
                      </div>
                    )}

                    {!currentUpload && uploadQueue.length === 0 && uploadResults.length === 0 && (
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={(e) => handleFileSelect(e.target.files)}
                          className="hidden"
                        />
                        <label
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleFileSelect(e.dataTransfer.files)
                          }}
                          className="flex flex-col items-center justify-center w-full h-48 md:h-56 border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group relative overflow-hidden"
                        >
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 z-10">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                              <svg className="w-8 h-8 text-slate-400 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </div>
                            <p className="mb-2 text-base font-medium text-slate-600">{t.dropzoneText}</p>
                            <p className="text-xs text-slate-400">{t.dropzoneHint}</p>
                          </div>
                        </label>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-3 ml-1">{t.enterCode}</label>
                  <input
                    type="text"
                    value={receiveCode}
                    onChange={(e) => setReceiveCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    placeholder="A1B2C3"
                    className="block w-full px-4 py-5 text-2xl font-mono text-center text-slate-800 border-2 border-slate-200 rounded-xl focus:ring-0 focus:border-blue-500 focus:bg-white placeholder-slate-300 uppercase tracking-[0.2em] bg-slate-50 transition-all outline-none"
                  />
                </div>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl text-base font-semibold hover:bg-blue-700 active:transform active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isDownloading ? t.finding : t.downloadBtn}
                </button>
                <div className={`text-center text-xs min-h-[20px] font-medium ${
                  receiveStatus.type === 'error' ? 'text-red-500' :
                  receiveStatus.type === 'success' ? 'text-green-600' : 'text-slate-400'
                }`}>
                  {receiveStatus.text}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <footer className="mt-8 md:mt-12 text-center">
          <p className="text-slate-400 text-xs font-medium tracking-widest uppercase mb-3">
            {t.footer}
          </p>
        </footer>
      </div>
    </div>
  )
}
