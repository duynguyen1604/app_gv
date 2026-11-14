import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Check,
  Clock,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useAppStore } from '../../store/useAppStore'
import { Modal } from '../ui/Modal'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import {
  computeStudentMonthSessionDetails,
  formatFullDdMmYyyy,
  formatShortDdMm,
  getClassSessionsForMonth,
  getStudentCurrentStatus,
  previewStatusChangeImpact,
} from '../../lib/debtEngine'
import { checkStudentSessionConflict } from '../../lib/conflictDetector'
import { formatMoney, formatMonth, getWeekdayShort } from '../../lib/dateUtils'
import type {
  GuestBillingMode,
  GuestReason,
  Student,
  StudentStatus,
} from '../../types'

// ============================================================================
// 1. Group A3: Hộp thoại "Chuyển sang đang học" / Đổi trạng thái học sinh
// ============================================================================
export function StudentStatusChangeModal({
  student,
  isOpen,
  onClose,
  defaultTargetStatus = 'active',
}: {
  student: Student | null
  isOpen: boolean
  onClose: () => void
  defaultTargetStatus?: StudentStatus
}) {
  const {
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    monthLocks,
    unlockMonth,
    changeStudentStatus,
  } = useAppStore()

  const todayStr = new Date().toISOString().slice(0, 10)
  const [newStatus, setNewStatus] = useState<StudentStatus>(defaultTargetStatus)
  const [dateMode, setDateMode] = useState<'today' | 'next_session' | 'custom'>('today')
  const [customDate, setCustomDate] = useState<string>(todayStr)
  const [trialPriceMode, setTrialPriceMode] = useState<'same' | 'free' | 'custom'>('same')
  const [customTrialPriceInput, setCustomTrialPriceInput] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [confirmUnlockMonth, setConfirmUnlockMonth] = useState<string | null>(null)

  const primaryClass = useMemo(
    () => classes.find((c) => c.id === student?.class_id),
    [classes, student?.class_id]
  )
  const regularPrice = student?.custom_price ?? primaryClass?.price ?? 0

  React.useEffect(() => {
    if (student && isOpen) {
      const cur = getStudentCurrentStatus(student, studentStatusHistory, todayStr)
      setNewStatus(cur === 'trial' ? 'active' : defaultTargetStatus)
      setDateMode('today')
      setCustomDate(todayStr)
      if (student.trial_price === 0) {
        setTrialPriceMode('free')
        setCustomTrialPriceInput('0')
      } else if (student.trial_price != null && student.trial_price !== regularPrice) {
        setTrialPriceMode('custom')
        setCustomTrialPriceInput(String(student.trial_price))
      } else {
        setTrialPriceMode('same')
        setCustomTrialPriceInput(String(regularPrice))
      }
      setNote('')
    }
  }, [student, isOpen, defaultTargetStatus, studentStatusHistory, todayStr, regularPrice])

  const resolvedTrialPrice = useMemo<number | null>(() => {
    if (trialPriceMode === 'same') return null
    if (trialPriceMode === 'free') return 0
    return Math.max(0, Math.round(Number(customTrialPriceInput) || 0))
  }, [trialPriceMode, customTrialPriceInput])

  // Find next upcoming session date for this student's class
  const nextSessionDate = useMemo(() => {
    if (!student) return todayStr
    const curMonth = todayStr.slice(0, 7)
    const sessions = getClassSessionsForMonth({
      classId: student.class_id,
      monthStr: curMonth,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
    const upcoming = sessions.find((s) => s.date > todayStr)
    if (upcoming) return upcoming.date
    return todayStr
  }, [student, todayStr, scheduleRules, sessionExceptions, extraSessions, holidays])

  const effectiveFrom =
    dateMode === 'today'
      ? todayStr
      : dateMode === 'next_session'
      ? nextSessionDate
      : customDate || todayStr

  const preview = useMemo(() => {
    if (!student) return null
    return previewStatusChangeImpact({
      student,
      newStatus,
      effectiveFrom,
      trialPriceOverride: resolvedTrialPrice,
      classes,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      attendance,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
      monthLocks,
    })
  }, [
    student,
    newStatus,
    effectiveFrom,
    resolvedTrialPrice,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    monthLocks,
  ])

  if (!student) return null

  const studentHistory = studentStatusHistory
    .filter((h) => h.student_id === student.id)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))

  const handleSave = () => {
    if (preview && preview.locked_months_affected.length > 0) {
      setConfirmUnlockMonth(preview.locked_months_affected[0].month)
      return
    }
    changeStudentStatus({
      studentId: student.id,
      newStatus,
      effectiveFrom,
      trialPrice: resolvedTrialPrice,
      note:
        note.trim() ||
        (newStatus === 'active'
          ? `Chuyển sang đang học (tính phí từ ${formatFullDdMmYyyy(effectiveFrom)})`
          : newStatus === 'trial'
          ? `Chuyển sang học thử (${
              resolvedTrialPrice === null
                ? `bằng phí học ${formatMoney(regularPrice)}/buổi`
                : resolvedTrialPrice === 0
                ? 'miễn phí 0đ'
                : `${formatMoney(resolvedTrialPrice)}/buổi`
            } · từ ${formatFullDdMmYyyy(effectiveFrom)})`
          : `Nghỉ học từ ${formatFullDdMmYyyy(effectiveFrom)}`),
    })
    toast.success(
      newStatus === 'active'
        ? `Đã chuyển ${student.name} sang Đang học từ ${formatFullDdMmYyyy(effectiveFrom)}`
        : newStatus === 'trial'
        ? `Đã cập nhật ${student.name} sang Học thử từ ${formatFullDdMmYyyy(effectiveFrom)}`
        : `Đã ghi nhận ${student.name} nghỉ học từ ${formatFullDdMmYyyy(effectiveFrom)}`
    )
    onClose()
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Trạng thái học & tính phí · ${student.name}`}
        size="md"
      >
        <div className="space-y-4">
          {/* Status Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Trạng thái mới
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    value: 'active',
                    label: 'Đang học',
                    sub: `Chính thức · ${formatMoney(regularPrice)}/buổi`,
                    color: 'emerald',
                  },
                  {
                    value: 'trial',
                    label: 'Học thử',
                    sub:
                      resolvedTrialPrice === 0
                        ? 'Miễn phí 0đ · vẫn điểm danh'
                        : `Phí thử: ${formatMoney(resolvedTrialPrice ?? regularPrice)}/buổi`,
                    color: 'amber',
                  },
                  {
                    value: 'left',
                    label: 'Đã nghỉ',
                    sub: 'Ẩn khỏi buổi sau ngày nghỉ',
                    color: 'slate',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewStatus(opt.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    newStatus === opt.value
                      ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-400 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {opt.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Editable Trial Fee Section */}
          <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/60 space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
              Mức phí học thử / buổi (Có thể thay đổi)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTrialPriceMode('same')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  trialPriceMode === 'same'
                    ? 'border-amber-600 bg-amber-100/80 dark:bg-amber-900/50 dark:border-amber-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Bằng phí đi học
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatMoney(regularPrice)}/buổi (Mặc định)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTrialPriceMode('free')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  trialPriceMode === 'free'
                    ? 'border-amber-600 bg-amber-100/80 dark:bg-amber-900/50 dark:border-amber-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Miễn phí (0đ)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Không thu tiền buổi thử
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTrialPriceMode('custom')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  trialPriceMode === 'custom'
                    ? 'border-amber-600 bg-amber-100/80 dark:bg-amber-900/50 dark:border-amber-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Mức phí khác
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Nhập số tiền riêng
                </div>
              </button>
            </div>

            {trialPriceMode === 'custom' && (
              <div>
                <input
                  type="number"
                  step={10000}
                  min={0}
                  value={customTrialPriceInput}
                  onChange={(e) => setCustomTrialPriceInput(e.target.value)}
                  placeholder="Nhập học phí học thử / buổi (VNĐ)..."
                  className="input-field text-sm"
                />
              </div>
            )}
          </div>

          {/* Effective From Date */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {newStatus === 'active'
                ? 'Tính phí từ ngày'
                : newStatus === 'trial'
                ? 'Áp dụng học thử từ ngày'
                : 'Nghỉ học từ ngày'}
            </label>
            <div className="flex flex-wrap gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => setDateMode('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  dateMode === 'today'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                Hôm nay ({formatShortDdMm(todayStr)})
              </button>
              <button
                type="button"
                onClick={() => setDateMode('next_session')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  dateMode === 'next_session'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                Từ buổi kế tiếp ({formatShortDdMm(nextSessionDate)})
              </button>
              <button
                type="button"
                onClick={() => setDateMode('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  dateMode === 'custom'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                Chọn ngày khác (kể cả quá khứ)
              </button>
            </div>

            {dateMode === 'custom' && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="input-field text-sm"
              />
            )}
          </div>

          {/* Live Fee Preview Box (Group A3) */}
          {preview && (
            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Xem trước học phí {formatMonth(preview.monthStr)}
                </span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  Đơn giá: {formatMoney(preview.unit_price)}/buổi
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Học thử {preview.trial_count} buổi ({formatMoney(preview.trial_unit_price)}/buổi) · Tính phí {preview.billable_count} buổi ={' '}
                <span className="text-blue-600 dark:text-blue-400">
                  {formatMoney(preview.estimated_due)}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Các buổi trước ngày {formatFullDdMmYyyy(effectiveFrom)} giữ nguyên trạng thái cũ.
              </p>
            </div>
          )}

          {/* Retroactive Past Date Warning (Group A3) */}
          {preview && preview.retroactive_sessions.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold">
                  Cảnh báo ngày hiệu lực trong quá khứ ({preview.retroactive_sessions.length} buổi bị đổi):
                </p>
                <p>
                  Các buổi sau sẽ đổi trạng thái tính phí:{' '}
                  <span className="font-semibold">
                    {preview.retroactive_sessions
                      .map((s) => `${formatShortDdMm(s.date)} (${s.start_time})`)
                      .join(', ')}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Month Lock Guard (Group A3) */}
          {preview && preview.locked_months_affected.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200">
                <Lock className="w-4 h-4 shrink-0 text-rose-600" />
                <span>
                  Tháng {formatMonth(preview.locked_months_affected[0].month)} đã chốt. Cần mở chốt trước khi đổi trạng thái quá khứ.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmUnlockMonth(preview.locked_months_affected[0].month)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold shrink-0 flex items-center gap-1"
              >
                <Unlock className="w-3.5 h-3.5" /> Mở chốt
              </button>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Ghi chú thay đổi (tuỳ chọn)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Phụ huynh đồng ý đăng ký học chính thức sau 2 buổi thử"
              className="input-field text-sm"
            />
          </div>

          {/* History Timeline */}
          {studentHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Lịch sử trạng thái của {student.name}
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {studentHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                          h.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : h.status === 'trial'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {h.status === 'active'
                          ? 'Đang học'
                          : h.status === 'trial'
                          ? 'Học thử'
                          : 'Đã nghỉ'}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        Từ {formatFullDdMmYyyy(h.effective_from)}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
                      {h.note || ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">
              Hủy
            </button>
            <button onClick={handleSave} className="btn-primary flex-1 justify-center">
              <UserCheck className="w-4 h-4" /> Lưu thay đổi
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(confirmUnlockMonth)}
        onClose={() => setConfirmUnlockMonth(null)}
        onConfirm={() => {
          if (confirmUnlockMonth) {
            unlockMonth(student.class_id, confirmUnlockMonth)
            toast.success(`Đã mở chốt ${formatMonth(confirmUnlockMonth)}`)
            setConfirmUnlockMonth(null)
          }
        }}
        title="Mở chốt tháng để cập nhật trạng thái?"
        message={`Tháng ${confirmUnlockMonth ? formatMonth(confirmUnlockMonth) : ''} của lớp đang được chốt. Bạn có muốn mở chốt để áp dụng ngày tính phí trong quá khứ không?`}
        confirmText="Mở chốt ngay"
        variant="warning"
      />
    </>
  )
}

// ============================================================================
// 2. Group D4: Hộp thoại "Xếp học ghép / học thêm 1–2 buổi" (SessionGuestModal)
// ============================================================================
export function SessionGuestModal({
  isOpen,
  onClose,
  presetStudent = null,
  presetHostClassId = null,
  presetDate = null,
  presetStartTime = null,
}: {
  isOpen: boolean
  onClose: () => void
  presetStudent?: Student | null
  presetHostClassId?: string | null
  presetDate?: string | null
  presetStartTime?: string | null
}) {
  const {
    classes,
    students,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    studentEnrollments,
    sessionGuests,
    addSessionGuest,
  } = useAppStore()

  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedStudentId, setSelectedStudentId] = useState<string>(presetStudent?.id || '')
  const [hostClassId, setHostClassId] = useState<string>(presetHostClassId || '')
  const [hostSessionVal, setHostSessionVal] = useState<string>(
    presetDate && presetStartTime ? `${presetDate}|${presetStartTime}` : ''
  )
  const [kind, setKind] = useState<'swap' | 'extra'>('swap')
  const [homeSessionVal, setHomeSessionVal] = useState<string>('')
  const [billingMode, setBillingMode] = useState<GuestBillingMode>('home_price')
  const [customAmount, setCustomAmount] = useState<string>('150000')
  const [reason, setReason] = useState<GuestReason>('conflict')
  const [note, setNote] = useState<string>('')

  const selectedStudent = useMemo(
    () => presetStudent || students.find((s) => s.id === selectedStudentId) || null,
    [presetStudent, students, selectedStudentId]
  )

  React.useEffect(() => {
    if (isOpen) {
      const defaultHost =
        presetHostClassId ||
        (presetStudent
          ? classes.find((c) => c.id !== presetStudent.class_id)?.id
          : undefined) ||
        classes[0]?.id ||
        ''
      const st =
        presetStudent ||
        students.find((s) => s.status !== 'left' && s.class_id !== defaultHost) ||
        students.find((s) => s.status !== 'left') ||
        students[0] ||
        null
      setSelectedStudentId(st?.id || '')
      setHostClassId(defaultHost)
      if (presetDate && presetStartTime) {
        setHostSessionVal(`${presetDate}|${presetStartTime}`)
      } else {
        setHostSessionVal('')
      }
      setKind('swap')
      setBillingMode('home_price')
      setReason('conflict')
      setNote('')
    }
  }, [isOpen, presetStudent, presetHostClassId, presetDate, presetStartTime, students, classes])

  // Switch default billing mode when kind changes (Group D3: swap -> home_price, extra -> free default!)
  const handleKindChange = (nextKind: 'swap' | 'extra') => {
    setKind(nextKind)
    if (nextKind === 'swap') {
      setBillingMode('home_price')
    } else {
      setBillingMode('free')
    }
  }

  // Compute available sessions of hostClassId in current month
  const hostSessions = useMemo(() => {
    if (!hostClassId) return []
    const curMonth = (presetDate || todayStr).slice(0, 7)
    return getClassSessionsForMonth({
      classId: hostClassId,
      monthStr: curMonth,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
  }, [hostClassId, presetDate, todayStr, scheduleRules, sessionExceptions, extraSessions, holidays])

  React.useEffect(() => {
    if (!hostSessionVal && hostSessions.length > 0) {
      const next = hostSessions.find((s) => s.date >= todayStr) || hostSessions[0]
      setHostSessionVal(`${next.date}|${next.start_time}`)
    }
  }, [hostSessions, hostSessionVal, todayStr])

  // Compute home class sessions of selectedStudent in current month (for swap)
  const homeSessions = useMemo(() => {
    if (!selectedStudent) return []
    const curMonth = (hostSessionVal.split('|')[0] || todayStr).slice(0, 7)
    return getClassSessionsForMonth({
      classId: selectedStudent.class_id,
      monthStr: curMonth,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
  }, [selectedStudent, hostSessionVal, todayStr, scheduleRules, sessionExceptions, extraSessions, holidays])

  React.useEffect(() => {
    if (homeSessions.length > 0 && !homeSessionVal) {
      const targetDate = hostSessionVal.split('|')[0] || todayStr
      const nearest = homeSessions.find((s) => s.date >= targetDate) || homeSessions[0]
      setHomeSessionVal(`${nearest.date}|${nearest.start_time}`)
    }
  }, [homeSessions, homeSessionVal, hostSessionVal, todayStr])

  const [hostDate, hostStart] = (hostSessionVal || '|').split('|')
  const [homeDate, homeStart] = (homeSessionVal || '|').split('|')
  const hostClass = classes.find((c) => c.id === hostClassId)
  const homeClass = classes.find((c) => c.id === selectedStudent?.class_id)

  // Check student conflict
  const conflictWarnings = useMemo(() => {
    if (!selectedStudent || !hostClassId || !hostDate || !hostStart) return []
    return checkStudentSessionConflict({
      student: selectedStudent,
      targetClassId: hostClassId,
      date: hostDate,
      startTime: hostStart,
      endTime: '19:30',
      classes,
      studentEnrollments,
      sessionGuests,
      scheduleRules,
      sessionExceptions,
      extraSessions,
    })
  }, [
    selectedStudent,
    hostClassId,
    hostDate,
    hostStart,
    classes,
    studentEnrollments,
    sessionGuests,
    scheduleRules,
    sessionExceptions,
    extraSessions,
  ])

  const resolvedPricePreview = useMemo(() => {
    if (!selectedStudent) return 0
    if (billingMode === 'free') return 0
    if (billingMode === 'custom') return Math.max(0, Number(customAmount) || 0)
    if (billingMode === 'host_price') return hostClass?.price || 0
    return selectedStudent.custom_price ?? homeClass?.price ?? 0
  }, [selectedStudent, billingMode, customAmount, hostClass, homeClass])

  const handleSave = () => {
    if (!selectedStudent || !hostClassId || !hostDate || !hostStart) {
      toast.error('Vui lòng chọn đầy đủ học sinh, lớp nhận và buổi học')
      return
    }
    const homeKey =
      kind === 'swap' && selectedStudent.class_id && homeDate && homeStart
        ? `${selectedStudent.class_id}|${homeDate}|${homeStart}`
        : null

    addSessionGuest({
      host_class_id: hostClassId,
      date: hostDate,
      start_time: hostStart,
      student_id: selectedStudent.id,
      kind,
      home_class_id: selectedStudent.class_id,
      home_session_key: homeKey,
      home_date: kind === 'swap' ? homeDate : null,
      home_start_time: kind === 'swap' ? homeStart : null,
      billing_mode: billingMode,
      custom_amount: billingMode === 'custom' ? Math.max(0, Number(customAmount) || 0) : null,
      billed_class_id: kind === 'swap' ? selectedStudent.class_id : hostClassId,
      reason,
      note: note.trim() || null,
    })

    toast.success(
      `Đã xếp ${selectedStudent.name} vào lớp ${hostClass?.name || ''} ngày ${formatShortDdMm(hostDate)} (${hostStart})`
    )
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Xếp học ghép / Học thêm ngắn hạn (1–2 buổi)"
      size="md"
    >
      <div className="space-y-4">
        {/* Select Student */}
        {!presetStudent && (
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Chọn học sinh (từ các lớp khác)
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                setSelectedStudentId(e.target.value)
                setHomeSessionVal('')
              }}
              className="input-field text-sm"
            >
              {students.some((s) => s.status !== 'left' && s.class_id !== hostClassId) && (
                <optgroup label="Học sinh từ các lớp khác">
                  {students
                    .filter((s) => s.status !== 'left' && s.class_id !== hostClassId)
                    .map((s) => {
                      const c = classes.find((cl) => cl.id === s.class_id)
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name} — Lớp gốc: {c?.name || ''}
                        </option>
                      )
                    })}
                </optgroup>
              )}
              {students.some((s) => s.status !== 'left' && s.class_id === hostClassId) && (
                <optgroup label="Học sinh cùng lớp nhận (Học thêm / Bổ trợ)">
                  {students
                    .filter((s) => s.status !== 'left' && s.class_id === hostClassId)
                    .map((s) => {
                      const c = classes.find((cl) => cl.id === s.class_id)
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name} — Lớp gốc: {c?.name || ''}
                        </option>
                      )
                    })}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* Select Host Class & Session */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Lớp nhận học ghép
            </label>
            <select
              value={hostClassId}
              onChange={(e) => {
                const nextHost = e.target.value
                setHostClassId(nextHost)
                setHostSessionVal('')
                if (!presetStudent && selectedStudent?.class_id === nextHost) {
                  const otherSt = students.find(
                    (s) => s.status !== 'left' && s.class_id !== nextHost
                  )
                  if (otherSt) {
                    setSelectedStudentId(otherSt.id)
                    setHomeSessionVal('')
                  }
                }
              }}
              className="input-field text-sm"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatMoney(c.price)}/buổi)
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Buổi học tại lớp nhận
            </label>
            <select
              value={hostSessionVal}
              onChange={(e) => setHostSessionVal(e.target.value)}
              className="input-field text-sm"
            >
              {presetDate &&
                presetStartTime &&
                !hostSessions.some(
                  (s) => s.date === presetDate && s.start_time === presetStartTime
                ) && (
                  <option value={`${presetDate}|${presetStartTime}`}>
                    {getWeekdayShort(presetDate)} {formatFullDdMmYyyy(presetDate)} · {presetStartTime}
                  </option>
                )}
              {hostSessions.map((s) => (
                <option key={`${s.date}|${s.start_time}`} value={`${s.date}|${s.start_time}`}>
                  {getWeekdayShort(s.date)} {formatFullDdMmYyyy(s.date)} · {s.start_time}–{s.end_time}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Kind Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Hình thức học
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleKindChange('swap')}
              className={`p-3 rounded-xl border text-left transition-all ${
                kind === 'swap'
                  ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-400'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                1. Học ghép (Chuyển từ buổi lớp gốc)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Thay cho 1 buổi ở lớp {homeClass?.name || 'gốc'} (không tính trùng 2 lần)
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleKindChange('extra')}
              className={`p-3 rounded-xl border text-left transition-all ${
                kind === 'extra'
                  ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/40 dark:border-purple-400'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                2. Buổi học thêm lẻ (Bổ trợ / Ôn thi)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Không trừ buổi lớp gốc · mặc định miễn phí 0đ
              </div>
            </button>
          </div>
        </div>

        {/* Original Session Selector if kind === 'swap' */}
        {kind === 'swap' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Thay cho buổi nào của lớp gốc ({homeClass?.name || ''})?
            </label>
            <select
              value={homeSessionVal}
              onChange={(e) => setHomeSessionVal(e.target.value)}
              className="input-field text-sm"
            >
              {homeSessions.map((s) => (
                <option key={`${s.date}|${s.start_time}`} value={`${s.date}|${s.start_time}`}>
                  Buổi {getWeekdayShort(s.date)} ngày {formatFullDdMmYyyy(s.date)} ({s.start_time})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Billing Mode Selector (Group D3) */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Cách tính học phí buổi này
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                {
                  mode: 'free',
                  label: 'Miễn phí (0đ)',
                  sub: kind === 'extra' ? 'Mặc định tăng cường' : 'Không thu tiền',
                },
                {
                  mode: 'home_price',
                  label: 'Giá lớp gốc',
                  sub: formatMoney(selectedStudent?.custom_price ?? homeClass?.price ?? 0),
                },
                {
                  mode: 'host_price',
                  label: 'Giá lớp nhận',
                  sub: formatMoney(hostClass?.price ?? 0),
                },
                {
                  mode: 'custom',
                  label: 'Nhập số tiền',
                  sub: 'Tùy chỉnh VNĐ',
                },
              ] as const
            ).map((b) => (
              <button
                key={b.mode}
                type="button"
                onClick={() => setBillingMode(b.mode)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  billingMode === b.mode
                    ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-400'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {b.label}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{b.sub}</div>
              </button>
            ))}
          </div>

          {billingMode === 'custom' && (
            <div className="mt-2">
              <input
                type="number"
                step={10000}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="input-field text-sm"
                placeholder="Nhập số tiền VNĐ..."
              />
            </div>
          )}
        </div>

        {/* Reason & Note */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Lý do
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as GuestReason)}
              className="input-field text-sm"
            >
              <option value="conflict">Bận việc riêng / Trùng lịch</option>
              <option value="review">Ôn thi / Bổ trợ kiến thức</option>
              <option value="other">Lý do khác</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Ghi chú
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Phụ huynh xin đổi buổi tối T3"
              className="input-field text-sm"
            />
          </div>
        </div>

        {/* Student Schedule Conflict Warning */}
        {conflictWarnings.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              {conflictWarnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Preview */}
        {selectedStudent && hostDate && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-100">
              Xem trước trước khi lưu:
            </div>
            <div className="text-slate-600 dark:text-slate-300">
              • Học sinh <span className="font-semibold">{selectedStudent.name}</span> sẽ có mặt trong danh sách điểm danh lớp{' '}
              <span className="font-semibold">{hostClass?.name}</span> ngày{' '}
              <span className="font-semibold">{formatFullDdMmYyyy(hostDate)} ({hostStart})</span>.
            </div>
            {kind === 'swap' && homeDate && (
              <div className="text-slate-600 dark:text-slate-300">
                • Buổi gốc ngày <span className="font-semibold">{formatShortDdMm(homeDate)}</span> ở lớp{' '}
                <span className="font-semibold">{homeClass?.name}</span> sẽ đánh dấu{' '}
                <span className="italic">"Đã sang {hostClass?.name} ({formatShortDdMm(hostDate)})"</span>.
              </div>
            )}
            <div className="text-slate-600 dark:text-slate-300">
              • Học phí khi điểm danh Có mặt:{' '}
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {formatMoney(resolvedPricePreview)}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2.5 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">
            Hủy
          </button>
          <button onClick={handleSave} className="btn-primary flex-1 justify-center">
            <UserPlus className="w-4 h-4" /> Lưu học ghép
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================================
// 3. Group D4: Hộp thoại "Đăng ký học thêm dài hạn ở lớp khác"
// ============================================================================
export function LongTermExtraEnrollmentModal({
  student,
  isOpen,
  onClose,
}: {
  student: Student | null
  isOpen: boolean
  onClose: () => void
}) {
  const {
    classes,
    scheduleRules,
    studentEnrollments,
    addLongTermExtraEnrollment,
    endStudentEnrollment,
    deleteStudentEnrollment,
  } = useAppStore()

  const todayStr = new Date().toISOString().slice(0, 10)
  const otherClasses = useMemo(
    () => classes.filter((c) => c.id !== student?.class_id),
    [classes, student]
  )
  const [targetClassId, setTargetClassId] = useState<string>(otherClasses[0]?.id || '')
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])
  const [fromDate, setFromDate] = useState<string>(todayStr)
  const [toDate, setToDate] = useState<string>('')
  const [priceMode, setPriceMode] = useState<'class' | 'custom' | 'free'>('class')
  const [customPrice, setCustomPrice] = useState<string>('150000')
  const [initialStatus, setInitialStatus] = useState<StudentStatus>('active')
  const [note, setNote] = useState<string>('')

  React.useEffect(() => {
    if (isOpen && otherClasses.length > 0) {
      setTargetClassId(otherClasses[0].id)
      setSelectedRuleIds([])
      setFromDate(todayStr)
      setToDate('')
      setPriceMode('class')
      setInitialStatus('active')
      setNote('')
    }
  }, [isOpen, otherClasses, todayStr])

  if (!student) return null

  const classRules = scheduleRules.filter((r) => r.class_id === targetClassId)
  const targetCls = classes.find((c) => c.id === targetClassId)
  const existingExtras = studentEnrollments.filter(
    (e) => e.student_id === student.id && e.kind === 'extra'
  )

  const toggleRuleId = (id: string) => {
    setSelectedRuleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSave = () => {
    if (!targetClassId) {
      toast.error('Vui lòng chọn lớp học thêm')
      return
    }
    const priceOverride =
      priceMode === 'free'
        ? 0
        : priceMode === 'custom'
        ? Math.max(0, Number(customPrice) || 0)
        : null

    addLongTermExtraEnrollment({
      studentId: student.id,
      classId: targetClassId,
      scheduleRuleIds: selectedRuleIds.length > 0 ? selectedRuleIds : null,
      priceOverride,
      fromDate,
      toDate: toDate || null,
      initialStatus,
      note: note.trim() || null,
    })

    toast.success(`Đã đăng ký ${student.name} học thêm dài hạn tại lớp ${targetCls?.name || ''}`)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Đăng ký học thêm dài hạn · ${student.name}`}
      size="md"
    >
      <div className="space-y-4">
        {existingExtras.length > 0 && (
          <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-2">
            <div className="text-xs font-bold text-purple-900 dark:text-purple-200">
              Lớp đang đăng ký học thêm dài hạn:
            </div>
            {existingExtras.map((en) => {
              const c = classes.find((cl) => cl.id === en.class_id)
              return (
                <div
                  key={en.id}
                  className="flex items-center justify-between gap-2 text-xs bg-white dark:bg-slate-900 p-2 rounded-lg border border-purple-100 dark:border-purple-800/50"
                >
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {c?.name || en.class_id}
                    </span>{' '}
                    <span className="text-slate-500">
                      (Từ {formatShortDdMm(en.from_date)}
                      {en.to_date ? ` đến ${formatShortDdMm(en.to_date)}` : ' · Đang học'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!en.to_date && (
                      <button
                        type="button"
                        onClick={() => {
                          endStudentEnrollment(en.id, todayStr)
                          toast.success('Đã kết thúc đăng ký học thêm')
                        }}
                        className="px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold text-[11px]"
                      >
                        Kết thúc
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        deleteStudentEnrollment(en.id)
                        toast.success('Đã xóa đăng ký học thêm')
                      }}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Chọn lớp học thêm
          </label>
          <select
            value={targetClassId}
            onChange={(e) => {
              setTargetClassId(e.target.value)
              setSelectedRuleIds([])
            }}
            className="input-field text-sm"
          >
            {otherClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({formatMoney(c.price)}/buổi)
              </option>
            ))}
          </select>
        </div>

        {/* Specific schedule rules selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Chọn buổi cố định trong tuần (Bỏ trống = tất cả các buổi của lớp)
          </label>
          <div className="space-y-1.5">
            {classRules.map((r) => {
              const checked = selectedRuleIds.includes(r.id)
              return (
                <label
                  key={r.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    checked
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRuleId(r.id)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Thứ {r.weekday === 7 ? 'CN' : r.weekday + 1} ({r.start_time}–{r.end_time})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">Hàng tuần</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Từ ngày
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Đến ngày (tuỳ chọn)
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="input-field text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Mức học phí
            </label>
            <select
              value={priceMode}
              onChange={(e) => setPriceMode(e.target.value as any)}
              className="input-field text-sm"
            >
              <option value="class">Theo giá lớp ({formatMoney(targetCls?.price || 0)})</option>
              <option value="custom">Giá riêng (VNĐ/buổi)</option>
              <option value="free">Miễn phí (0đ)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Trạng thái ở lớp thêm
            </label>
            <select
              value={initialStatus}
              onChange={(e) => setInitialStatus(e.target.value as StudentStatus)}
              className="input-field text-sm"
            >
              <option value="active">Đang học (Tính phí)</option>
              <option value="trial">Học thử (Mặc định bằng phí học)</option>
            </select>
          </div>
        </div>

        {priceMode === 'custom' && (
          <div>
            <input
              type="number"
              step={10000}
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              className="input-field text-sm"
              placeholder="Nhập đơn giá riêng..."
            />
          </div>
        )}

        <div className="flex gap-2.5 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">
            Đóng
          </button>
          <button onClick={handleSave} className="btn-primary flex-1 justify-center">
            <Plus className="w-4 h-4" /> Đăng ký học thêm
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================================
// 4. Group E3: Hộp thoại "Chuyển lớp giữa tháng" (ClassTransferModal)
// ============================================================================
export function ClassTransferModal({
  student,
  isOpen,
  onClose,
}: {
  student: Student | null
  isOpen: boolean
  onClose: () => void
}) {
  const {
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    transferStudentClass,
  } = useAppStore()

  const todayStr = new Date().toISOString().slice(0, 10)
  const otherClasses = useMemo(
    () => classes.filter((c) => c.id !== student?.class_id),
    [classes, student]
  )
  const [toClassId, setToClassId] = useState<string>(otherClasses[0]?.id || '')
  const [transferDate, setTransferDate] = useState<string>(todayStr)
  const [priceOption, setPriceOption] = useState<'new_class' | 'keep_custom' | 'custom'>('new_class')
  const [customPriceInput, setCustomPriceInput] = useState<string>('')
  const [statusInNewClass, setStatusInNewClass] = useState<StudentStatus>('active')
  const [note, setNote] = useState<string>('')

  React.useEffect(() => {
    if (isOpen && student) {
      const firstTarget = classes.find((c) => c.id !== student.class_id)
      setToClassId(firstTarget?.id || '')
      setTransferDate(todayStr)
      setPriceOption(student.custom_price ? 'keep_custom' : 'new_class')
      setCustomPriceInput(String(student.custom_price || firstTarget?.price || 150000))
      setStatusInNewClass('active')
      setNote('')
    }
  }, [isOpen, student, classes, todayStr])

  const oldClass = classes.find((c) => c.id === student?.class_id)
  const newClass = classes.find((c) => c.id === toClassId)

  const resolvedCustomPrice = useMemo(() => {
    if (priceOption === 'new_class') return null
    if (priceOption === 'keep_custom') return student?.custom_price ?? null
    return Math.max(0, Number(customPriceInput) || 0)
  }, [priceOption, student, customPriceInput])

  // Live preview of month fee before & after transfer
  const transferPreview = useMemo(() => {
    if (!student || !toClassId || !transferDate) return null
    const monthStr = transferDate.slice(0, 7)
    const dayBefore = (() => {
      const [y, m, d] = transferDate.split('-').map(Number)
      const dt = new Date(y, m - 1, d - 1)
      return format(dt, 'yyyy-MM-dd')
    })()

    const simEnrollments = [
      ...studentEnrollments.map((e) =>
        e.student_id === student.id && e.kind === 'primary' && (!e.to_date || e.to_date >= transferDate)
          ? { ...e, to_date: dayBefore }
          : e
      ),
      {
        id: 'sim-transfer-enr',
        student_id: student.id,
        class_id: toClassId,
        kind: 'primary' as const,
        schedule_rule_ids: null,
        price_override: resolvedCustomPrice,
        from_date: transferDate,
        to_date: null,
        note: null,
        created_at: new Date().toISOString(),
        user_id: 'local',
      },
    ]

    const simHistory = [
      ...studentStatusHistory,
      {
        id: 'sim-transfer-ssh',
        student_id: student.id,
        enrollment_id: 'sim-transfer-enr',
        status: statusInNewClass,
        effective_from: transferDate,
        note: null,
        created_at: new Date().toISOString(),
        user_id: 'local',
      },
    ]

    return computeStudentMonthSessionDetails({
      student: { ...student, class_id: toClassId, custom_price: resolvedCustomPrice },
      monthStr,
      classes,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      attendance,
      studentEnrollments: simEnrollments,
      studentStatusHistory: simHistory,
      sessionGuests,
    })
  }, [
    student,
    toClassId,
    transferDate,
    resolvedCustomPrice,
    statusInNewClass,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
  ])

  if (!student) return null

  const handleSave = () => {
    if (!toClassId) {
      toast.error('Vui lòng chọn lớp chuyển đến')
      return
    }
    transferStudentClass({
      studentId: student.id,
      toClassId,
      transferDate,
      customPrice: resolvedCustomPrice,
      statusInNewClass,
      note: note.trim() || null,
    })
    toast.success(
      `Đã chuyển ${student.name} từ ${oldClass?.name || ''} sang ${newClass?.name || ''} từ ${formatFullDdMmYyyy(transferDate)}`
    )
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Chuyển lớp · ${student.name}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500">Lớp hiện tại:</span>{' '}
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {oldClass?.name} ({formatMoney(student.custom_price ?? oldClass?.price ?? 0)}/buổi)
            </span>
          </div>
          <ArrowRightLeft className="w-4 h-4 text-blue-600" />
          <div>
            <span className="text-slate-500">Chuyển sang:</span>{' '}
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {newClass?.name || '...'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Chuyển sang lớp mới
            </label>
            <select
              value={toClassId}
              onChange={(e) => setToClassId(e.target.value)}
              className="input-field text-sm"
            >
              {otherClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatMoney(c.price)}/buổi)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Chuyển từ ngày
            </label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="input-field text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Mức học phí ở lớp mới
            </label>
            <select
              value={priceOption}
              onChange={(e) => setPriceOption(e.target.value as any)}
              className="input-field text-sm"
            >
              <option value="new_class">
                Theo giá lớp mới ({formatMoney(newClass?.price || 0)}/buổi)
              </option>
              {student.custom_price && (
                <option value="keep_custom">
                  Giữ giá riêng cũ ({formatMoney(student.custom_price)}/buổi)
                </option>
              )}
              <option value="custom">Nhập giá riêng mới</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Trạng thái ở lớp mới
            </label>
            <select
              value={statusInNewClass}
              onChange={(e) => setStatusInNewClass(e.target.value as StudentStatus)}
              className="input-field text-sm"
            >
              <option value="active">Đang học (Tính phí ngay)</option>
              <option value="trial">Học thử ở lớp mới</option>
            </select>
          </div>
        </div>

        {priceOption === 'custom' && (
          <div>
            <input
              type="number"
              step={10000}
              value={customPriceInput}
              onChange={(e) => setCustomPriceInput(e.target.value)}
              className="input-field text-sm"
              placeholder="Nhập đơn giá riêng (VNĐ/buổi)"
            />
          </div>
        )}

        {/* Live Fee Impact Preview (Group E3) */}
        {transferPreview && (
          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 space-y-1.5 text-xs">
            <div className="font-bold text-blue-900 dark:text-blue-200">
              Xem trước ảnh hưởng học phí tháng {formatMonth(transferDate.slice(0, 7))}:
            </div>
            {transferPreview.class_breakdowns.map((b) => (
              <div
                key={b.class_id}
                className="flex items-center justify-between text-slate-700 dark:text-slate-300"
              >
                <span>
                  • Lớp <span className="font-semibold">{b.class_name}</span> ({b.present_count} buổi có mặt × {formatMoney(b.price_per_session)}):
                </span>
                <span className="font-bold">{formatMoney(b.due_amount)}</span>
              </div>
            ))}
            <div className="pt-1 border-t border-blue-200/60 dark:border-blue-800/60 flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
              <span>Tổng phải thu dự kiến trong tháng:</span>
              <span className="text-blue-600 dark:text-blue-400">
                {formatMoney(transferPreview.due_amount)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Lịch sử điểm danh ở lớp {oldClass?.name} trước ngày {formatFullDdMmYyyy(transferDate)} được giữ nguyên.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Ghi chú chuyển lớp
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: Đổi ca học sang lớp tối Thứ 4"
            className="input-field text-sm"
          />
        </div>

        <div className="flex gap-2.5 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">
            Hủy
          </button>
          <button onClick={handleSave} className="btn-primary flex-1 justify-center">
            <ArrowRightLeft className="w-4 h-4" /> Xác nhận chuyển lớp
          </button>
        </div>
      </div>
    </Modal>
  )
}

