import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Settings, Moon, Sun, Menu, User, CreditCard, MessageSquare, X, UserPlus, LogOut, Copy, Globe, Trash2, ChevronDown, MoreVertical, Edit2, Check, ExternalLink, RefreshCw, Pause, HelpCircle, Edit, Download, Trash } from 'lucide-react'

const translations = {
  zh: {
    newChat: "新建聊天",
    settings: "设置",
    subscription: "订阅",
    account: "账号",
    switchAccount: "切换账号",
    logout: "退出账号",
    appearance: "外观",
    customizeAppearance: "自定义应用的外观",
    theme: "主题",
    light: "浅色",
    dark: "深色",
    system: "系统",
    fontSize: "字体大小",
    languageAndRegion: "语言和地区",
    setPreferredLanguage: "设置您的首选语言",
    selectLanguage: "选择语言",
    privacy: "隐私",
    managePrivacy: "管理您的隐私设置",
    whoCanSeeProfile: "谁可以看到我的个人资料",
    everyone: "所有人",
    friendsOnly: "仅好友",
    onlyMe: "仅自己",
    twoFactorAuth: "两步验证",
    manageAccount: "管理您的账户设置",
    deleteAccount: "删除账户",
    subscriptionPlans: "订阅计划",
    chooseDuration: "选择订阅时长",
    choosePayment: "选择支付方式",
    confirmSubscription: "确认订阅",
    sendMessage: "发送",
    inputPlaceholder: "输入你的消息...",
    AIChat: "AI 聊天",
    rename: "重命名",
    export: "导出",
    delete: "删除",
    help: "帮助",
    notifications: "通知",
    cancel: "取消",
    finish: "完成",
    edit: "编辑",
    copy: "复制",
    monthlySubscription: '月度订阅',
    quarterlySubscription: '季度订阅',
    yearlySubscription: '年度订阅',
    monthlyPrice: '￥39/月',
    quarterlyPrice: '￥99/季',
    yearlyPrice: '￥299/年',
    emailNotifications: '邮箱通知',
    manageNotifications: '管理通知设置',
    accessibility: '辅助功能',
    manageAccessibility: '管理辅助功能设置',
    highContrast: '高对比度',
    dataUsage: '数据使用',
    manageDataUsage: '管理数据使用设置',
    dataSaver: '数据节省模式',
    helpTitle: "帮助中心",
    usefulTips: "有用的提示",
    tip1: "使用 '/' 快速访问常用命令",
    tip2: "双击消息可以快速编辑",
    tip3: "使用 Ctrl+Enter 快速发送消息",
    contactSupport: "联系客服",
    qqSupport: "QQ 客服",
    enterNewName: "输入新的对话名称",
    confirmDelete: "确定要删除这个对话吗？",
    errorMessage: "抱歉，发生了错误。请重试。",
    regenerate: "重新生成",
    interrupt: "中断",
    noEmptyChat: "无法保存空聊天",
    switchModel: "切换模型",
    confirm: "确认",
    welcomeMessage: "欢迎使用世问 AI，有什么可以帮助你的？",
    '支付宝': '支付宝',
    '微信': '微信'
  },
  en: {
    newChat: "New Chat",
    settings: "Settings",
    subscription: "Subscription",
    account: "Account",
    switchAccount: "Switch Account",
    logout: "Logout",
    appearance: "Appearance",
    customizeAppearance: "Customize the app's appearance",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    fontSize: "Font Size",
    languageAndRegion: "Language and Region",
    setPreferredLanguage: "Set your preferred language",
    selectLanguage: "Select language",
    privacy: "Privacy",
    managePrivacy: "Manage your privacy settings",
    whoCanSeeProfile: "Who can see my profile",
    everyone: "Everyone",
    friendsOnly: "Friends only",
    onlyMe: "Only me",
    twoFactorAuth: "Two-factor authentication",
    manageAccount: "Manage your account settings",
    deleteAccount: "Delete account",
    subscriptionPlans: "Subscription Plans",
    chooseDuration: "Choose subscription duration",
    choosePayment: "Choose payment method",
    confirmSubscription: "Confirm Subscription",
    sendMessage: "Send",
    inputPlaceholder: "Type your message...",
    AIChat: "AI Chat",
    rename: "Rename",
    export: "Export",
    delete: "Delete",
    help: "Help",
    notifications: "Notifications",
    cancel: "Cancel",
    finish: "Finish",
    edit: "Edit",
    copy: "Copy",
    monthlySubscription: 'Monthly',
    quarterlySubscription: 'Quarterly',
    yearlySubscription: 'Yearly',
    monthlyPrice: '$39/month',
    quarterlyPrice: '$99/quarter',
    yearlyPrice: '$299/year',
    emailNotifications: 'Email Notifications',
    manageNotifications: 'Manage Notification Settings',
    accessibility: 'Accessibility',
    manageAccessibility: 'Manage Accessibility Settings',
    highContrast: 'High Contrast',
    dataUsage: 'Data Usage',
    manageDataUsage: 'Manage Data Usage Settings',
    dataSaver: 'Data Saver',
    helpTitle: "Help Center",
    usefulTips: "Useful Tips",
    tip1: "Use '/' to quickly access common commands",
    tip2: "Double-click a messages to quickly edit it",
    tip3: "Use Ctrl+Enter to quickly send a message",
    contactSupport: "Contact Support",
    qqSupport: "QQ Support",
    enterNewName: "Enter new conversation name",
    confirmDelete: "Are you sure you want to delete this conversation?",
    errorMessage: "Sorry, an error occurred. Please try again.",
    regenerate: "Regenerate",
    interrupt: "Interrupt",
    noEmptyChat: "Cannot save empty chat",
    switchModel: "Switch Model",
    confirm: "Confirm",
    welcomeMessage: "Welcome to Shiwen AI. How can I assist you?",
    '支付宝': 'Alipay',
    '微信': 'WeChat'
  },
}

function AIChat() {
  const [conversations, setConversations] = useState([])
  const [currentConversationId, setCurrentConversationId] = useState(1)
  const [inputMessage, setInputMessage] = useState("")
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('monthly')
  const [selectedPayment, setSelectedPayment] = useState(undefined)
  const [currentUser] = useState({ email: 'abc123@example.com' })
  const [currentModel, setCurrentModel] = useState('gpt-3.5-turbo')
  const [language, setLanguage] = useState('zh')
  const [pastedImage, setPastedImage] = useState(null)
  const [editingMessageIndex, setEditingMessageIndex] = useState(null)
  const [editedMessage, setEditedMessage] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [theme, setTheme] = useState('system')
  const [fontSize, setFontSize] = useState(16)
  const [privacy, setPrivacy] = useState('friends')
  const [twoFactor, setTwoFactor] = useState(false)

  const t = (key) => translations[language][key] || key

  const currentConversation = conversations.find(conv => conv.id === currentConversationId) || conversations[0] || { id: 1, name: t('newChat'), messages: [] }
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  const models = [
    { id: 'gpt-4o', name: 'GPT 4O', apiEndpoint: 'https://api.openai.com/v1/chat/completions' },
    { id: 'gpt-4o-mini', name: 'GPT 4O mini', apiEndpoint: 'https://api.openai.com/v1/chat/completions' },
    { id: 'chatgpt-o1-preview', name: 'ChatGPT o1-preview', apiEndpoint: 'https://api.openai.com/v1/chat/completions' },
    { id: 'chatgpt-o1-mini', name: 'ChatGPT o1-Mini', apiEndpoint: 'https://api.openai.com/v1/chat/completions' },
    { id: 'claude-3.5-sonnet', name: 'Claude-3.5 Sonnet', apiEndpoint: 'https://api.anthropic.com/v1/complete' },
    { id: 'claude-3-opus', name: 'Claude-3 Opus', apiEndpoint: 'https://api.anthropic.com/v1/complete' },
    { id: 'doubao', name: '豆包大模型', apiEndpoint: 'https://api.doubao.com/v1/chat/completions' },
    { id: 'wenxin', name: '文心一言', apiEndpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinyiyan/chat' },
    { id: 'llama-3.1-405b', name: 'Llama-3.1 405B', apiEndpoint: 'https://api.llama.ai/v1/chat/completions' },
    { id: 'gemini-pro', name: 'Gemini Pro', apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent' },
    { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent' },
  ]

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    if (theme === 'system') {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      root.classList.add(systemTheme)
      setIsDarkMode(systemTheme === "dark")
    } else {
      root.classList.add(theme)
      setIsDarkMode(theme === "dark")
    }
  }, [theme])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [currentConversation.messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 5 * 24)}px`
    }
  }, [inputMessage])

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`
  }, [fontSize])

  useEffect(() => {
    setConversations([])
  }, [])

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "") return

    const formattedMessage = typeof inputMessage === 'string' && isCodeBlock(inputMessage)
      ? inputMessage
      : inputMessage.trim()

    setConversations(prevConversations => {
      const updatedConversations = prevConversations.map(conv => {
        if (conv.id === currentConversationId) {
          return {
            ...conv,
            messages: [
              ...conv.messages,
              { text: formattedMessage, isAi: false, language: detectLanguage(formattedMessage) }
            ]
          }
        }
        return conv
      })

      if (!updatedConversations.some(conv => conv.id === currentConversationId)) {
        return [
          ...updatedConversations,
          {
            id: currentConversationId,
            name: `${t('newChat')} ${currentConversationId}`,
            messages: [{ text: formattedMessage, isAi: false, language: detectLanguage(formattedMessage) }]
          }
        ]
      }

      return updatedConversations
    })

    setInputMessage("")

    setTimeout(() => {
      setConversations(prevConversations => {
        return prevConversations.map(conv => {
          if (conv.id === currentConversationId) {
            return {
              ...conv,
              messages: [
                ...conv.messages,
                { 
                  text: formattedMessage || "I'm sorry, I didn't receive a message. Could you please try again?", 
                  isAi: true, 
                  language: detectLanguage(formattedMessage || ""),
                  model: currentModel
                }
              ]
            }
          }
          return conv
        })
      })
    }, 1000)
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  const createNewConversation = () => {
    if (currentConversation.messages.length === 0) {
      return
    }
    const newId = conversations.length + 1
    const newConversation = {
      id: newId,
      name: `${t('newChat')} ${newId}`,
      messages: []
    }
    setConversations([...conversations, newConversation])
    setCurrentConversationId(newId)
  }

  const isCodeBlock = (text) => {
    if (typeof text !== 'string') {
      return false
    }
    return text.trim().startsWith('```') && text.trim().endsWith('```')
  }

  const renderMessage = (message) => {
    if (typeof message.text !== 'string') {
      return String(message.text || "")
    }

    if (isCodeBlock(message.text)) {
      const code = message.text.replace(/```[\s\S]*?\n([\s\S]*?)```/g, '$1').trim()
      return (
        <div className="relative">
          <button
            className="absolute top-2 right-2 bg-gray-700/50 hover:bg-gray-700 text-white p-1 rounded"
            onClick={() => copyToClipboard(code)}
          >
            <Copy className="h-4 w-4" />
          </button>
          <pre className="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto">
            <code>{code}</code>
          </pre>
        </div>
      )
    } else if (message.isAi) {
      return (
        <div>
          <div className="text-xs text-gray-500 mb-1">
            {models.find(m => m.id === message.model)?.name || 'Unknown Model'}
          </div>
          <span>{message.text || ""}</span>
        </div>
      )
    } else {
      return message.text || ""
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Text copied to clipboard')
    }, (err) => {
      console.error('Could not copy text: ', err)
    })
  }

  const handleCopyMessage = (text) => {
    copyToClipboard(text)
  }

  const handleDeleteAccount = () => {
    console.log('Account deletion requested')
  }

  const handleRenameConversation = (id) => {
    const newName = prompt(t('enterNewName'))
    if (newName) {
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === id ? { ...conv, name: newName } : conv
        )
      )
    }
  }

  const handleExportConversation = (id) => {
    const conversation = conversations.find(conv => conv.id === id)
    if (conversation) {
      const jsonStr = JSON.stringify(conversation, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = `conversation_${id}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const handleDeleteConversation = (id) => {
    if (confirm(t('confirmDelete'))) {
      setConversations(prevConversations =>
        prevConversations.filter(conv => conv.id !== id)
      )
      if (currentConversationId === id) {
        setCurrentConversationId(conversations[0]?.id || 1)
      }
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile()
          const reader = new FileReader()
          reader.onload = (event) => {
            setPastedImage(event.target?.result)
          }
          reader.readAsDataURL(blob)
        }
      }
    }
  }

  const handleRemoveImage = () => {
    setPastedImage(null)
  }

  const handleEditMessage = (index) => {
    setEditingMessageIndex(index)
    setEditedMessage(currentConversation.messages[index].text)
  }

  const handleCancelEdit = () => {
    setEditingMessageIndex(null)
    setEditedMessage("")
  }

  const handleFinishEdit = () => {
    if (editingMessageIndex !== null) {
      const updatedConversations = conversations.map(conv => {
        if (conv.id === currentConversationId) {
          const updatedMessages = [...conv.messages]
          updatedMessages[editingMessageIndex] = {
            ...updatedMessages[editingMessageIndex],
            text: editedMessage
          }
          if (editingMessageIndex + 1 < updatedMessages.length && updatedMessages[editingMessageIndex + 1].isAi) {
            updatedMessages.splice(editingMessageIndex + 1, 1)
          }
          return { ...conv, messages: updatedMessages }
        }
        return conv
      })
      setConversations(updatedConversations)
      setEditingMessageIndex(null)
      setEditedMessage("")
    }
  }

  const handleDeleteMessage = (index) => {
    const updatedConversations = conversations.map(conv => {
      if (conv.id === currentConversationId) {
        const updatedMessages = conv.messages.filter((_, i) => {
          if (i === index) {
            if (!conv.messages[i].isAi && conv.messages[i + 1]?.isAi) {
              return false
            }
            if (conv.messages[i].isAi && !conv.messages[i - 1]?.isAi) {
              return false
            }
          }
          return i !== index && i !== index + 1
        })
        return { ...conv, messages: updatedMessages }
      }
      return conv
    })
    setConversations(updatedConversations)
  }

  const detectLanguage = (text) => {
    return /[a-zA-Z]/.test(text) ? 'en' : 'zh'
  }

  const handleRegenerateResponse = async (index, modelId) => {
    console.log('Regenerating response for model:', modelId)
  }

  const handleInterruptResponse = () => {
    setIsStreaming(false)
  }

  const subscriptionPlans = [
    { id: 'monthly', nameKey: 'monthlySubscription', priceKey: 'monthlyPrice' },
    { id: 'quarterly', nameKey: 'quarterlySubscription', priceKey: 'quarterlyPrice' },
    { id: 'yearly', nameKey: 'yearlySubscription', priceKey: 'yearlyPrice' },
  ]

  const paymentMethods = [
    { id: '支付宝', nameKey: '支付宝' },
    { id: '微信', nameKey: '微信' },
  ]

  return (
    <div className={`min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 ${isDarkMode ? 'dark' : ''}`}>
      <div className="w-full max-w-[80%] sm:max-w-[90%] h-[90vh] sm:h-[95vh] bg-white dark:bg-gray-800 rounded-[5%] sm:rounded-[2.5%] shadow-2xl overflow-hidden flex relative">
        {/* 侧边栏 */}
        <div className={`bg-gray-50 dark:bg-gray-900 flex flex-col ${isSidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden`}>
          <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t('AIChat')}</h1>
            <button 
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              onClick={createNewConversation}
              disabled={currentConversation.messages.length === 0}
              title={t('newChat')}
            >
              <MessageSquare className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
          <div className="flex-grow overflow-y-auto p-2">
            {conversations.map(conv => (
              <div key={conv.id} className="flex justify-between items-center mb-1 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                <button
                  className="flex-1 text-left truncate text-sm text-gray-700 dark:text-gray-200"
                  onClick={() => setCurrentConversationId(conv.id)}
                >
                  {conv.name}
                </button>
                <div className="relative">
                  <button className="p-1 hover:bg-gray-300 dark:hover:bg-gray-600 rounded">
                    <MoreVertical className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </button>
                  <div className="absolute right-0 top-full bg-white dark:bg-gray-800 shadow-lg rounded border dark:border-gray-700 z-10 hidden hover:block">
                    <button 
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => handleRenameConversation(conv.id)}
                    >
                      <Edit className="inline h-4 w-4 mr-2" />
                      {t('rename')}
                    </button>
                    <button 
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => handleExportConversation(conv.id)}
                    >
                      <Download className="inline h-4 w-4 mr-2" />
                      {t('export')}
                    </button>
                    <button 
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => handleDeleteConversation(conv.id)}
                    >
                      <Trash className="inline h-4 w-4 mr-2" />
                      {t('delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t dark:border-gray-700 flex justify-between items-center">
            <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title={t('account')}>
              <User className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" onClick={() => setIsSettingsOpen(true)} title={t('settings')}>
              <Settings className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" onClick={() => setIsSubscriptionModalOpen(true)} title={t('subscription')}>
              <CreditCard className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" onClick={() => setIsHelpOpen(true)} title={t('help')}>
              <HelpCircle className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* 主聊天区域 */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
          <header className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-4 flex items-center border-b dark:border-gray-700">
            {!isSidebarOpen && (
              <button 
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded mr-2"
                onClick={createNewConversation}
              >
                <MessageSquare className="h-5 w-5" />
              </button>
            )}
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded mr-2" onClick={toggleSidebar}>
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <button 
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                className="px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </header>

          <div className="flex-grow overflow-y-auto p-6" ref={scrollRef}>
            <div className="w-[80%] mx-auto space-y-4">
              {currentConversation.messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xl text-gray-500 dark:text-gray-400">
                    {t('welcomeMessage')}
                  </p>
                </div>
              )}
              {currentConversation.messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${message.isAi ? 'items-start' : 'items-end'} space-y-2`}
                >
                  <div
                    className={`p-3 max-w-[80%] ${
                      message.isAi
                        ? 'text-gray-900 dark:text-white'
                        : (editingMessageIndex === index ? "" : "bg-blue-600 text-white rounded-lg")
                    }`}
                  >
                    {editingMessageIndex === index ? (
                      <textarea
                        value={editedMessage}
                        onChange={(e) => setEditedMessage(e.target.value)}
                        className="min-w-[300px] w-full max-w-[90%] min-h-[100px] border-2 border-blue-500 rounded p-2 dark:bg-gray-700 dark:text-white"
                      />
                    ) : (
                      renderMessage(message)
                    )}
                  </div>
                  {editingMessageIndex === index ? (
                    <div className="flex space-x-2">
                      <button 
                        className="px-3 py-1 text-sm border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={handleCancelEdit}
                      >
                        {t('cancel')}
                      </button>
                      <button 
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        onClick={handleFinishEdit}
                      >
                        {t('finish')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex space-x-1">
                      {!message.isAi && (
                        <>
                          <button 
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            onClick={() => handleEditMessage(index)}
                            title={t('edit')}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button 
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            onClick={() => handleCopyMessage(message.text)}
                            title={t('copy')}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button 
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            onClick={() => handleDeleteMessage(index)}
                            title={t('delete')}
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {message.isAi && (
                        <>
                          <button 
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            onClick={() => handleCopyMessage(message.text)}
                            title={t('copy')}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <select 
                            className="text-xs border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600"
                            onChange={(e) => handleRegenerateResponse(index, e.target.value)}
                            value={currentModel}
                          >
                            {models.map((model) => (
                              <option key={model.id} value={model.id}>{model.name}</option>
                            ))}
                          </select>
                          <button 
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            onClick={() => handleRegenerateResponse(index, currentModel)}
                            title={t('regenerate')}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
            {pastedImage && (
              <div className="relative w-full flex justify-center mb-4">
                <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-1 relative" style={{ maxWidth: '150px' }}>
                  <img src={pastedImage} alt="Pasted image" className="rounded-lg object-cover w-full" />
                  <button
                    className="absolute -top-2 -right-2 bg-white dark:bg-gray-800 rounded-full p-1 shadow"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="relative flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg">
              <select 
                value={currentModel}
                onChange={(e) => setCurrentModel(e.target.value)}
                className="absolute left-2 top-1/2 transform -translate-y-1/2 px-2 py-1 text-xs border rounded dark:bg-gray-600 dark:border-gray-500"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
              <textarea
                ref={textareaRef}
                placeholder={t('inputPlaceholder')}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                onPaste={handlePaste}
                className="w-full pl-40 pr-12 py-3 bg-transparent border-none focus:outline-none resize-none dark:text-white"
                rows="1"
                style={{ minHeight: '40px', maxHeight: '200px' }}
              />
              <button
                onClick={isStreaming ? handleInterruptResponse : handleSendMessage}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                {isStreaming ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 设置面板 */}
        {isSettingsOpen && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50">
            <div className="absolute inset-y-0 right-0 w-80 bg-white dark:bg-gray-800 shadow-lg p-4 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('settings')}</h2>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => setIsSettingsOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="border-b dark:border-gray-700 pb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t('appearance')}</h3>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-600 dark:text-gray-300">{t('theme')}</label>
                    <div className="flex gap-2">
                      <button 
                        className={`px-3 py-1 rounded border ${theme === 'light' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}
                        onClick={() => setTheme('light')}
                      >
                        {t('light')}
                      </button>
                      <button 
                        className={`px-3 py-1 rounded border ${theme === 'dark' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}
                        onClick={() => setTheme('dark')}
                      >
                        {t('dark')}
                      </button>
                      <button 
                        className={`px-3 py-1 rounded border ${theme === 'system' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}
                        onClick={() => setTheme('system')}
                      >
                        {t('system')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-sm text-gray-600 dark:text-gray-300">{t('fontSize')}: {fontSize}px</label>
                    <input 
                      type="range" 
                      min="12" 
                      max="24" 
                      value={fontSize} 
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="border-b dark:border-gray-700 pb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t('languageAndRegion')}</h3>
                  <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div>
                  <button 
                    className="w-full py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    onClick={handleDeleteAccount}
                  >
                    <Trash2 className="inline h-4 w-4 mr-2" />
                    {t('deleteAccount')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 订阅模态框 */}
        {isSubscriptionModalOpen && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('subscriptionPlans')}</h2>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => setIsSubscriptionModalOpen(false)}>
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">{t('chooseDuration')}</h3>
                  <div className="grid gap-4 grid-cols-3">
                    {subscriptionPlans.map((plan) => (
                      <button
                        key={plan.id}
                        className={`flex flex-col items-center justify-between p-4 border-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedPlan === plan.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}`}
                        onClick={() => setSelectedPlan(plan.id)}
                      >
                        <span className="text-sm text-gray-900 dark:text-white">{t(plan.nameKey)}</span>
                        <span className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{t(plan.priceKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">{t('choosePayment')}</h3>
                  <div className="grid gap-4 grid-cols-2">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        className={`flex items-center justify-center p-4 border-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedPayment === method.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}`}
                        onClick={() => setSelectedPayment(method.id)}
                      >
                        <span className="text-gray-900 dark:text-white">{t(method.nameKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button className="w-full mt-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                {t('confirmSubscription')}
              </button>
            </div>
          </div>
        )}

        {/* 帮助模态框 */}
        {isHelpOpen && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50">
            <div className="absolute inset-y-0 right-0 w-80 bg-white dark:bg-gray-800 shadow-lg p-4 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t('helpTitle')}</h1>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => setIsHelpOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 text-sm">
                <div className="border dark:border-gray-700 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t('usefulTips')}</h3>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                    <li>{t('tip1')}</li>
                    <li>{t('tip2')}</li>
                    <li>{t('tip3')}</li>
                  </ul>
                </div>
                <div className="border dark:border-gray-700 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t('contactSupport')}</h3>
                  <button
                    className="w-full py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-xs"
                    onClick={() => window.open('https://qm.qq.com/q/AIkS428Om4', '_blank')}
                  >
                    <ExternalLink className="inline h-3 w-3 mr-1" />
                    {t('qqSupport')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIChat
