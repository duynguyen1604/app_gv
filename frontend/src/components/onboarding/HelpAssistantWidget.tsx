import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Bot,
  Compass,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { API_BASE_URL } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { cn } from '../../lib/utils'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
}

function getQuickQuestions(pathname: string, isAdmin: boolean): string[] {
  if (isAdmin || pathname.startsWith('/admin')) {
    return [
      'Cách tạo mã mời giáo viên?',
      'Cách duyệt hoặc khóa tài khoản?',
      'Nhật ký kiểm toán lưu bao lâu?',
    ]
  }
  if (pathname.startsWith('/classes')) {
    return [
      'Cách tạo lớp mới và thêm học sinh?',
      'Cách tạo lịch học phát sinh?',
      'Cách điểm danh buổi học?',
    ]
  }
  if (pathname.startsWith('/fees')) {
    return [
      'Cách lọc học phí theo lớp?',
      'Cách ghi nhận thu tiền học phí?',
      'Lịch phát sinh tính học phí thế nào?',
    ]
  }
  if (pathname.startsWith('/settings')) {
    return [
      'Cách bật thông báo Email mỗi sáng?',
      'Cách đồng bộ Google Calendar?',
      'Cách chỉnh giờ tiết học S1–C5?',
    ]
  }
  if (pathname.startsWith('/profile')) {
    return [
      'Cách đổi mật khẩu của tôi?',
      'Cách cập nhật thông tin cá nhân?',
    ]
  }
  return [
    'App này dùng để làm gì?',
    'Cách tạo lịch học phát sinh?',
    'Cách điểm danh và tính học phí?',
    'Cách bật thông báo Email sáng?',
  ]
}

function getWelcomeMessage(isAdmin: boolean): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    createdAt: Date.now(),
    text: isAdmin
      ? 'Xin chào Quản trị viên! Tôi là **Trợ lý hướng dẫn sử dụng App**. Bạn có thể hỏi tôi cách duyệt tài khoản, tạo mã mời giáo viên hoặc xem nhật ký kiểm toán. (Tôi không trả lời chuyện ngoài luồng và không bao giờ tiết lộ mật khẩu hay dữ liệu tài khoản khác.)'
      : 'Xin chào Thầy/Cô! Tôi là **Trợ lý hướng dẫn sử dụng App**. Chỗ nào chưa rõ trên màn hình (xếp lịch, tạo lớp, lịch phát sinh, điểm danh, học phí, cài đặt...), Thầy/Cô cứ hỏi tôi nhé!',
  }
}

function renderFormattedText(text: string) {
  const lines = text.split('\n')
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    return (
      <span key={lineIdx} className="block min-h-[1.1em]">
        {parts.map((part, partIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={partIdx} className="font-bold">
                {part.slice(2, -2)}
              </strong>
            )
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return (
              <em key={partIdx} className="italic">
                {part.slice(1, -1)}
              </em>
            )
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={partIdx}
                className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[11px]"
              >
                {part.slice(1, -1)}
              </code>
            )
          }
          return <span key={partIdx}>{part}</span>
        })}
      </span>
    )
  })
}

export function HelpAssistantWidget() {
  const location = useLocation()
  const { profile, sessionToken, onboardingOpen, openOnboardingMenu } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const userId = profile?.id || 'guest'
  const storageKey = `app_gv_help_chat_${userId}`

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [getWelcomeMessage(isAdmin)])

  const listEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const quickQuestions = useMemo(
    () => getQuickQuestions(location.pathname, isAdmin),
    [location.pathname, isAdmin]
  )

  // Tải lịch sử chat theo từng tài khoản
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
          return
        }
      }
    } catch {
      // ignore storage errors
    }
    setMessages([getWelcomeMessage(isAdmin)])
  }, [storageKey, isAdmin])

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)))
    } catch {
      // ignore storage errors
    }
  }, [messages, storageKey])

  useEffect(() => {
    if (open) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open, messages.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!profile || onboardingOpen) return null

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      createdAt: Date.now(),
    }

    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setInput('')
    setSending(true)

    try {
      const resp = await fetch(`${API_BASE_URL}/api/ai/help-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          currentPath: location.pathname,
          history: nextHistory
            .filter((m) => m.id !== 'welcome')
            .slice(-6)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      })

      const data = await resp.json().catch(() => ({}))
      const replyText =
        resp.ok && data?.reply
          ? String(data.reply)
          : String(data?.error || 'Xin lỗi, tôi chưa thể trả lời lúc này. Thầy/Cô thử lại giúp tôi nhé.')

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: replyText,
          createdAt: Date.now(),
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: 'Mạng đang gián đoạn nên tôi chưa kết nối được máy chủ. Thầy/Cô có thể bấm nút **Hướng dẫn (?)** ở thanh trên cùng để xem chỉ dẫn từng nút ngay trên màn hình nhé!',
          createdAt: Date.now(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const handleResetChat = () => {
    const fresh = [getWelcomeMessage(isAdmin)]
    setMessages(fresh)
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }

  return (
    <>
      {/* Nút AI nổi ở góc dưới phải */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở trợ lý AI hướng dẫn sử dụng"
          title="Hỏi trợ lý AI cách dùng phần mềm"
          className="fixed right-4 bottom-20 tablet:bottom-6 z-40 group flex items-center gap-2 rounded-full bg-gradient-to-r from-[#1A73E8] to-indigo-600 text-white px-3.5 py-3 shadow-lg shadow-blue-600/30 hover:shadow-xl hover:scale-[1.03] active:scale-95 transition-all no-print"
        >
          <span className="relative flex items-center justify-center">
            <Bot size={20} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#1A73E8]" />
          </span>
          <span className="hidden sm:inline text-xs font-bold pr-0.5">
            Hỏi AI HDSD
          </span>
        </button>
      )}

      {/* Cửa sổ Chatbox AI */}
      {open && (
        <div
          role="dialog"
          aria-label="Trợ lý AI hướng dẫn sử dụng"
          className="fixed right-3 left-3 sm:left-auto sm:right-5 bottom-20 tablet:bottom-6 z-50 sm:w-[370px] max-h-[75vh] h-[490px] flex flex-col rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] shadow-2xl overflow-hidden no-print"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-[#1A73E8] to-indigo-600 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Bot size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight truncate flex items-center gap-1.5">
                  Trợ lý hướng dẫn App
                  <Sparkles size={13} className="text-amber-300 shrink-0" />
                </div>
                <div className="text-[10px] text-blue-100 flex items-center gap-1 mt-0.5">
                  <ShieldCheck size={11} className="shrink-0" />
                  <span>Chỉ giải đáp HDSD · Không lộ thông tin</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleResetChat}
                title="Làm mới cuộc trò chuyện"
                className="p-1.5 rounded-lg hover:bg-white/15 text-blue-100 hover:text-white transition-colors"
              >
                <Trash2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Đóng (Esc)"
                className="p-1.5 rounded-lg hover:bg-white/15 text-blue-100 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tin nhắn */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 dark:bg-[#18191C]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[86%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs',
                    m.role === 'user'
                      ? 'bg-[#1A73E8] text-white rounded-br-sm'
                      : 'bg-white dark:bg-[#24262B] text-slate-800 dark:text-slate-100 border border-gray-200/80 dark:border-[#2D2F34] rounded-bl-sm'
                  )}
                >
                  {renderFormattedText(m.text)}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs bg-white dark:bg-[#24262B] border border-gray-200/80 dark:border-[#2D2F34] text-slate-400">
                  Đang soạn hướng dẫn...
                </div>
              </div>
            )}
            <div ref={listEndRef} />
          </div>

          {/* Gợi ý nhanh + Nút mở spotlight */}
          <div className="px-3 py-2 border-t border-gray-100 dark:border-[#2D2F34] bg-white dark:bg-[#1E1F22] space-y-2 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    openOnboardingMenu()
                  }}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors"
                >
                  <Compass size={12} />
                  Chỉ nút trang này
                </button>
              )}
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => void sendMessage(q)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-[#282A2E] text-slate-700 dark:text-slate-200 hover:bg-blue-50 hover:text-[#1A73E8] dark:hover:bg-[#1A73E8]/20 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Form nhập */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void sendMessage(input)
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Hỏi cách dùng app (VD: tạo lịch phát sinh)..."
                disabled={sending}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#282A2E] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/50"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Gửi câu hỏi"
                className="p-2 rounded-xl bg-[#1A73E8] text-white hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
