'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Settings, Moon, Sun, Menu, User, CreditCard, MessageSquare, X, UserPlus, LogOut, Copy, Globe, Lock, Eye, EyeOff, Trash2, ChevronDown, Volume2, VolumeX, Keyboard, MoreVertical, Edit, Download, Trash, HelpCircle, Edit2, Check, ExternalLink, RefreshCw, Pause } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import Image from 'next/image'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { Configuration, OpenAIApi } from 'openai-edge'
import { Input } from "@/components/ui/input";
import { GoogleGenerativeAI } from "@google/generative-ai";


const TypewriterEffect = ({ text }: { text: string }) => {
  const [displayText, setDisplayText] = useState('');
  const index = useRef(0);

  useEffect(() => {
    const safeText = text || ""; // Ensure text is never undefined
    if (safeText === "") {
      setDisplayText("");
      return;
    }

    const timer = setInterval(() => {
      if (index.current < safeText.length) {
        setDisplayText((prev) => prev + safeText[index.current]);
        index.current += 1;
      } else {
        clearInterval(timer);
      }
    }, 10); // 调整这个值可以改变打字速度

    return () => clearInterval(timer);
  }, [text]);

  return <span>{displayText}</span>;
};

// 翻译对象
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
    account: "账户",
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
    welcomeMessage: "欢迎使用世问AI，有什么可以帮助你的？"
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
    account: "Account",
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
    welcomeMessage: "Welcome to Shiwen AI. How can I assist you?"
  },
}

// AI聊天应用组件
export default function Component() {
  // 状态声明
  const [conversations, setConversations] = useState([]) // 存储所有对话
  const [currentConversationId, setCurrentConversationId] = useState(1) // 当前对话ID
  const [inputMessage, setInputMessage] = useState("") // 用户输入消息
  const [isDarkMode, setIsDarkMode] = useState(false) // 深色模式状态
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) // 侧边栏开关状态
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false) // 订阅模态框开关状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false) // 设置面板开关状态
  const [selectedPlan, setSelectedPlan] = useState('monthly') // 选中的订阅计划
  const [selectedPayment, setSelectedPayment] = useState<string | undefined>(undefined) // 选中的支付方式
  const [currentUser, setCurrentUser] = useState({ email: 'abc123@example.com' }) // 当前用户信息
  const [currentModel, setCurrentModel] = useState('gpt-3.5-turbo') // 当前选中的AI模型
  const [language, setLanguage] = useState('zh') // 当前语言设置
  const [pastedImage, setPastedImage] = useState<string | null>(null) // 粘贴的图片
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null) // 正在编辑的消息索引
  const [editedMessage, setEditedMessage] = useState("") // 编辑后的消息内容
  const [isStreaming, setIsStreaming] = useState(false) // 是否正在流式接收响应
  const [isHelpOpen, setIsHelpOpen] = useState(false) // 帮助面板开关状态


  // 设置相关状态
  const [theme, setTheme] = useState('system') // 主题设置
  const [fontSize, setFontSize] = useState(16) // 字体大小设置
  const [privacy, setPrivacy] = useState('friends') // 隐私设置
  const [twoFactor, setTwoFactor] = useState(false) // 两步验证设置


  const t = (key) => translations[language][key] || key

  const currentConversation = conversations.find(conv => conv.id === currentConversationId) || conversations[0] || { id: 1, name: t('newChat'), messages: [] }
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const settingsScrollRef = useRef(null)

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

  const openai = new OpenAIApi(new Configuration({}))

  const streamResponse = useCallback(async (messages: any[]) => {
    setIsStreaming(true)
    const selectedModel = models.find(m => m.id === currentModel)
    if (!selectedModel) {
      console.error('Selected model not found')
      setIsStreaming(false)
      return
    }

    let response
    try {
      switch (selectedModel.id) {
        case 'gpt-4o':
        case 'gpt-4o-mini':
        case 'chatgpt-o1-preview':
        case 'chatgpt-o1-mini':
          response = await openai.createChatCompletion({
            model: selectedModel.id,
            messages,
            stream: true,
          })
          break
        case 'claude-3.5-sonnet':
        case 'claude-3-opus':
          // Implement Claude API call here
          break
        case 'doubao':
          // Implement 豆包大模型 API call here
          break
        case 'wenxin':
          // Implement 文心一言 API call here
          break
        case 'llama-3.1-405b':
          // Implement Llama API call here
          break
        case 'gemini-pro':
        case 'gemini-pro-vision':
          try {
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
            const model = genAI.getGenerativeModel({ model: selectedModel.id });
            
            // Ensure we have valid content before making the API call
            const content = messages[messages.length - 1]?.content;
            if (!content) {
              throw new Error('No content provided for generation');
            }
            
            const result = await model.generateContentStream(content);
            if (!result?.stream) {
              throw new Error('No stream returned from Gemini API');
            }
            
            response = new Response(result.stream);
          } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
          }
          break;
        default:
          console.error('Unsupported model')
          setIsStreaming(false)
          return
      }

      const stream = OpenAIStream(response, {
        onCompletion: (completion) => {
          if (!completion) {
            console.error('No completion received');
            return;
          }
          setConversations(prevConversations =>
            prevConversations.map(conv => {
              if (conv.id === currentConversationId) {
                return {
                  ...conv,
                  messages: [...conv.messages, { 
                    text: completion, 
                    isAi: true, 
                    language: detectLanguage(completion), 
                    model: currentModel 
                  }]
              }
            }
            return conv
          })
        )
        setIsStreaming(false)
      }
    })

    return new StreamingTextResponse(stream)
  } catch (error) {
    console.error('Error in streamResponse:', error)
    setConversations(prevConversations =>
      prevConversations.map(conv => {
        if (conv.id === currentConversationId) {
          return {
            ...conv,
            messages: [...conv.messages, { text: t('errorMessage'), isAi: true, language: language, model: currentModel }]
          };
        }
        return conv;
      })
    );
  } finally {
    setIsStreaming(false);
  }
}, [currentModel, currentConversationId, setConversations, openai, language])

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === 'system') {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
      setIsDarkMode(systemTheme === "dark");
    } else {
      root.classList.add(theme);
      setIsDarkMode(theme === "dark");
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
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

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

      // If no conversation was updated, create a new one
      if (!updatedConversations.some(conv => conv.id === currentConversationId)) {
        return [
          ...updatedConversations,
          {
            id: currentConversationId,
            name: t('newChat'),
            messages: [{ text: formattedMessage, isAi: false, language: detectLanguage(formattedMessage) }]
          }
        ]
      }

      return updatedConversations
    })

    setInputMessage("")

    // Simulate AI response (replace this with actual API call in production)
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
      // Don't create a new conversation if the current one is empty
      return;
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

  const subscriptionPlans = [
    { id: 'monthly', nameKey: 'monthlySubscription', priceKey: 'monthlyPrice' },
    { id: 'quarterly', nameKey: 'quarterlySubscription', priceKey: 'quarterlyPrice' },
    { id: 'yearly', nameKey: 'yearlySubscription', priceKey: 'yearlyPrice' },
  ]

  const paymentMethods = [
    { id: '支付宝', nameKey: '支付宝' },
    { id: '微信', nameKey: '微信' },
  ]

  const isCodeBlock = (text: any): boolean => {
    if (typeof text !== 'string') {
      return false;
    }
    return text.trim().startsWith('\`\`\`') && text.trim().endsWith('\`\`\`');
  }

  const renderMessage = (message: { text: any; isAi: boolean; model?: string }) => {
    if (typeof message.text !== 'string') {
      return String(message.text || ""); // Convert non-string messages to string, use empty string if undefined
    }

    if (isCodeBlock(message.text)) {
      const code = message.text.replace(/\`\`\`[\s\S]*?\n([\s\S]*?)\`\`\`/g, '$1').trim()
      const language = message.text.split('\n')[0].replace('\`\`\`', '').trim() || 'javascript'
      return (
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 bg-background/10"
            onClick={() => copyToClipboard(code)}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <SyntaxHighlighter language={language} style={tomorrow}>
            {code}
          </SyntaxHighlighter>
        </div>
      )
    } else if (message.isAi) {
      return (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {models.find(m => m.id === message.model)?.name || 'Unknown Model'}
          </div>
          <TypewriterEffect text={message.text || ""} />
        </div>
      )
    } else {
      return message.text || ""
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      // You can add a notification here if you want to inform the user that the text has been copied
    }, (err) => {
      console.error('Could not copy text: ', err)
    })
  }

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // You can add a notification here to inform the user that the text has been copied
      console.log('Text copied to clipboard');
    }, (err) => {
      console.error('Could not copy text: ', err);
    });
  };

  const NewChatButton = () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={createNewConversation}
            disabled={currentConversation.messages.length === 0}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="sr-only">{t('newChat')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{currentConversation.messages.length === 0 ? t('noEmptyChat') : t('newChat')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  const handleDeleteAccount = () => {
    // 实现账户删除逻辑
    console.log('Account deletion requested')
  }

  const handleRenameConversation = (id: number) => {
    const newName = prompt(t('enterNewName'));
    if (newName) {
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === id ? { ...conv, name: newName } : conv
        )
      );
    }
  };

  const handleExportConversation = (id: number) => {
    const conversation = conversations.find(conv => conv.id === id);
    if (conversation) {
      const jsonStr = JSON.stringify(conversation, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `conversation_${id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDeleteConversation = (id: number) => {
    if (confirm(t('confirmDelete'))) {
      setConversations(prevConversations =>
        prevConversations.filter(conv => conv.id !== id)
      );
      if (currentConversationId === id) {
        setCurrentConversationId(conversations[0]?.id || 1);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile()
          const reader = new FileReader()
          reader.onload = (event) => {
            setPastedImage(event.target?.result as string)
          }
          reader.readAsDataURL(blob as Blob)
        }
      }
    }
  }

  const handleRemoveImage = () => {
    setPastedImage(null)
  }

  const handleEditMessage = (index: number) => {
    setEditingMessageIndex(index);
    setEditedMessage(currentConversation.messages[index].text);
  };

  const handleCancelEdit = () => {
    setEditingMessageIndex(null);
    setEditedMessage("");
  };

  const handleFinishEdit = () => {
    if (editingMessageIndex !== null) {
      const updatedConversations = conversations.map(conv => {
        if (conv.id === currentConversationId) {
          const updatedMessages = [...conv.messages];
          updatedMessages[editingMessageIndex] = {
            ...updatedMessages[editingMessageIndex],
            text: editedMessage
          };
          // Remove the AI response following the edited message
          if (editingMessageIndex + 1 < updatedMessages.length && updatedMessages[editingMessageIndex + 1].isAi) {
            updatedMessages.splice(editingMessageIndex + 1, 1);
          }
          return { ...conv, messages: updatedMessages };
        }
        return conv;
      });
      setConversations(updatedConversations);
      setEditingMessageIndex(null);
      setEditedMessage("");
      
      // Regenerate AI response
      handleRegenerateResponse(editingMessageIndex, currentModel);
    }
  };

  const handleDeleteMessage = (index: number) => {
    const updatedConversations = conversations.map(conv => {
      if (conv.id === currentConversationId) {
        const updatedMessages = conv.messages.filter((_, i) => {
          if (i === index) {
            // If the message to be deleted is from the user and the next message is from AI, delete both
            if (!conv.messages[i].isAi && conv.messages[i + 1]?.isAi) {
              return false;
            }
            // If the message to be deleted is from AI and the previous message is from the user, delete both
            if (conv.messages[i].isAi && !conv.messages[i - 1]?.isAi) {
              return false;
            }
          }
          return i !== index && i !== index + 1;
        });
        return { ...conv, messages: updatedMessages };
      }
      return conv;
    });
    setConversations(updatedConversations);
  }

  const detectLanguage = (text: string) => {
    // 这里使用一个简单的检测方法，您可能需要使用更复杂的语言检测库
    return /[a-zA-Z]/.test(text) ? 'en' : 'zh'
  }

  useEffect(() => {
    if (editingMessageIndex !== null) {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }
  }, [editedMessage, editingMessageIndex]);

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

  const handleRegenerateResponse = async (index: number, modelId: string) => {
    const messages = currentConversation.messages?.slice(0, index + 1) || [];
    if (messages.length === 0) {
      console.error('No messages to process');
      return;
    }
    const response = await streamResponse(messages.map(msg => ({
      role: msg.isAi ? 'assistant' : 'user',
      content: msg.text
    })));
    
    if (response) {
      setConversations(prevConversations =>
        prevConversations.map(conv => {
          if (conv.id === currentConversationId) {
            const updatedMessages = [...conv.messages];
            updatedMessages[index] = { ...updatedMessages[index], text: response, model: modelId };
            return { ...conv, messages: updatedMessages };
          }
          return conv;
        })
      );
    }
  };

  const handleInterruptResponse = () => {
    // 这里需要实现中断 API 调用的逻辑
    setIsStreaming(false);
  };

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
            <CardDescription className="text-xs">{t('customizeAppearance')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('theme')}</Label>
              <RadioGroup value={theme} onValueChange={setTheme} className="flex flex-wrap gap-2">
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light" className="text-xs"><Sun className="h-3 w-3 mr-1 inline" />{t('light')}</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark" className="text-xs"><Moon className="h-3 w-3 mr-1 inline" />{t('dark')}</Label>
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
            <CardDescription className="text-xs">{t('setPreferredLanguage')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Globe className="h-4 w-4" />
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder={t('selectLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('account')}</CardTitle>
            <CardDescription className="text-xs">{t('manageAccount')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm" onClick={handleDeleteAccount}>
              <Trash2 className="h-3 w-3 mr-1" />
              {t('deleteAccount')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className={`w-full max-w-[80%] sm:max-w-[90%] h-[90vh] sm:h-[95vh] bg-background rounded-[5%] sm:rounded-[2.5%] shadow-2xl overflow-hidden flex relative ${isDarkMode ? 'dark' : ''}`} data-theme={isDarkMode ? 'dark' : 'light'}>
        {/* 侧边栏 */}
        <div className={`bg-secondary flex flex-col ${isSidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden`}>
          <div className="flex justify-between items-center p-4">
            <h1 className="text-xl font-semibold text-primary">{t('AIChat')}</h1>
            <NewChatButton />
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
                        <Edit className="mr-2 h-4 w-4" />
                        <span>{t('rename')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleExportConversation(conv.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>{t('export')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleDeleteConversation(conv.id)}>
                        <Trash className="mr-2 h-4 w-4" />
                        <span>{t('delete')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </ScrollArea>
          <div className="p-4 flex justify-between items-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <User className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>{currentUser.email}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>{t('switchAccount')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>{t('logout')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('account')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)}>
                    <Settings className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('settings')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setIsSubscriptionModalOpen(true)}>
                    <CreditCard className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('subscription')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(true)}>
                    <HelpCircle className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('help')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* 主聊天区域 */}
        <div className="flex-1 flex flex-col bg-background">
          <header className="bg-background text-foreground p-4 flex items-center">
            {!isSidebarOpen && <NewChatButton />}
            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-2">
              <Menu className="h-6 w-6" />
            </Button>
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
                  <div
                    className={`p-2 inline-block max-w-[80%] ${
                      message.isAi
                        ? isDarkMode ? "text-white" : "text-black"
                        : (editingMessageIndex === index ? "" : "bg-secondary text-secondary-foreground rounded-lg")
                    }`}
                  >
                    {editingMessageIndex === index ? (
                      <Textarea
                        value={editedMessage}
                        onChange={(e) => setEditedMessage(e.target.value)}
                        className="min-w-[300px] w-full max-w-[90%] min-h-[150px] border-2 border-primary"
                        style={{
                          resize: 'vertical',
                          overflowY: 'auto',
                          borderRadius: '4px',
                          padding: '8px',
                          boxShadow: 'none',
                        }}
                      />
                    ) : (
                      renderMessage(message)
                    )}
                  </div>
                  <div className="flex space-x-1">
                    {!message.isAi && (
                      editingMessageIndex === index ? (
                        <>
                          <Button variant="outline" size="sm" onClick={handleCancelEdit} className="bg-white text-black">{t('cancel')}</Button>
                          <Button variant="outline" size="sm" onClick={handleFinishEdit} className="bg-black text-white">{t('finish')}</Button>
                        </>
                      ) : (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleEditMessage(index)}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('edit')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleCopyMessage(message.text)}>
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('copy')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteMessage(index)}>
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('delete')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )
                    )}
                    {message.isAi && (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleCopyMessage(message.text)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('copy')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="absolute top-0 left-0 mt-2 ml-2">
                          {isStreaming ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"></div>
                          ) : (
                            <></>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuLabel>{t('switchModel')}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {models.map((model) => (
                              <DropdownMenuItem 
                                key={model.id} 
                                onSelect={() => {
                                  handleRegenerateResponse(index, model.id);
                                }}
                              >
                                {model.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleRegenerateResponse(index, currentModel)}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('regenerate')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 bg-background">
            {pastedImage && (
              <div className="relative w-full flex justify-center mb-4">
                <div className="border-2 border-input rounded-lg p-1 relative" style={{ maxWidth: '150px' }}>
                  <Image src={pastedImage} alt="Pasted image" width={140} height={105} className="rounded-lg object-cover" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -top-2 -right-2 bg-background rounded-full"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
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
                onPaste={handlePaste}
                className="pr-10 pl-44 resize-none overflow-hidden border border-input focus:ring-0 focus:outline-none"
                style={{
                  minHeight: '30px',
                  maxHeight: '200px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                }}
              />
              <Button
                onClick={isStreaming ? handleInterruptResponse : handleSendMessage}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3"
                variant="ghost"
              >
                {isStreaming ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="sr-only">{isStreaming ? t('interrupt') : t('sendMessage')}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* 设置模块 */}
        {isSettingsOpen && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50">
            <div className="absolute inset-y-0 right-0 w-1/4 max-w-xs bg-background shadow-lg p-4 overflow-y-auto">
              <SettingsContent />
            </div>
          </div>
        )}

        {/* 订阅模态框 */}
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
                          <span className="ml-2">{t(method.nameKey)}</span>
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

        {/* 帮助模态框 */}
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
