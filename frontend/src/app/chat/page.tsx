'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  Copy, ChevronDown, Menu, MessageSquare, X, User, Settings, Moon, Sun, CreditCard, 
  Edit2, Trash2, MoreVertical, Download, RefreshCw, Pause, HelpCircle, ExternalLink, Send
} from 'lucide-react'

const translations = {
  zh: {
    newChat: "新建聊天",
    settings: "设置",
    subscription: "订阅",
    account: "账号",
    switchAccount: "切换账号",
    logout: "退出账号",
    appearance: "外观",
    theme: "主题",
    light: "浅色",
    dark: "深色",
    system: "系统",
    fontSize: "字体大小",
    languageAndRegion: "语言和地区",
    selectLanguage: "选择语言",
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
    backToPickup: "返回取件码模式"
  },
  en: {
    newChat: "New Chat",
    settings: "Settings",
    subscription: "Subscription",
    account: "Account",
    switchAccount: "Switch Account",
    logout: "Logout",
    appearance: "Appearance",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    fontSize: "Font Size",
    languageAndRegion: "Language and Region",
    selectLanguage: "Select language",
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
    helpTitle: "Help Center",
    usefulTips: "Useful Tips",
    tip1: "Use '/' to quickly access common commands",
    tip2: "Double-click a message to quickly edit it",
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
    backToPickup: "Back to Pickup Mode"
  }
}

const models = [
  { id: 'gpt-4o', name: 'GPT 4O' },
  { id: 'gpt-4o-mini', name: 'GPT 4O mini' },
  { id: 'chatgpt-o1-preview', name: 'ChatGPT o1-preview' },
  { id: 'claude-3.5-sonnet', name: 'Claude-3.5 Sonnet' },
  { id: 'doubao', name: '豆包大模型' },
  { id: 'wenxin', name: '文心一言' },
  { id: 'gemini-pro', name: 'Gemini Pro' },
]

interface Message {
  text: string
  isAi: boolean
  model?: string
}

interface Conversation {
  id: number
  name: string
  messages: Message[]
}

const TypewriterEffect = ({ text }: { text: string }) => {
  const [displayText, setDisplayText] = useState('')
  const index = useRef(0)

  useEffect(() => {
    const safeText = text || ""
    if (safeText === "") {
      setDisplayText("")
      return
    }
    const timer = setInterval(() => {
      if (index.current < safeText.length) {
        setDisplayText((prev) => prev + safeText[index.current])
        index.current += 1
      } else {
        clearInterval(timer)
      }
    }, 10)
    return () => clearInterval(timer)
  }, [text])

  return <span>{displayText}</span>
}

export default function AIChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState(1)
  const [inputMessage, setInputMessage] = useState("")
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('monthly')
  const [selectedPayment, setSelectedPayment] = useState<string | undefined>(undefined)
  const [currentModel, setCurrentModel] = useState('gpt-4o')
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
  const [editedMessage, setEditedMessage] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [theme, setTheme] = useState('system')
  const [fontSize, setFontSize] = useState(16)

  const t = (key: string) => translations[language][key as keyof typeof translations['zh']] || key

  const currentConversation = conversations.find(conv => conv.id === currentConversationId) || 
    { id: 1, name: t('newChat'), messages: [] }
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "") return

    const formattedMessage = inputMessage.trim()

    setConversations(prevConversations => {
      const existingConv = prevConversations.find(conv => conv.id === currentConversationId)
      if (existingConv) {
        return prevConversations.map(conv => {
          if (conv.id === currentConversationId) {
            return {
              ...conv,
              messages: [...conv.messages, { text: formattedMessage, isAi: false }]
            }
          }
          return conv
        })
      } else {
        return [...prevConversations, {
          id: currentConversationId,
          name: t('newChat'),
          messages: [{ text: formattedMessage, isAi: false }]
        }]
      }
    })

    setInputMessage("")
    setIsStreaming(true)

    setTimeout(() => {
      setConversations(prevConversations => {
        return prevConversations.map(conv => {
          if (conv.id === currentConversationId) {
            return {
              ...conv,
              messages: [
                ...conv.messages,
                { 
                  text: "这是一个模拟的 AI 回复。在实际应用中，这里会调用真实的 AI API 来生成回复。", 
                  isAi: true, 
                  model: currentModel
                }
              ]
            }
          }
          return conv
        })
      })
      setIsStreaming(false)
    }, 1500)
  }

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)

  const createNewConversation = () => {
    if (currentConversation.messages.length === 0) return
    const newId = Math.max(...conversations.map(c => c.id), 0) + 1
    const newConversation = {
      id: newId,
      name: `${t('newChat')} ${newId}`,
      messages: []
    }
    setConversations([...conversations, newConversation])
    setCurrentConversationId(newId)
  }

  const subscriptionPlans = [
    { id: 'monthly', nameKey: 'monthlySubscription', priceKey: 'monthlyPrice' },
    { id: 'quarterly', nameKey: 'quarterlySubscription', priceKey: 'quarterlyPrice' },
    { id: 'yearly', nameKey: 'yearlySubscription', priceKey: 'yearlyPrice' },
  ]

  const paymentMethods = [
    { id: 'alipay', nameKey: '支付宝' },
    { id: 'wechat', nameKey: '微信' },
  ]

  const isCodeBlock = (text: string): boolean => {
    return text.trim().startsWith('```') && text.trim().endsWith('```')
  }

  const renderMessage = (message: Message) => {
    if (isCodeBlock(message.text)) {
      const code = message.text.replace(/```[\s\S]*?\n([\s\S]*?)```/g, '$1').trim()
      const lang = message.text.split('\n')[0].replace('```', '').trim() || 'javascript'
      return (
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 bg-background/10 h-6 w-6"
            onClick={() => navigator.clipboard.writeText(code)}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <SyntaxHighlighter language={lang} style={tomorrow}>
            {code}
          </SyntaxHighlighter>
        </div>
      )
    } else if (message.isAi) {
      return (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {models.find(m => m.id === message.model)?.name || 'AI'}
          </div>
          <TypewriterEffect text={message.text || ""} />
        </div>
      )
    } else {
      return message.text || ""
    }
  }

  const handleRenameConversation = (id: number) => {
    const newName = prompt(t('enterNewName'))
    if (newName) {
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === id ? { ...conv, name: newName } : conv
        )
      )
    }
  }

  const handleExportConversation = (id: number) => {
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

  const handleDeleteConversation = (id: number) => {
    if (confirm(t('confirmDelete'))) {
      setConversations(prevConversations =>
        prevConversations.filter(conv => conv.id !== id)
      )
      if (currentConversationId === id) {
        setCurrentConversationId(conversations[0]?.id || 1)
      }
    }
  }

  const handleEditMessage = (index: number) => {
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

  const handleDeleteMessage = (index: number) => {
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

  const SettingsContent = () => (
    <ScrollArea className="h-full pr-2">
      <div className="space-y-4 text-sm">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold">{t('settings')}</h1>
          <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('appearance')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('theme')}</Label>
              <RadioGroup value={theme} onValueChange={setTheme} className="flex flex-wrap gap-2">
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light" className="text-xs flex items-center gap-1">
                    <Sun className="h-3 w-3" />
                    {t('light')}
                  </Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark" className="text-xs flex items-center gap-1">
                    <Moon className="h-3 w-3" />
                    {t('dark')}
                  </Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="system" id="system" />
                  <Label htmlFor="system" className="text-xs">{t('system')}</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('fontSize')}</Label>
              <div className="flex items-center space-x-2">
                <Slider
                  value={[fontSize]}
                  onValueChange={(value) => setFontSize(value[0])}
                  max={24}
                  min={12}
                  step={1}
                  className="w-[60%]"
                />
                <span className="text-xs">{fontSize}px</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('languageAndRegion')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={language} onValueChange={(v) => setLanguage(v as 'zh' | 'en')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder={t('selectLanguage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('account')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-3 w-3 mr-1" />
              {t('deleteAccount')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )

  const HelpContent = () => (
    <ScrollArea className="h-full pr-2">
      <div className="space-y-4 text-sm">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold">{t('helpTitle')}</h1>
          <Button variant="ghost" size="sm" onClick={() => setIsHelpOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('usefulTips')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li>{t('tip1')}</li>
              <li>{t('tip2')}</li>
              <li>{t('tip3')}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('contactSupport')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://qm.qq.com/q/AIkS428Om4', '_blank')}
              className="w-full text-xs"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              {t('qqSupport')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className={`w-full max-w-[80%] sm:max-w-[90%] h-[90vh] sm:h-[95vh] bg-background rounded-3xl shadow-2xl overflow-hidden flex relative`}>
        <div className={`bg-secondary flex flex-col ${isSidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden`}>
          <div className="flex justify-between items-center p-4">
            <h1 className="text-xl font-semibold text-primary">{t('AIChat')}</h1>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={createNewConversation}
              disabled={currentConversation.messages.length === 0}
            >
              <MessageSquare className="h-5 w-5" />
            </Button>
          </div>
          <ScrollArea className="flex-grow">
            {conversations.map(conv => (
              <div key={conv.id} className="border border-input rounded-md my-0.5 mx-2">
                <div className="flex justify-between items-center">
                  <Button
                    variant="ghost"
                    className="w-full justify-start truncate py-1 px-2"
                    onClick={() => setCurrentConversationId(conv.id)}
                  >
                    {conv.name}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => handleRenameConversation(conv.id)}>
                        <Edit2 className="mr-2 h-4 w-4" />
                        <span>{t('rename')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleExportConversation(conv.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>{t('export')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleDeleteConversation(conv.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>{t('delete')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </ScrollArea>
          <div className="p-4 flex justify-between items-center">
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsSubscriptionModalOpen(true)}>
              <CreditCard className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(true)}>
              <HelpCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-background">
          <header className="bg-background text-foreground p-4 flex items-center">
            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-2">
              <Menu className="h-6 w-6" />
            </Button>
            <Link href="/" className="ml-auto text-sm text-muted-foreground hover:text-primary transition-colors">
              {t('backToPickup')}
            </Link>
          </header>

          <ScrollArea className="flex-grow p-6 h-[calc(100vh-180px)]" ref={scrollRef}>
            <div className="w-[80%] mx-auto space-y-2">
              {currentConversation.messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xl text-muted-foreground">
                    {t('welcomeMessage')}
                  </p>
                </div>
              )}
              {currentConversation.messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${message.isAi ? 'items-start' : 'items-end'} space-y-1`}
                >
                  <div className={`p-2 inline-block max-w-[80%] ${
                    message.isAi
                      ? isDarkMode ? "text-white" : "text-black"
                      : "bg-secondary text-secondary-foreground rounded-lg"
                  }`}>
                    {editingMessageIndex === index ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editedMessage}
                          onChange={(e) => setEditedMessage(e.target.value)}
                          className="min-w-[300px] border-2 border-primary"
                        />
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                            {t('cancel')}
                          </Button>
                          <Button size="sm" onClick={handleFinishEdit}>
                            {t('finish')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      renderMessage(message)
                    )}
                  </div>
                  <div className="flex space-x-1">
                    {!message.isAi && editingMessageIndex !== index && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditMessage(index)}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigator.clipboard.writeText(message.text)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteMessage(index)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {message.isAi && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigator.clipboard.writeText(message.text)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 bg-background">
            <div className="relative flex items-center bg-muted rounded-md" style={{ minHeight: '50px' }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 h-10 w-auto px-2 py-1 text-xs"
                  >
                    {models.find(m => m.id === currentModel)?.name || 'Select Model'}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {models.map((model) => (
                    <DropdownMenuItem key={model.id} onSelect={() => setCurrentModel(model.id)}>
                      {model.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Textarea
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
                className="pr-10 pl-44 resize-none overflow-hidden border border-input focus:ring-0 focus:outline-none"
                style={{
                  minHeight: '30px',
                  maxHeight: '200px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                }}
              />
              <Button
                onClick={isStreaming ? () => setIsStreaming(false) : handleSendMessage}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3"
                variant="ghost"
              >
                {isStreaming ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {isSettingsOpen && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50">
            <div className="absolute inset-y-0 right-0 w-1/4 max-w-xs bg-background shadow-lg p-4 overflow-y-auto">
              <SettingsContent />
            </div>
          </div>
        )}

        {isSubscriptionModalOpen && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">{t('subscriptionPlans')}</h2>
                  <Button variant="ghost" size="icon" onClick={() => setIsSubscriptionModalOpen(false)}>
                    <X className="h-6 w-6" />
                  </Button>
                </div>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">{t('chooseDuration')}</h3>
                    <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan} className="grid gap-4 grid-cols-3">
                      {subscriptionPlans.map((plan) => (
                        <Label
                          key={plan.id}
                          htmlFor={plan.id}
                          className={`flex flex-col items-center justify-between rounded-md border-2 border-muted p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary`}
                        >
                          <RadioGroupItem value={plan.id} id={plan.id} className="sr-only" />
                          <span>{t(plan.nameKey)}</span>
                          <span className="mt-1 text-lg font-semibold">{t(plan.priceKey)}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-3">{t('choosePayment')}</h3>
                    <RadioGroup value={selectedPayment} onValueChange={setSelectedPayment} className="grid gap-4 grid-cols-2">
                      {paymentMethods.map((method) => (
                        <Label
                          key={method.id}
                          htmlFor={method.id}
                          className={`flex items-center justify-center rounded-md border-2 border-muted p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary ${
                            method.id === 'wechat' ? 'bg-[#07C160] text-white' : method.id === 'alipay' ? 'bg-[#1677FF] text-white' : ''
                          }`}
                        >
                          <RadioGroupItem value={method.id} id={method.id} />
                          <span className="ml-2">{method.nameKey}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
                <Button className="w-full mt-6" onClick={() => setIsSubscriptionModalOpen(false)}>
                  {t('confirmSubscription')}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {isHelpOpen && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50">
            <div className="absolute inset-y-0 right-0 w-1/4 max-w-xs bg-background shadow-lg p-4 overflow-y-auto">
              <HelpContent />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
