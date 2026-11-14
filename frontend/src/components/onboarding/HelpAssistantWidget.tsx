import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  Bot,
  Compass,
  Headset,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { cn } from '../../lib/utils'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
}

interface SupportTicketMessage {
  id: string
  sender_role: 'user' | 'admin'
  sender_name: string
  text: string
  created_at: string
}

interface SupportTicket {
  id: string
  category: 'support' | 'complaint' | 'bug' | 'account'
  subject: string
  status: 'open' | 'replied' | 'resolved'
  messages: SupportTicketMessage[]
  created_at: string
  updated_at: string
}

const CATEGORY_LABELS: Record<SupportTicket['category'], string> = {
  support: 'Hỗ trợ sử dụng',
  complaint: 'Khiếu nại',
  bug: 'Báo lỗi phần mềm',
  account: 'Vấn đề tài khoản',
}

const STATUS_BADGES: Record<SupportTicket['status'], { label: string; cls: string }> = {
  open: {
    label: 'Chờ Admin phản hồi',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  replied: {
    label: 'Admin đã trả lời',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  resolved: {
    label: 'Đã giải quyết',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
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
      'Cách liên hệ Admin?',
    ]
  }
  if (pathname.startsWith('/fees')) {
    return [
      'Cách lọc học phí theo lớp?',
      'Cách ghi nhận thu tiền học phí?',
      'Cách liên hệ Admin?',
    ]
  }
  if (pathname.startsWith('/settings')) {
    return [
      'Cách bật thông báo Email mỗi sáng?',
      'Cách đồng bộ Google Calendar?',
      'Cách liên hệ Admin?',
    ]
  }
  if (pathname.startsWith('/profile')) {
    return [
      'Cách đổi mật khẩu của tôi?',
      'Cách liên hệ Admin?',
    ]
  }
  return [
    'App này dùng để làm gì?',
    'Cách tạo lịch học phát sinh?',
    'Cách liên hệ Admin?',
    'Cách bật thông báo Email sáng?',
  ]
}

function getWelcomeMessage(isAdmin: boolean): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    createdAt: Date.now(),
    text: isAdmin
      ? 'Xin chào Quản trị viên! Tôi là **Trợ lý hướng dẫn sử dụng App**. Bạn có thể hỏi tôi cách duyệt tài khoản, tạo mã mời giáo viên, xử lý đơn hỗ trợ hoặc xem nhật ký kiểm toán. (Tôi không trả lời chuyện ngoài luồng và không bao giờ tiết lộ mật khẩu hay dữ liệu tài khoản khác.)'
      : 'Xin chào Thầy/Cô! Tôi là **Trợ lý hướng dẫn sử dụng App**. Chỗ nào chưa rõ trên màn hình Thầy/Cô cứ hỏi tôi, hoặc bấm tab **Liên hệ Admin** phía trên để gửi đơn khiếu nại / chat trực tiếp với Quản trị viên nhé!',
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
  const [activeTab, setActiveTab] = useState<'ai' | 'admin'>('ai')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [getWelcomeMessage(isAdmin)])

  // Admin contact / ticket state (for teachers)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [ticketCategory, setTicketCategory] = useState<SupportTicket['category']>('support')
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketBody, setTicketBody] = useState('')
  const [submittingTicket, setSubmittingTicket] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const listEndRef = useRef<HTMLDivElement>(null)
  const ticketEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const quickQuestions = useMemo(
    () => getQuickQuestions(location.pathname, isAdmin),
    [location.pathname, isAdmin]
  )

  const repliedCount = useMemo(
    () => tickets.filter((t) => t.status === 'replied').length,
    [tickets]
  )

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  )

  const fetchMyTickets = useCallback(async () => {
    if (!sessionToken || isAdmin) return
    setLoadingTickets(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/support/tickets`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && Array.isArray(data.tickets)) {
        setTickets(data.tickets)
      }
    } catch {
      // ignore network errors
    } finally {
      setLoadingTickets(false)
    }
  }, [sessionToken, isAdmin])

  useEffect(() => {
    if (open && !isAdmin) {
      void fetchMyTickets()
    }
  }, [open, isAdmin, fetchMyTickets])

  // Tải lịch sử chat AI theo từng tài khoản
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
    if (open && activeTab === 'ai') {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open, activeTab, messages.length])

  useEffect(() => {
    if (open && activeTab === 'admin' && selectedTicket) {
      ticketEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, activeTab, selectedTicket?.messages.length, selectedTicket])

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
          : String(
              data?.error || 'Xin lỗi, tôi chưa thể trả lời lúc này. Thầy/Cô thử lại giúp tôi nhé.'
            )

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

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken || !ticketSubject.trim() || !ticketBody.trim() || submittingTicket) return
    setSubmittingTicket(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          category: ticketCategory,
          subject: ticketSubject.trim(),
          message: ticketBody.trim(),
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Không thể gửi đơn lúc này.')
      }
      toast.success('Đã gửi đơn tới Quản trị viên!')
      setTicketSubject('')
      setTicketBody('')
      setCreatingTicket(false)
      if (data.ticket) {
        setTickets((prev) => [data.ticket, ...prev])
        setSelectedTicketId(data.ticket.id)
      } else {
        await fetchMyTickets()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gửi đơn thất bại.')
    } finally {
      setSubmittingTicket(false)
    }
  }

  const handleSendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionToken || !selectedTicket || !replyText.trim() || sendingReply) return
    setSendingReply(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ message: replyText.trim() }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Không thể gửi tin nhắn.')
      }
      setReplyText('')
      if (data.ticket) {
        setTickets((prev) => prev.map((t) => (t.id === data.ticket.id ? data.ticket : t)))
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gửi tin nhắn thất bại.')
    } finally {
      setSendingReply(false)
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
          aria-label="Mở trợ lý AI và liên hệ Admin"
          title="Hỏi trợ lý AI hoặc liên hệ Admin"
          className="fixed right-4 bottom-20 tablet:bottom-6 z-40 group flex items-center gap-2 rounded-full bg-gradient-to-r from-[#1A73E8] to-indigo-600 text-white px-3.5 py-3 shadow-lg shadow-blue-600/30 hover:shadow-xl hover:scale-[1.03] active:scale-95 transition-all no-print"
        >
          <span className="relative flex items-center justify-center">
            <Bot size={20} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#1A73E8]" />
          </span>
          <span className="hidden sm:inline text-xs font-bold pr-0.5">
            {isAdmin ? 'Hỏi AI HDSD' : 'Hỏi AI & Admin'}
          </span>
        </button>
      )}

      {/* Cửa sổ Chatbox */}
      {open && (
        <div
          role="dialog"
          aria-label="Trợ lý AI và Liên hệ Admin"
          className="fixed right-3 left-3 sm:left-auto sm:right-5 bottom-20 tablet:bottom-6 z-50 sm:w-[380px] max-h-[78vh] h-[510px] flex flex-col rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] shadow-2xl overflow-hidden no-print"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-[#1A73E8] to-indigo-600 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                {activeTab === 'admin' ? <Headset size={18} /> : <Bot size={18} />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight truncate flex items-center gap-1.5">
                  {activeTab === 'admin' ? 'Liên hệ Quản trị viên' : 'Trợ lý hướng dẫn App'}
                  <Sparkles size={13} className="text-amber-300 shrink-0" />
                </div>
                <div className="text-[10px] text-blue-100 flex items-center gap-1 mt-0.5">
                  <ShieldCheck size={11} className="shrink-0" />
                  <span>
                    {activeTab === 'admin'
                      ? 'Gửi đơn khiếu nại / hỗ trợ & chat 2 chiều'
                      : 'Chỉ giải đáp HDSD · Không lộ thông tin'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {activeTab === 'ai' && (
                <button
                  type="button"
                  onClick={handleResetChat}
                  title="Làm mới cuộc trò chuyện"
                  className="p-1.5 rounded-lg hover:bg-white/15 text-blue-100 hover:text-white transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
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

          {/* Thanh chuyển tab AI / Liên hệ Admin (dành cho Giáo viên) */}
          {!isAdmin && (
            <div className="grid grid-cols-2 border-b border-gray-200 dark:border-[#2D2F34] bg-slate-50 dark:bg-[#24262B] p-1 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
                  activeTab === 'ai'
                    ? 'bg-white dark:bg-[#1E1F22] text-[#1A73E8] dark:text-[#8AB4F8] shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <Bot size={14} />
                Hỏi AI HDSD
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition-all relative',
                  activeTab === 'admin'
                    ? 'bg-white dark:bg-[#1E1F22] text-[#1A73E8] dark:text-[#8AB4F8] shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <Headset size={14} />
                Liên hệ Admin
                {repliedCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-white">
                    {repliedCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* TAB 1: HỎI AI HDSD */}
          {activeTab === 'ai' && (
            <>
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

              <div className="px-3 py-2 border-t border-gray-100 dark:border-[#2D2F34] bg-white dark:bg-[#1E1F22] space-y-2 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
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
            </>
          )}

          {/* TAB 2: LIÊN HỆ ADMIN / KHIẾU NẠI / HỖ TRỢ */}
          {activeTab === 'admin' && !isAdmin && (
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/70 dark:bg-[#18191C]">
              {/* View A: Đang tạo đơn mới */}
              {creatingTicket ? (
                <form
                  onSubmit={handleCreateTicket}
                  className="flex-1 flex flex-col p-3.5 gap-3 overflow-y-auto"
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setCreatingTicket(false)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
                    >
                      <ArrowLeft size={14} /> Quay lại
                    </button>
                    <span className="text-xs font-bold text-slate-800 dark:text-white">
                      Gửi đơn Hỗ trợ / Khiếu nại
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Loại yêu cầu
                    </label>
                    <select
                      value={ticketCategory}
                      onChange={(e) =>
                        setTicketCategory(e.target.value as SupportTicket['category'])
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#24262B] border border-gray-200 dark:border-[#37393F] text-xs"
                    >
                      <option value="support">Hỗ trợ sử dụng</option>
                      <option value="complaint">Khiếu nại / Phản ánh</option>
                      <option value="bug">Báo lỗi phần mềm</option>
                      <option value="account">Vấn đề tài khoản</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Tiêu đề ngắn gọn *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={140}
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder="VD: Cần hỗ trợ đồng bộ lịch / Khiếu nại..."
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#24262B] border border-gray-200 dark:border-[#37393F] text-xs"
                    />
                  </div>

                  <div className="flex-1 flex flex-col">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Nội dung chi tiết *
                    </label>
                    <textarea
                      required
                      rows={5}
                      maxLength={2000}
                      value={ticketBody}
                      onChange={(e) => setTicketBody(e.target.value)}
                      placeholder="Mô tả chi tiết vấn đề bạn đang gặp phải để Admin hỗ trợ nhanh nhất..."
                      className="w-full flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#24262B] border border-gray-200 dark:border-[#37393F] text-xs resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingTicket || !ticketSubject.trim() || !ticketBody.trim()}
                    className="w-full py-2.5 rounded-xl bg-[#1A73E8] hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                  >
                    {submittingTicket ? 'Đang gửi tới Admin...' : 'Gửi đơn tới Admin'}
                  </button>
                </form>
              ) : selectedTicket ? (
                /* View B: Chat 2 chiều trong 1 đơn cụ thể */
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="px-3.5 py-2.5 bg-white dark:bg-[#1E1F22] border-b border-gray-200 dark:border-[#2D2F34] flex items-center justify-between gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedTicketId(null)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 shrink-0"
                    >
                      <ArrowLeft size={14} /> Danh sách
                    </button>
                    <div className="min-w-0 text-right">
                      <div className="text-xs font-bold text-slate-800 dark:text-white truncate">
                        {selectedTicket.subject}
                      </div>
                      <span
                        className={cn(
                          'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mt-0.5',
                          STATUS_BADGES[selectedTicket.status].cls
                        )}
                      >
                        {STATUS_BADGES[selectedTicket.status].label}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                    {selectedTicket.messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'flex flex-col',
                          m.sender_role === 'user' ? 'items-end' : 'items-start'
                        )}
                      >
                        <span className="text-[10px] text-slate-400 mb-0.5 px-1">
                          {m.sender_role === 'admin' ? `Admin (${m.sender_name})` : 'Bạn'}
                        </span>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-wrap',
                            m.sender_role === 'user'
                              ? 'bg-[#1A73E8] text-white rounded-br-sm'
                              : 'bg-white dark:bg-[#24262B] text-slate-800 dark:text-slate-100 border border-emerald-200 dark:border-emerald-800/60 rounded-bl-sm'
                          )}
                        >
                          {m.text}
                        </div>
                      </div>
                    ))}
                    <div ref={ticketEndRef} />
                  </div>

                  <form
                    onSubmit={handleSendTicketReply}
                    className="p-2.5 bg-white dark:bg-[#1E1F22] border-t border-gray-200 dark:border-[#2D2F34] flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Nhắn thêm cho Admin..."
                      disabled={sendingReply}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#282A2E] text-xs focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/50"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="p-2 rounded-xl bg-[#1A73E8] text-white hover:bg-blue-700 disabled:opacity-45 shrink-0"
                    >
                      <Send size={15} />
                    </button>
                  </form>
                </div>
              ) : (
                /* View C: Danh sách các đơn đã gửi */
                <div className="flex-1 flex flex-col min-h-0 p-3.5 gap-3">
                  <button
                    type="button"
                    onClick={() => setCreatingTicket(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#1A73E8] hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
                  >
                    <Plus size={15} />
                    Gửi đơn Hỗ trợ / Khiếu nại mới
                  </button>

                  <div className="flex-1 overflow-y-auto space-y-2">
                    {loadingTickets && tickets.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400">
                        Đang tải danh sách đơn...
                      </div>
                    ) : tickets.length === 0 ? (
                      <div className="text-center py-8 px-4 rounded-2xl bg-white dark:bg-[#24262B] border border-dashed border-gray-200 dark:border-[#37393F]">
                        <Headset size={24} className="mx-auto text-slate-400 mb-2" />
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Chưa có đơn hỗ trợ / khiếu nại nào
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Bấm nút phía trên để gửi yêu cầu hoặc nhắn tin trực tiếp với Admin.
                        </div>
                      </div>
                    ) : (
                      tickets.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTicketId(t.id)}
                          className="w-full text-left p-3 rounded-xl bg-white dark:bg-[#24262B] border border-gray-200/80 dark:border-[#2D2F34] hover:border-[#1A73E8]/50 transition-all space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1">
                              {t.subject}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold',
                                STATUS_BADGES[t.status].cls
                              )}
                            >
                              {STATUS_BADGES[t.status].label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>{CATEGORY_LABELS[t.category]}</span>
                            <span>{t.messages.length} tin nhắn</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
