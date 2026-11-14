import React, { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRightLeft,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Phone,
  Plus,
  Printer,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useAppStore } from '../../store/useAppStore'
import {
  computeStudentDebtProfile,
  computeStudentMonthSessionDetails,
  formatFullDdMmYyyy,
  formatShortDdMm,
  generateDebtReminderMessage,
  getStudentCurrentStatus,
  type StudentSessionDetailItem,
} from '../../lib/debtEngine'
import {
  formatMoney,
  formatMonth,
  getDaysInMonth,
  getWeekdayShort,
  nextMonth,
  prevMonth,
} from '../../lib/dateUtils'
import type { AttendanceStatus, Student } from '../../types'

export function StudentFeeDetailDrawer({
  student,
  initialMonth,
  isOpen,
  onClose,
  onOpenRecordPayment,
  onOpenStatusChange,
  onOpenGuestModal,
  onOpenTransferClass,
}: {
  student: Student | null
  initialMonth: string
  isOpen: boolean
  onClose: () => void
  onOpenRecordPayment?: (student: Student, suggestedAmount?: number) => void
  onOpenStatusChange?: (student: Student) => void
  onOpenGuestModal?: (student: Student) => void
  onOpenTransferClass?: (student: Student) => void
}) {
  const {
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    paymentTransactions,
    monthLocks,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    sessionNotes,
    setAttendance,
  } = useAppStore()

  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth)
  const [classFilter, setClassFilter] = useState<string>('all')
  const [showCancelled, setShowCancelled] = useState<boolean>(false)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false)
  const [exportingImage, setExportingImage] = useState<boolean>(false)

  const printableRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  React.useEffect(() => {
    if (isOpen && initialMonth) {
      setSelectedMonth(initialMonth)
      setClassFilter('all')
      setEditingRowId(null)
    }
  }, [isOpen, initialMonth, student?.id])

  const profile = useMemo(() => {
    if (!student) return null
    return computeStudentDebtProfile({
      student,
      classes,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      attendance,
      paymentTransactions,
      monthLocks,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
      sessionNotes,
      targetMonth: selectedMonth,
    })
  }, [
    student,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    paymentTransactions,
    monthLocks,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    sessionNotes,
    selectedMonth,
  ])

  const monthDetails = useMemo(() => {
    if (!student) return null
    return computeStudentMonthSessionDetails({
      student,
      monthStr: selectedMonth,
      classes,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      attendance,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
      sessionNotes,
    })
  }, [
    student,
    selectedMonth,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    sessionNotes,
  ])

  if (!isOpen || !student || !profile || !monthDetails) return null

  const mSummary = profile.months[selectedMonth]
  const currentStatus = getStudentCurrentStatus(student, studentStatusHistory)
  const primaryClass = classes.find((c) => c.id === student.class_id)

  // Prior month cumulative balance carried forward
  const priorMonthStr = prevMonth(selectedMonth)
  const priorBalance = profile.months[priorMonthStr]?.cumulative_balance || 0

  // Filter session items
  const visibleItems = monthDetails.items.filter((item) => {
    if (!showCancelled && item.session_kind === 'cancelled_or_holiday') return false
    if (classFilter !== 'all' && item.class_id !== classFilter && item.billed_class_id !== classFilter) {
      return false
    }
    return true
  })

  // Days in month for Mini Calendar
  const daysInMonth = getDaysInMonth(selectedMonth)
  const firstDayWeekday = (() => {
    if (daysInMonth.length === 0) return 1
    const d = daysInMonth[0].getDay()
    return d === 0 ? 7 : d
  })()

  // Map date -> session items on that date
  const sessionsByDate = new Map<string, StudentSessionDetailItem[]>()
  for (const item of monthDetails.items) {
    if (!showCancelled && item.session_kind === 'cancelled_or_holiday') continue
    const arr = sessionsByDate.get(item.date) || []
    arr.push(item)
    sessionsByDate.set(item.date, arr)
  }

  // Month transactions
  const monthTransactions = paymentTransactions.filter(
    (t) => t.student_id === student.id && (t.paid_at || t.created_at).startsWith(selectedMonth)
  )

  const handleQuickAttendanceChange = (
    item: StudentSessionDetailItem,
    nextStatus: AttendanceStatus
  ) => {
    const isLocked = monthLocks.some(
      (l) => l.class_id === item.class_id && l.month === selectedMonth
    )
    if (isLocked) {
      toast.error(
        `Tháng ${formatMonth(selectedMonth)} của lớp ${item.class_name} đã chốt. Hãy mở chốt tháng trước khi sửa điểm danh.`
      )
      return
    }
    setAttendance(item.class_id, item.date, item.start_time, student.id, nextStatus)
    toast.success(`Đã cập nhật điểm danh ngày ${formatShortDdMm(item.date)}`)
    setEditingRowId(null)
  }

  const handleScrollToDate = (dateStr: string) => {
    const targetItem = visibleItems.find((i) => i.date === dateStr)
    if (targetItem && rowRefs.current[targetItem.id]) {
      rowRefs.current[targetItem.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setEditingRowId(targetItem.id)
    }
  }

  const handleExportPng = async () => {
    setExportingImage(true)
    try {
      const rows = visibleItems
      const rowHeight = 36
      const canvasWidth = 1000
      const headerHeight = 220
      const footerHeight = 120
      const canvasHeight = headerHeight + Math.max(1, rows.length) * rowHeight + footerHeight

      const canvas = document.createElement('canvas')
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2d context')

      // Background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      // Top Accent Banner
      ctx.fillStyle = '#1e40af'
      ctx.fillRect(0, 0, canvasWidth, 76)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText(`PHIẾU CHI TIẾT HỌC PHÍ — ${formatMonth(selectedMonth).toUpperCase()}`, 32, 46)

      // Student & Summary Info
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText(`Học sinh: ${student.name}`, 32, 114)
      ctx.font = '15px sans-serif'
      ctx.fillStyle = '#475569'
      ctx.fillText(
        `Lớp chính: ${primaryClass?.name || ''}   |   Phụ huynh: ${student.parent_name || '—'} (${student.parent_phone || '—'})`,
        32,
        142
      )
      if (monthDetails.status_note) {
        ctx.fillStyle = '#b45309'
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText(`Ghi chú: ${monthDetails.status_note}`, 32, 168)
      }

      // Table Header
      const tableTop = 186
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(28, tableTop, canvasWidth - 56, 32)
      ctx.fillStyle = '#334155'
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText('STT', 40, tableTop + 21)
      ctx.fillText('Ngày', 85, tableTop + 21)
      ctx.fillText('Thứ', 185, tableTop + 21)
      ctx.fillText('Khung giờ', 235, tableTop + 21)
      ctx.fillText('Lớp học', 360, tableTop + 21)
      ctx.fillText('Trạng thái buổi', 540, tableTop + 21)
      ctx.fillText('Thành tiền', 830, tableTop + 21)

      // Rows
      rows.forEach((item, idx) => {
        const y = tableTop + 32 + idx * rowHeight
        if (idx % 2 === 1) {
          ctx.fillStyle = '#f8fafc'
          ctx.fillRect(28, y, canvasWidth - 56, rowHeight)
        }
        ctx.fillStyle = '#0f172a'
        ctx.font = '13px sans-serif'
        ctx.fillText(String(idx + 1), 40, y + 23)
        ctx.fillText(formatFullDdMmYyyy(item.date), 85, y + 23)
        ctx.fillText(getWeekdayShort(item.weekday), 185, y + 23)
        ctx.fillText(`${item.start_time} - ${item.end_time}`, 235, y + 23)
        ctx.fillText(item.class_name, 360, y + 23)
        ctx.fillText(item.badge_label, 540, y + 23)
        ctx.font = 'bold 13px sans-serif'
        ctx.fillStyle = item.charged_amount > 0 ? '#047857' : '#64748b'
        ctx.fillText(formatMoney(item.charged_amount), 830, y + 23)
      })

      // Footer Summary
      const footerY = tableTop + 44 + Math.max(1, rows.length) * rowHeight
      ctx.fillStyle = '#eff6ff'
      ctx.fillRect(28, footerY, canvasWidth - 56, 76)
      ctx.fillStyle = '#1e3a8a'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText(
        `Có mặt tính phí: ${monthDetails.present_count} buổi   |   Học thử (0đ): ${monthDetails.trial_count} buổi   |   Vắng/Phép: ${monthDetails.absent_count + monthDetails.excused_count} buổi`,
        44,
        footerY + 30
      )
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText(
        `Phải thu tháng: ${formatMoney(mSummary?.due_amount || 0)}   |   Đã đóng: ${formatMoney(mSummary?.allocated_paid || 0)}   |   Còn cần đóng: ${formatMoney(profile.debt_amount)}`,
        44,
        footerY + 58
      )

      const link = document.createElement('a')
      link.download = `Phieu-hoc-phi-${student.name.replace(/\s+/g, '-')}-${selectedMonth}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      toast.success('Đã tải ảnh phiếu báo học phí!')
    } catch {
      toast.error('Không thể xuất ảnh phiếu học phí')
    } finally {
      setExportingImage(false)
    }
  }

  const handlePrintPdf = () => {
    window.print()
  }

  const detailedParentMessage = generateDebtReminderMessage({
    profile,
    selectedMonth,
    template: 'gentle',
    includeSessionBreakdown: true,
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-[2px] animate-fade-in">
      {/* Backdrop click */}
      <div className="hidden md:block flex-1" onClick={onClose} />

      {/* Right Slide-over Panel (680px on desktop, full screen on mobile) */}
      <div className="w-full md:w-[680px] lg:w-[720px] h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Sticky Top Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Quay lại"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {student.name}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    currentStatus === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : currentStatus === 'trial'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {currentStatus === 'active'
                    ? 'Đang học'
                    : currentStatus === 'trial'
                    ? `Học thử (${formatMoney(student.trial_price ?? student.custom_price ?? primaryClass?.price ?? 0)})`
                    : 'Đã nghỉ'}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                <span>Lớp chính: {primaryClass?.name || ''}</span>
                {student.parent_name && <span>· PH: {student.parent_name}</span>}
                {student.parent_phone && (
                  <a
                    href={`tel:${student.parent_phone}`}
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    <Phone className="w-3 h-3" /> {student.parent_phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Month Selector ‹ Tháng 11/2026 › */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1 shrink-0">
            <button
              onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 px-1.5">
              {formatMonth(selectedMonth)}
            </span>
            <button
              onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={printableRef}>
          {/* Status / Trial / Transfer Banner */}
          {monthDetails.status_note && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{monthDetails.status_note}</span>
              </div>
              {onOpenStatusChange && (
                <button
                  onClick={() => onOpenStatusChange(student)}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                >
                  Đổi trạng thái
                </button>
              )}
            </div>
          )}

          {/* Quick Lifecycle Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Class Filter if multiple classes */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setClassFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  classFilter === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                Tất cả lớp ({monthDetails.class_breakdowns.length || 1})
              </button>
              {monthDetails.class_breakdowns.map((b) => (
                <button
                  key={b.class_id}
                  onClick={() => setClassFilter(b.class_id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    classFilter === b.class_id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {b.class_name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {onOpenStatusChange && (
                <button
                  onClick={() => onOpenStatusChange(student)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 flex items-center gap-1"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  {currentStatus === 'trial' ? 'Chuyển sang đang học' : 'Trạng thái'}
                </button>
              )}
              {onOpenGuestModal && (
                <button
                  onClick={() => onOpenGuestModal(student)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Học ghép
                </button>
              )}
              {onOpenTransferClass && (
                <button
                  onClick={() => onOpenTransferClass(student)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 flex items-center gap-1"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Chuyển lớp
                </button>
              )}
            </div>
          </div>

          {/* 1. Top Summary KPI Cards (Group E4.1) */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-center">
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                {monthDetails.present_count}
              </div>
              <div className="text-[11px] font-medium text-emerald-800 dark:text-emerald-400">
                Có mặt (tính phí)
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 text-center">
              <div className="text-lg font-extrabold text-amber-700 dark:text-amber-300">
                {monthDetails.trial_count}
              </div>
              <div className="text-[11px] font-medium text-amber-800 dark:text-amber-400">
                Học thử ({student.trial_price === 0 ? '0đ' : formatMoney(student.trial_price ?? monthDetails.price_per_session)})
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/50 text-center">
              <div className="text-lg font-extrabold text-rose-600 dark:text-rose-400">
                {monthDetails.absent_count}
              </div>
              <div className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                Vắng (0đ)
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 text-center">
              <div className="text-lg font-extrabold text-amber-600 dark:text-amber-400">
                {monthDetails.excused_count}
              </div>
              <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Có phép (0đ)
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/50 text-center">
              <div className="text-lg font-extrabold text-purple-600 dark:text-purple-400">
                {monthDetails.guest_count}
              </div>
              <div className="text-[11px] font-medium text-purple-700 dark:text-purple-300">
                Học ghép
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-lg font-extrabold text-slate-600 dark:text-slate-300">
                {monthDetails.unmarked_count}
              </div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Chưa ĐD
              </div>
            </div>
          </div>

          {/* Financial Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Phải thu {formatMonth(selectedMonth)}
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                {formatMoney(mSummary?.due_amount || monthDetails.due_amount)}
              </div>
              {priorBalance !== 0 && (
                <div className="text-[11px] text-slate-500">
                  Số dư tháng trước:{' '}
                  <span className={priorBalance < 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {priorBalance < 0 ? `Nợ ${formatMoney(Math.abs(priorBalance))}` : `Dư ${formatMoney(priorBalance)}`}
                  </span>
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Đã thu (phân bổ FIFO)
              </div>
              <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatMoney(mSummary?.allocated_paid || 0)}
              </div>
              {mSummary && mSummary.paid_in_month > 0 && (
                <div className="text-[11px] text-slate-500">
                  Đóng trong tháng: {formatMoney(mSummary.paid_in_month)}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between sm:block">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase">
                  {(mSummary?.cumulative_balance || 0) < 0 ? 'Tổng còn nợ' : 'Số dư cuối tháng'}
                </div>
                <div
                  className={`text-base font-extrabold mt-0.5 ${
                    (mSummary?.cumulative_balance || 0) < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {(mSummary?.cumulative_balance || 0) < 0
                    ? formatMoney(Math.abs(mSummary?.cumulative_balance || 0))
                    : (mSummary?.cumulative_balance || 0) > 0
                    ? `+${formatMoney(mSummary?.cumulative_balance || 0)} (Dư)`
                    : '0đ (Đủ)'}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Mini Monthly Calendar of this Student (Group E4.2) */}
          <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                Lịch điểm danh thu nhỏ ({formatMonth(selectedMonth)})
              </span>
              <div className="flex items-center gap-2.5 flex-wrap text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Có mặt
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Học thử (0đ)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Vắng
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Có phép
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Học ghép
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 inline-block" /> Chưa ĐD
                </span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w) => (
                <div
                  key={w}
                  className="text-[10px] font-bold text-slate-400 dark:text-slate-500 py-1"
                >
                  {w}
                </div>
              ))}
              {Array.from({ length: firstDayWeekday - 1 }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-9" />
              ))}
              {daysInMonth.map((day) => {
                const dStr = format(day, 'yyyy-MM-dd')
                const daySessions = sessionsByDate.get(dStr) || []
                const hasSessions = daySessions.length > 0

                return (
                  <button
                    key={dStr}
                    type="button"
                    disabled={!hasSessions}
                    onClick={() => handleScrollToDate(dStr)}
                    className={`h-10 rounded-xl flex flex-col items-center justify-center transition-all border ${
                      hasSessions
                        ? 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/70 hover:border-blue-500 cursor-pointer'
                        : 'border-transparent text-slate-400 dark:text-slate-600 cursor-default'
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {day.getDate()}
                    </span>
                    {hasSessions && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {daySessions.map((ds) => (
                          <span
                            key={ds.id}
                            className={`w-2 h-2 rounded-full ${
                              ds.dot_color === 'green'
                                ? 'bg-emerald-500'
                                : ds.dot_color === 'red'
                                ? 'bg-rose-500'
                                : ds.dot_color === 'amber'
                                ? 'bg-amber-500'
                                : ds.dot_color === 'purple'
                                ? 'bg-purple-500'
                                : ds.dot_color === 'slate'
                                ? 'bg-slate-400'
                                : 'border border-slate-500 bg-transparent'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Session-by-Session Breakdown Table (Group E4.3) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Chi tiết từng buổi học ({visibleItems.length} buổi)
              </span>
              <button
                type="button"
                onClick={() => setShowCancelled((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600"
              >
                {showCancelled ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Ẩn buổi nghỉ / hủy
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Hiện cả buổi nghỉ / hủy
                  </>
                )}
              </button>
            </div>

            {visibleItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Chưa có buổi học nào của học sinh trong tháng {formatMonth(selectedMonth)}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500 bg-slate-50/50 dark:bg-slate-800/30">
                      <th className="py-2.5 px-3">Ngày</th>
                      <th className="py-2.5 px-3">Lớp & Giờ</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3 text-right">Thành tiền</th>
                      <th className="py-2.5 px-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleItems.map((item) => {
                      const isEditing = editingRowId === item.id
                      const canEditAttendance =
                        item.session_kind !== 'cancelled_or_holiday' &&
                        item.session_kind !== 'swapped_away'

                      return (
                        <React.Fragment key={item.id}>
                          {/* Mid-month Class Transfer Banner (Group E3 & E4) */}
                          {item.transfer_banner_before && (
                            <tr className="bg-blue-50/80 dark:bg-blue-950/40">
                              <td
                                colSpan={5}
                                className="py-1.5 px-3 text-center text-[11px] font-bold text-blue-700 dark:text-blue-300"
                              >
                                ── {item.transfer_banner_before} ──
                              </td>
                            </tr>
                          )}

                          <tr
                            ref={(el) => {
                              rowRefs.current[item.id] = el
                            }}
                            onClick={() => {
                              if (canEditAttendance) {
                                setEditingRowId(isEditing ? null : item.id)
                              }
                            }}
                            className={`transition-colors ${
                              canEditAttendance
                                ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                                : 'opacity-70 bg-slate-50/40 dark:bg-slate-900/40'
                            } ${
                              item.attendance_status === 'unmarked'
                                ? 'bg-amber-50/40 dark:bg-amber-950/15'
                                : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-100">
                              <div>{formatShortDdMm(item.date)}</div>
                              <div className="text-[10px] font-normal text-slate-400">
                                {getWeekdayShort(item.date)}
                              </div>
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: item.class_color }}
                                />
                                {item.class_name}
                              </div>
                              <div className="text-[11px] text-slate-500">{item.start_time}</div>
                            </td>

                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  item.dot_color === 'green'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : item.dot_color === 'red'
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                    : item.dot_color === 'amber'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                    : item.dot_color === 'purple'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                                    : item.dot_color === 'slate'
                                    ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    : 'bg-amber-100/80 text-amber-800 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-200'
                                }`}
                              >
                                {item.badge_label}
                              </span>
                              {item.out_of_enrollment_window && (
                                <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                  Ngoài thời gian ĐK
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold">
                              {item.charged_amount > 0 ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  +{formatMoney(item.charged_amount)}
                                </span>
                              ) : (
                                <span className="text-slate-400">0đ</span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-[200px]">
                              <div className="truncate">{item.note || '—'}</div>
                            </td>
                          </tr>

                          {/* Inline Quick Attendance Editor Row */}
                          {isEditing && (
                            <tr className="bg-blue-50/50 dark:bg-blue-950/20">
                              <td colSpan={5} className="px-3 py-2">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    Sửa nhanh điểm danh ngày {formatFullDdMmYyyy(item.date)}:
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAttendanceChange(item, 'present')}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                                    >
                                      Có mặt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAttendanceChange(item, 'absent')}
                                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                                    >
                                      Vắng (0đ)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAttendanceChange(item, 'excused')}
                                      className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                                    >
                                      Có phép (0đ)
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Per-Class Subtotals & Payment Transactions in Month (Group E4.4) */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Tổng kết học phí {formatMonth(selectedMonth)}
            </div>

            {monthDetails.class_breakdowns.map((b) => (
              <div
                key={b.class_id}
                className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"
              >
                <div>
                  <span className="font-bold">{b.class_name}</span>:{' '}
                  <span>
                    {b.present_count} buổi tính phí × {formatMoney(b.price_per_session)}
                  </span>
                  {b.trial_count > 0 && (
                    <span className="text-slate-500"> · {b.trial_count} buổi học thử (0đ)</span>
                  )}
                  {b.guest_count > 0 && (
                    <span className="text-purple-600"> · {b.guest_count} buổi học ghép</span>
                  )}
                </div>
                <span className="font-bold">{formatMoney(b.due_amount)}</span>
              </div>
            ))}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm font-extrabold text-slate-900 dark:text-slate-100">
              <span>Tổng phải thu {formatMonth(selectedMonth)}:</span>
              <span className="text-blue-600 dark:text-blue-400">
                {formatMoney(mSummary?.due_amount || monthDetails.due_amount)}
              </span>
            </div>

            {/* Payments recorded in this month */}
            {monthTransactions.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-[11px] font-bold text-slate-500">
                  Các khoản phụ huynh đã đóng trong tháng:
                </div>
                {monthTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300"
                  >
                    <span>
                      • Ngày {formatFullDdMmYyyy(tx.paid_at)} (
                      {tx.method === 'transfer'
                        ? 'Chuyển khoản'
                        : tx.method === 'cash'
                        ? 'Tiền mặt'
                        : 'Khác'}
                      ){tx.note ? ` — ${tx.note}` : ''}
                    </span>
                    <span className="font-bold">+{formatMoney(tx.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer with 3 Required Actions (Group E4.4) */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowMessageModal(true)}
              className="btn-primary text-xs py-2 px-3"
            >
              <MessageSquare className="w-4 h-4" /> Gửi phụ huynh
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              disabled={exportingImage}
              className="btn-secondary text-xs py-2 px-3"
            >
              <ImageIcon className="w-4 h-4" />
              {exportingImage ? 'Đang tạo ảnh...' : 'Xuất ảnh (PNG)'}
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="btn-secondary text-xs py-2 px-3"
            >
              <Printer className="w-4 h-4" /> Xuất PDF
            </button>
          </div>

          {onOpenRecordPayment && (
            <button
              type="button"
              onClick={() =>
                onOpenRecordPayment(
                  student,
                  Math.max(0, profile.debt_amount || mSummary?.shortage || 0)
                )
              }
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Ghi nhận khoản thu
            </button>
          )}
        </div>
      </div>

      {/* Parent Message Preview Modal */}
      {showMessageModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tin nhắn chi tiết học phí gửi phụ huynh ({student.name})
              </h3>
              <button
                onClick={() => setShowMessageModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              readOnly
              rows={12}
              value={detailedParentMessage}
              className="input-field text-xs font-mono leading-relaxed"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowMessageModal(false)}
                className="btn-secondary flex-1 justify-center"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(detailedParentMessage)
                  toast.success('Đã sao chép nội dung tin nhắn gửi phụ huynh!')
                }}
                className="btn-primary flex-1 justify-center"
              >
                <Copy className="w-4 h-4" /> Sao chép gửi Zalo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
