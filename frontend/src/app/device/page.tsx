'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

interface Device {
  id: string
  name: string
  token: string
}

interface PairedDevice {
  device_id: string
  name: string
  is_online: boolean
}

interface Message {
  id: string
  text: string
  fromDevice: boolean
  timestamp: number
  type?: string
  fileName?: string
  fileSize?: number
  fileCode?: string
  status?: string
}

interface PairingRequest {
  id: number
  from_device: string
  device_name: string
}

const translations = {
  zh: {
    deviceChat: "设备聊天",
    myDevice: "我的设备",
    pairedDevices: "已配对设备",
    noPairedDevices: "暂无配对设备",
    generatePairingKey: "生成配对码",
    inputPairingKey: "输入对方配对码",
    pairingKey: "配对码",
    pairingRequest: "配对请求",
    acceptPairing: "接受",
    rejectPairing: "拒绝",
    pairingSuccess: "配对成功",
    online: "在线",
    offline: "离线",
    lastSeen: "最后在线",
    sendMessageToDevice: "发送消息给设备...",
    noDeviceSelected: "请选择一个设备开始聊天",
    connecting: "连接中...",
    connected: "已连接",
    disconnected: "已断开",
    messageSent: "已发送",
    messageDelivered: "已送达",
    messageRead: "已读",
    sendFileToChat: "发送文件",
    dragFileHere: "拖拽文件到此处发送",
    copy: "复制",
    download: "下载",
    send: "发送",
    confirm: "确认",
    backToPickup: "返回取件码模式"
  }
}

export default function DeviceChatPage() {
  const t = translations.zh

  const [currentDevice, setCurrentDevice] = useState<Device | null>(null)
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [deviceMessages, setDeviceMessages] = useState<Record<string, Message[]>>({})
  const [isPairingDialogOpen, setIsPairingDialogOpen] = useState(false)
  const [pairingKey, setPairingKey] = useState('')
  const [inputPairingKey, setInputPairingKey] = useState('')
  const [pairingRequests, setPairingRequests] = useState<PairingRequest[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const [deviceInputMessage, setDeviceInputMessage] = useState('')
  const [isDarkMode, setIsDarkMode] = useState(false)
  
  const wsRef = useRef<WebSocket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  useEffect(() => {
    const savedDevice = localStorage.getItem('filesgo_device')
    if (savedDevice) {
      const device = JSON.parse(savedDevice)
      setCurrentDevice(device)
      connectWebSocket(device)
      loadPairedDevices(device.id)
    } else {
      initDevice()
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [deviceMessages, selectedDeviceId])

  const initDevice = async () => {
    try {
      const res = await fetch('/api/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_name: `Device-${Date.now().toString(36).slice(-4)}` })
      })
      const data = await res.json()
      const device = {
        id: data.device_id,
        name: `Device-${data.device_id.slice(0, 4)}`,
        token: data.token
      }
      localStorage.setItem('filesgo_device', JSON.stringify(device))
      setCurrentDevice(device)
      connectWebSocket(device)
    } catch (e) {
      console.error('Failed to init device:', e)
    }
  }

  const connectWebSocket = (device: Device) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws?device_id=${device.id}&device_name=${device.name}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleWebSocketMessage(data)
    }

    ws.onclose = () => {
      setWsConnected(false)
      console.log('WebSocket disconnected')
      setTimeout(() => {
        if (currentDevice) connectWebSocket(currentDevice)
      }, 3656)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'text':
      case 'file':
      case 'image':
        const fromDevice = data.from_device
        setDeviceMessages(prev => ({
          ...prev,
          [fromDevice]: [...(prev[fromDevice] || []), {
            id: data.message_id,
            text: data.content,
            fromDevice: true,
            timestamp: data.timestamp,
            type: data.message_type,
            fileName: data.file_name,
            fileSize: data.file_size,
            fileCode: data.file_code
          }]
        }))
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'message_status',
            message_id: data.message_id,
            status: 'delivered'
          }))
        }
        break

      case 'message_status':
        setDeviceMessages(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(deviceId => {
            updated[deviceId] = updated[deviceId].map(msg =>
              msg.id === data.message_id ? { ...msg, status: data.status } : msg
            )
          })
          return updated
        })
        break

      case 'pairing_request':
        setPairingRequests(prev => [...prev, {
          id: Date.now(),
          from_device: data.from_device,
          device_name: data.content
        }])
        break

      case 'device_status':
        if (currentDevice) loadPairedDevices(currentDevice.id)
        break

      case 'ping':
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'pong' }))
        }
        break
    }
  }

  const loadPairedDevices = async (deviceId: string) => {
    if (!deviceId) return
    try {
      const res = await fetch(`/api/pairing/list?device_id=${deviceId}`)
      const data = await res.json()
      setPairedDevices(data || [])
    } catch (e) {
      console.error('Failed to load paired devices:', e)
    }
  }

  const generatePairingKeyHandler = async () => {
    if (!currentDevice) return
    try {
      const res = await fetch(`/api/pairing/generate-key?device_id=${currentDevice.id}`, { method: 'POST' })
      const data = await res.json()
      setPairingKey(data.pairing_key)
    } catch (e) {
      console.error('Failed to generate pairing key:', e)
    }
  }

  const requestPairing = async () => {
    if (!currentDevice || !inputPairingKey.trim()) return
    try {
      const res = await fetch('/api/pairing/request', {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-Device-ID': currentDevice.id
        }),
        body: JSON.stringify({ target_key: inputPairingKey.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        alert(t.pairingSuccess)
        setInputPairingKey('')
        loadPairedDevices(currentDevice.id)
      } else {
        alert(data.error || 'Pairing failed')
      }
    } catch (e) {
      console.error('Failed to request pairing:', e)
    }
  }

  const acceptPairing = async (pairingId: number) => {
    try {
      await fetch('/api/pairing/accept', {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-Device-ID': currentDevice?.id || ''
        }),
        body: JSON.stringify({ pairing_id: pairingId })
      })
      setPairingRequests(prev => prev.filter(r => r.id !== pairingId))
      loadPairedDevices(currentDevice?.id || '')
    } catch (e) {
      console.error('Failed to accept pairing:', e)
    }
  }

  const rejectPairing = async (pairingId: number) => {
    try {
      await fetch('/api/pairing/reject', {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-Device-ID': currentDevice?.id || ''
        }),
        body: JSON.stringify({ pairing_id: pairingId })
      })
      setPairingRequests(prev => prev.filter(r => r.id !== pairingId))
    } catch (e) {
      console.error('Failed to reject pairing:', e)
    }
  }

  const sendDeviceMessage = async () => {
    if (!currentDevice || !selectedDeviceId || !deviceInputMessage.trim()) return

    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const message: Message = {
      id: messageId,
      text: deviceInputMessage,
      fromDevice: false,
      timestamp: Date.now(),
      status: 'sent'
    }

    setDeviceMessages(prev => ({
      ...prev,
      [selectedDeviceId]: [...(prev[selectedDeviceId] || []), message]
    }))
    setDeviceInputMessage('')

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text',
        to_device: selectedDeviceId,
        message_id: messageId,
        message_type: 'text',
        content: deviceInputMessage
      }))
    }
  }

  const sendFileToDevice = async (file: File) => {
    if (!currentDevice || !selectedDeviceId) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-Upload-Password': 'filesgo123' },
        body: formData
      })
      const data = await res.json()

      if (data.code) {
        const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const message: Message = {
          id: messageId,
          text: '',
          fromDevice: false,
          timestamp: Date.now(),
          type: 'file',
          fileName: file.name,
          fileSize: file.size,
          fileCode: data.code,
          status: 'sent'
        }

        setDeviceMessages(prev => ({
          ...prev,
          [selectedDeviceId]: [...(prev[selectedDeviceId] || []), message]
        }))

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'file',
            to_device: selectedDeviceId,
            message_id: messageId,
            message_type: file.type.startsWith('image/') ? 'image' : 'file',
            content: '',
            file_name: file.name,
            file_size: file.size,
            file_code: data.code
          }))
        }
      }
    } catch (e) {
      console.error('Failed to send file:', e)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      sendFileToDevice(files[0])
    }
  }

  const selectedDevice = pairedDevices.find(d => d.device_id === selectedDeviceId)
  const messages = deviceMessages[selectedDeviceId || ''] || []

  return (
    <div className={`filesgo-theme h-screen overflow-hidden ${isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="flex h-screen">
        <div className="w-72 bg-white/90 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="theme-panel p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t.deviceChat}</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-xs text-gray-500">{wsConnected ? t.connected : t.disconnected}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/" className="theme-secondary-btn flex-1 text-center py-2 px-3 text-sm rounded-lg transition-colors text-gray-700 dark:text-gray-200">
                {t.backToPickup}
              </Link>
              <button
                onClick={() => setIsPairingDialogOpen(true)}
                className="theme-primary-btn flex-1 py-2 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                + {t.pairingKey}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 px-2 mb-2">{t.pairedDevices}</p>
            {pairedDevices.length === 0 ? (
              <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">{t.noPairedDevices}</p>
            ) : (
              pairedDevices.map(device => (
                <button
                  key={device.device_id}
                  onClick={() => setSelectedDeviceId(device.device_id)}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                    selectedDeviceId === device.device_id
                      ? 'theme-chip bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{device.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {device.is_online ? t.online : t.offline}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {currentDevice && (
            <div className="theme-chip p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t.myDevice}</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{currentDevice.name}</p>
              <p className="text-xs text-gray-400 font-mono truncate">{currentDevice.id}</p>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col bg-transparent dark:bg-gray-900">
          {selectedDeviceId ? (
            <>
              <div className="theme-panel p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${selectedDevice?.is_online ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-white">{selectedDevice?.name}</h2>
                    <p className="text-xs text-gray-500">{selectedDevice?.is_online ? t.online : t.offline}</p>
                  </div>
                </div>
              </div>

              <div
                className="flex-1 overflow-y-auto p-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="max-w-3xl mx-auto space-y-3">
                  {messages.map((msg, index) => (
                    <div
                      key={msg.id || index}
                      className={`flex ${msg.fromDevice ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className={`max-w-[70%] rounded-2xl p-3 ${
                        msg.fromDevice
                          ? 'theme-chip bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                          : 'theme-primary-btn bg-blue-600 text-white'
                      }`}>
                        {msg.type === 'file' || msg.type === 'image' ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-sm font-medium">{msg.fileName}</span>
                            </div>
                            <p className="text-xs opacity-70">{formatFileSize(msg.fileSize || 0)}</p>
                            {msg.fileCode && (
                              <button
                                onClick={() => window.open(`/api/download/${msg.fileCode}`, '_blank')}
                                className={`text-sm px-3 py-1 rounded-lg ${
                                  msg.fromDevice
                                    ? 'theme-secondary-btn bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                                    : 'theme-primary-btn bg-blue-500 text-white'
                                }`}
                              >
                                {t.download}
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        )}
                        <div className="flex items-center justify-end gap-2 mt-1">
                          <span className="text-xs opacity-50">
                            {new Date(msg.timestamp * 1000 || msg.timestamp).toLocaleTimeString()}
                          </span>
                          {!msg.fromDevice && msg.status && (
                            <span className="text-xs opacity-50">
                              {msg.status === 'sent' && '✓'}
                              {msg.status === 'delivered' && '✓✓'}
                              {msg.status === 'read' && '✓✓'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="theme-panel p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <div className="max-w-3xl mx-auto flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        sendFileToDevice(e.target.files[0])
                      }
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="theme-secondary-btn p-3 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    value={deviceInputMessage}
                    onChange={(e) => setDeviceInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendDeviceMessage()}
                    placeholder={t.sendMessageToDevice}
                    className="theme-input flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                  <button
                    onClick={sendDeviceMessage}
                    className="theme-primary-btn px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                  >
                    {t.send}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">{t.noDeviceSelected}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {isPairingDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="theme-panel bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t.pairingKey}</h2>
              <button
                onClick={() => setIsPairingDialogOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t.myDevice}</p>
                <div className="theme-chip p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p className="text-xs font-mono text-gray-600 dark:text-gray-300">{currentDevice?.id}</p>
                  <p className="text-xs text-gray-400 mt-1">{currentDevice?.name}</p>
                </div>
              </div>

              {pairingKey && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t.generatePairingKey}</p>
                  <div className="theme-chip p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-center">
                    <p className="text-2xl font-mono font-bold tracking-wider text-blue-600 dark:text-blue-400">{pairingKey}</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pairingKey)
                      alert(t.copy + '!')
                    }}
                    className="theme-secondary-btn w-full mt-2 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                  >
                    {t.copy}
                  </button>
                </div>
              )}

              <button
                onClick={generatePairingKeyHandler}
                className="theme-secondary-btn w-full py-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200 font-medium"
              >
                {t.generatePairingKey}
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t.inputPairingKey}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputPairingKey}
                    onChange={(e) => setInputPairingKey(e.target.value.toUpperCase())}
                    placeholder={t.inputPairingKey}
                    className="theme-input flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono tracking-widest"
                    maxLength={16}
                  />
                  <button
                    onClick={requestPairing}
                    className="theme-warm px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    {t.confirm}
                  </button>
                </div>
              </div>

              {pairingRequests.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t.pairingRequest}</p>
                  {pairingRequests.map(req => (
                    <div key={req.id} className="theme-chip flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg mb-2">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{req.device_name}</p>
                        <p className="text-xs text-gray-400">{req.from_device}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => acceptPairing(req.id)}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                        >
                          {t.acceptPairing}
                        </button>
                        <button
                          onClick={() => rejectPairing(req.id)}
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                        >
                          {t.rejectPairing}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
