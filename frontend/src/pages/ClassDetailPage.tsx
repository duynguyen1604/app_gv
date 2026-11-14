import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus,
  Trash2,
  Pencil,
  Phone,
  BookOpen,
  Users,
  Clock,
  CheckCheck,
  ClipboardList,
  TrendingUp,
  Keyboard,
  FileText,
  Wallet,
  Lock,
  UserCheck,
  UserPlus,
  ArrowRightLeft,
  Sparkles,
  AlertTriangle,
  Calendar,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import {
  formatMoney,
  formatDate,
  formatDateShort,
  getWeekdayName,
  getDaysInMonth,
  dateToWeekday,
} from '../lib/dateUtils'
import { studentStatusLabel, studentStatusColor, cn, formatPhoneTel } from '../lib/utils'
import {
  computeAllStudentDebtProfiles,
  formatFullDdMmYyyy,
  formatShortDdMm,
  getEffectiveStudentsForSession,
  getPastSessionsForNewStartDate,
  getStudentCurrentStatus,
  getTrialReminderStudents,
} from '../lib/debtEngine'
import { RecordPaymentModal, StudentFeeLedgerModal } from '../components/fees/PaymentModals'
import { StudentFeeDetailDrawer } from '../components/fees/StudentFeeDetailDrawer'
import {
  StudentStatusChangeModal,
  SessionGuestModal,
  LongTermExtraEnrollmentModal,
  ClassTransferModal,
} from '../components/students/StudentLifecycleModals'
import { AddExtraSessionModal } from '../components/schedule/SessionActionModals'
import type {
  Student,
  AttendanceStatus,
  ScheduleRule,
  PaymentTransaction,
  ExtraSession,
} from '../types'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

function triggerHaptic(ms = 10) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(ms)
    }
  } catch {
    // Ignore on unsupported devices
  }
}

// Student form modal (Upgraded for Group E1 & E2: start_date, left_date & past start_date confirmation)
function StudentForm({
  initial,
  classId,
  onSave,
  onClose,
}: {
  initial?: Student
  classId: string
  onSave: (data: any) => void
  onClose: () => void
}) {
  const { classes, scheduleRules, sessionExceptions, extraSessions, holidays } = useAppStore()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const cls = classes.find((c) => c.id === classId)

  const [name, setName] = useState(initial?.name || '')
  const [parentName, setParentName] = useState(initial?.parent_name || '')
  const [parentPhone, setParentPhone] = useState(initial?.parent_phone || '')
  const [customPrice, setCustomPrice] = useState(initial?.custom_price?.toString() || '')
  const [trialPrice, setTrialPrice] = useState(
    initial?.trial_price != null ? initial.trial_price.toString() : ''
  )
  const [status, setStatus] = useState(initial?.status || 'active')
  const [startDate, setStartDate] = useState(initial?.start_date || todayStr)
  const [leftDate, setLeftDate] = useState(initial?.left_date || '')
  const [note, setNote] = useState(initial?.note || '')
  const [confirmedPastDates, setConfirmedPastDates] = useState(false)

  // Group E2: Compute past sessions between startDate and today if startDate < today
  const pastSessions = useMemo(() => {
    if (!startDate || startDate >= todayStr) return []
    if (initial && initial.start_date === startDate) return []
    return getPastSessionsForNewStartDate({
      classId,
      fromDate: startDate,
      todayStr,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
  }, [startDate, todayStr, initial, classId, scheduleRules, sessionExceptions, extraSessions, holidays])

  const regularPricePreview = customPrice ? parseInt(customPrice) || 0 : cls?.price || 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (pastSessions.length > 0 && !confirmedPastDates) {
      setConfirmedPastDates(true)
      return
    }
    onSave({
      class_id: classId,
      name: name.trim(),
      parent_name: parentName.trim() || null,
      parent_phone: parentPhone.trim() || null,
      custom_price: customPrice ? parseInt(customPrice) : null,
      trial_price: trialPrice !== '' ? Math.max(0, parseInt(trialPrice) || 0) : null,
      status,
      start_date: startDate || todayStr,
      left_date: status === 'left' ? leftDate || todayStr : leftDate || null,
      note: note.trim() || null,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="label">Họ và tên học sinh *</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vd: Nguyễn Minh An"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Tên phụ huynh</label>
          <input
            className="input"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="Tên bố/mẹ"
          />
        </div>
        <div>
          <label className="label">Số điện thoại PH</label>
          <input
            className="input"
            type="tel"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            placeholder="0912..."
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Học phí riêng/buổi (để trống = theo lớp)</label>
          <input
            className="input"
            type="number"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            placeholder={`Mặc định lớp: ${formatMoney(cls?.price || 0)}`}
          />
        </div>
        <div>
          <label className="label">Trạng thái học (có thể đổi bất cứ lúc nào)</label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="active">Đang học chính thức</option>
            <option value="trial">Học thử</option>
            <option value="left">Đã nghỉ học</option>
          </select>
        </div>
      </div>

      {/* Editable Trial Fee when status === 'trial' or trialPrice is set */}
      {(status === 'trial' || trialPrice !== '') && (
        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-xs font-bold text-amber-900 dark:text-amber-300">
              Phí học thử / buổi (Mặc định bằng phí đi học: {formatMoney(regularPricePreview)})
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTrialPrice('')}
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-colors',
                  trialPrice === ''
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                )}
              >
                Bằng phí học ({formatMoney(regularPricePreview)})
              </button>
              <button
                type="button"
                onClick={() => setTrialPrice('0')}
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-colors',
                  trialPrice === '0'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                )}
              >
                Miễn phí (0đ)
              </button>
            </div>
          </div>
          <input
            className="input text-sm"
            type="number"
            min={0}
            step={10000}
            value={trialPrice}
            onChange={(e) => setTrialPrice(e.target.value)}
            placeholder={`Để trống = Bằng phí đi học (${formatMoney(regularPricePreview)}/buổi), hoặc nhập mức phí khác`}
          />
        </div>
      )}

      {/* Group E1 & E2: Ngày bắt đầu học & Ngày nghỉ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Ngày bắt đầu học tại lớp *</label>
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setConfirmedPastDates(false)
            }}
          />
          {startDate > todayStr && (
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-1 block">
              📅 Bắt đầu từ {formatShortDdMm(startDate)} (chưa hiện trong điểm danh trước ngày này)
            </span>
          )}
        </div>
        {status === 'left' && (
          <div>
            <label className="label">Nghỉ học từ ngày</label>
            <input
              className="input"
              type="date"
              value={leftDate}
              onChange={(e) => setLeftDate(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Group E2: Past start_date warning & confirmation */}
      {pastSessions.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <span>
              Ngày bắt đầu học ({formatFullDdMmYyyy(startDate)}) nằm trong quá khứ ({pastSessions.length} buổi đã qua)
            </span>
          </div>
          <p>
            Các buổi từ {formatShortDdMm(startDate)} đến hôm nay sẽ xuất hiện với trạng thái{' '}
            <strong>"Chưa điểm danh"</strong> (màu vàng nhạt, 0đ cho đến khi thầy/cô chấm Có mặt):
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {pastSessions.slice(0, 10).map((s) => (
              <span
                key={`${s.date}-${s.start_time}`}
                className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 font-semibold text-[11px]"
              >
                {formatShortDdMm(s.date)} ({s.start_time})
              </span>
            ))}
            {pastSessions.length > 10 && (
              <span className="text-[11px] font-semibold">
                +{pastSessions.length - 10} buổi khác
              </span>
            )}
          </div>
          {confirmedPastDates && (
            <p className="font-bold text-amber-800 dark:text-amber-300 pt-1">
              👉 Bấm nút xác nhận bên dưới một lần nữa để hoàn tất lưu.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="label">Ghi chú học lực / lưu ý</label>
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ghi chú thêm về học sinh..."
        />
      </div>
      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Hủy
        </button>
        <button type="submit" className="btn-primary flex-1">
          {pastSessions.length > 0 && !confirmedPastDates
            ? `Xác nhận ngày quá khứ (${pastSessions.length} buổi)`
            : initial
            ? 'Lưu thay đổi'
            : 'Thêm học sinh'}
        </button>
      </div>
    </form>
  )
}

// Bulk add students form (Upgraded for Group E2: start_date & status)
function BulkAddForm({ classId, onClose }: { classId: string; onClose: () => void }) {
  const { addStudentsBulk } = useAppStore()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [text, setText] = useState('')
  const [startDate, setStartDate] = useState(todayStr)
  const [initialStatus, setInitialStatus] = useState<'active' | 'trial'>('active')

  const handleSubmit = () => {
    const names = text
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)
    if (names.length > 0) {
      addStudentsBulk(classId, names, {
        start_date: startDate || todayStr,
        status: initialStatus,
      })
      toast.success(`Đã thêm nhanh ${names.length} học sinh (bắt đầu từ ${formatShortDdMm(startDate)})!`)
      onClose()
    }
  }

  const count = text.split('\n').filter((n) => n.trim()).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Dán danh sách học sinh (mỗi học sinh 1 dòng):
      </p>
      <textarea
        className="input font-mono text-sm"
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Nguyễn Văn A\nTrần Thị B\nLê Hoàng C'}
        autoFocus
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">Ngày bắt đầu học chung</label>
          <input
            type="date"
            className="input text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label text-xs">Trạng thái ban đầu</label>
          <select
            className="input text-sm"
            value={initialStatus}
            onChange={(e) => setInitialStatus(e.target.value as 'active' | 'trial')}
          >
            <option value="active">Đang học chính thức</option>
            <option value="trial">Học thử (Mặc định bằng phí học)</option>
          </select>
        </div>
      </div>
      {count > 0 && (
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
          Sẵn sàng thêm {count} học sinh vào lớp (từ {formatFullDdMmYyyy(startDate)})
        </p>
      )}
      <div className="flex gap-2.5">
        <button onClick={onClose} className="btn-secondary flex-1">
          Hủy
        </button>
        <button onClick={handleSubmit} disabled={count === 0} className="btn-primary flex-1">
          Thêm {count > 0 ? count : ''} học sinh
        </button>
      </div>
    </div>
  )
}

// Schedule rule form
function ScheduleRuleForm({
  classId,
  initial,
  onSave,
  onClose,
}: {
  classId: string
  initial?: ScheduleRule
  onSave: (data: any) => void
  onClose: () => void
}) {
  const [weekday, setWeekday] = useState(initial?.weekday?.toString() || '2')
  const [startTime, setStartTime] = useState(initial?.start_time || '17:30')
  const [endTime, setEndTime] = useState(initial?.end_time || '19:00')
  const [validFrom, setValidFrom] = useState(
    initial?.valid_from || format(new Date(), 'yyyy-MM-dd')
  )
  const [validTo, setValidTo] = useState(initial?.valid_to || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      class_id: classId,
      weekday: parseInt(weekday),
      start_time: startTime,
      end_time: endTime,
      valid_from: validFrom,
      valid_to: validTo || null,
    })
    onClose()
  }

  const weekdays = [
    { val: '1', label: 'Thứ Hai' },
    { val: '2', label: 'Thứ Ba' },
    { val: '3', label: 'Thứ Tư' },
    { val: '4', label: 'Thứ Năm' },
    { val: '5', label: 'Thứ Sáu' },
    { val: '6', label: 'Thứ Bảy' },
    { val: '7', label: 'Chủ Nhật' },
  ]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="label">Thứ trong tuần</label>
        <select
          className="input"
          value={weekday}
          onChange={(e) => setWeekday(e.target.value)}
        >
          {weekdays.map((d) => (
            <option key={d.val} value={d.val}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Giờ bắt đầu</label>
          <input
            className="input"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Giờ kết thúc</label>
          <input
            className="input"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Áp dụng từ ngày</label>
          <input
            className="input"
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Đến ngày (tùy chọn)</label>
          <input
            className="input"
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Hủy
        </button>
        <button type="submit" className="btn-primary flex-1">
          {initial ? 'Lưu lịch' : 'Thêm ca cố định'}
        </button>
      </div>
    </form>
  )
}

export type SessionItem = {
  date: string
  start_time: string
  end_time: string
  label: string
  rule_id?: string
}

export function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    classes,
    students,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    deleteSessionGuest,
    scheduleRules,
    extraSessions,
    sessionExceptions,
    attendance,
    setAttendance,
    removeAttendance,
    sessionNotes,
    setSessionNote,
    addStudent,
    updateStudent,
    deleteStudent,
    addScheduleRule,
    deleteScheduleRule,
    deleteExtraSession,
    holidays,
    paymentTransactions,
    monthLocks,
    isMonthLocked,
    settings,
  } = useAppStore()

  const cls = classes.find((c) => c.id === classId)

  const initialTab =
    searchParams.get('tab') === 'guests'
      ? 'guests'
      : searchParams.get('tab') === 'students'
      ? 'students'
      : searchParams.get('tab') === 'schedule'
      ? 'schedule'
      : 'attendance'

  const [activeTab, setActiveTab] = useState<'attendance' | 'students' | 'guests' | 'schedule'>(
    initialTab
  )
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null)
  const [showAddRule, setShowAddRule] = useState(false)
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null)
  const [showExtraModal, setShowExtraModal] = useState(false)
  const [editingExtraSession, setEditingExtraSession] = useState<ExtraSession | null>(null)
  const [deleteExtraId, setDeleteExtraId] = useState<string | null>(null)
  const [deleteGuestId, setDeleteGuestId] = useState<string | null>(null)
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0)
  const [recordPaymentStudentId, setRecordPaymentStudentId] = useState<string | null>(null)
  const [editTx, setEditTx] = useState<PaymentTransaction | null>(null)
  const [ledgerStudentId, setLedgerStudentId] = useState<string | null>(null)

  // Group A3, D4, E3, E4 Modals & Drawer state
  const [statusModalStudent, setStatusModalStudent] = useState<Student | null>(null)
  const [guestModalConfig, setGuestModalConfig] = useState<{
    open: boolean
    student?: Student | null
    hostClassId?: string | null
    date?: string | null
    startTime?: string | null
  }>({ open: false })
  const [extraEnrollStudent, setExtraEnrollStudent] = useState<Student | null>(null)
  const [transferModalStudent, setTransferModalStudent] = useState<Student | null>(null)
  const [feeDetailStudent, setFeeDetailStudent] = useState<Student | null>(null)

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const debtProfilesMap = useMemo(
    () =>
      computeAllStudentDebtProfiles({
        classes,
        students,
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
      }),
    [
      classes,
      students,
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
    ]
  )

  // Group A4: Trial Reminder students who attended >= default_trial_sessions
  const trialReminders = useMemo(() => {
    if (!classId) return []
    return getTrialReminderStudents({
      classId,
      students,
      attendance,
      studentStatusHistory,
      defaultTrialSessions: settings.default_trial_sessions ?? 2,
    })
  }, [classId, students, attendance, studentStatusHistory, settings.default_trial_sessions])

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId),
    [students, classId]
  )
  const activeStudents = useMemo(
    () =>
      classStudents.filter(
        (s) => getStudentCurrentStatus(s, studentStatusHistory, todayStr) !== 'left'
      ),
    [classStudents, studentStatusHistory, todayStr]
  )
  const leftStudents = useMemo(
    () =>
      classStudents.filter(
        (s) => getStudentCurrentStatus(s, studentStatusHistory, todayStr) === 'left'
      ),
    [classStudents, studentStatusHistory, todayStr]
  )
  const rules = useMemo(
    () => scheduleRules.filter((r) => r.class_id === classId),
    [scheduleRules, classId]
  )
  const classExtras = useMemo(
    () =>
      extraSessions
        .filter((e) => e.class_id === classId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time)),
    [extraSessions, classId]
  )

  // Compute all sessions for this class (last 45 days + next 7 days + all extraSessions)
  const sessions = useMemo(() => {
    if (!classId) return []
    const result: SessionItem[] = []
    const now = new Date()
    const fromDate = new Date(now)
    fromDate.setDate(fromDate.getDate() - 45)
    const toDate = new Date(now)
    toDate.setDate(toDate.getDate() + 7)

    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd')
      const weekday = d.getDay() === 0 ? 7 : d.getDay()
      const applicable = scheduleRules.filter(
        (r) =>
          r.class_id === classId &&
          r.weekday === weekday &&
          r.valid_from <= dateStr &&
          (!r.valid_to || r.valid_to >= dateStr)
      )
      for (const rule of applicable) {
        const exception = sessionExceptions.find(
          (e) => e.rule_id === rule.id && e.original_date === dateStr
        )
        if (exception?.action === 'cancelled') continue
        if (exception?.action === 'moved') continue
        result.push({
          date: dateStr,
          start_time: rule.start_time,
          end_time: rule.end_time,
          label: `${getWeekdayName(weekday)}, ${formatDateShort(dateStr)}`,
          rule_id: rule.id,
        })
      }
    }

    const fromStr = format(fromDate, 'yyyy-MM-dd')
    const toStr = format(toDate, 'yyyy-MM-dd')

    extraSessions
      .filter((e) => e.class_id === classId)
      .forEach((e) => {
        const priceTag = e.custom_price != null ? ` (${formatMoney(e.custom_price)})` : ''
        result.push({
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
          label: `${e.makeup_for ? 'Dạy bù' : 'Phát sinh'}${priceTag}: ${formatDateShort(e.date)}`,
        })
      })

    sessionExceptions
      .filter((e) => {
        const rule = scheduleRules.find((r) => r.id === e.rule_id && r.class_id === classId)
        return (
          rule &&
          e.action === 'moved' &&
          e.new_date &&
          e.new_date >= fromStr &&
          e.new_date <= toStr
        )
      })
      .forEach((e) => {
        if (e.new_date && e.new_start && e.new_end) {
          result.push({
            date: e.new_date,
            start_time: e.new_start,
            end_time: e.new_end,
            label: `Đã dời: ${formatDateShort(e.new_date)}`,
            rule_id: e.rule_id,
          })
        }
      })

    return result.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return b.start_time.localeCompare(a.start_time)
    })
  }, [classId, scheduleRules, extraSessions, sessionExceptions])

  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(() => {
    const paramSession = searchParams.get('session')
    if (paramSession) {
      const [sDate, sStart] = paramSession.split('|')
      const match = sessions.find((s) => s.date === sDate && s.start_time === sStart)
      if (match) return match
    }
    const paramDate = searchParams.get('date')
    const paramStart = searchParams.get('start')
    if (paramDate && paramStart) {
      const match = sessions.find((s) => s.date === paramDate && s.start_time === paramStart)
      if (match) return match
    }
    const todayOrPast = sessions.find((s) => s.date <= todayStr)
    return todayOrPast || sessions[0] || null
  })

  useEffect(() => {
    if (!selectedSession && sessions.length > 0) {
      const todayOrPast = sessions.find((s) => s.date <= todayStr)
      setSelectedSession(todayOrPast || sessions[0])
    }
  }, [sessions, selectedSession, todayStr])

  const sessionKey = selectedSession
    ? `${selectedSession.date}-T-${selectedSession.start_time}`
    : ''

  // Group D4 & E1: Compute effective students for the currently selected session
  const effectiveSessionItems = useMemo(() => {
    if (!selectedSession || !classId) return []
    return getEffectiveStudentsForSession({
      classId,
      dateStr: selectedSession.date,
      startTime: selectedSession.start_time,
      ruleId: selectedSession.rule_id,
      students,
      classes,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
      attendance,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
  }, [
    selectedSession,
    classId,
    students,
    classes,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    attendance,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
  ])

  const attendableItems = useMemo(
    () =>
      effectiveSessionItems.filter(
        (it) => it.mode !== 'swapped_away' && it.mode !== 'future_start'
      ),
    [effectiveSessionItems]
  )

  const swappedAwayItems = useMemo(
    () => effectiveSessionItems.filter((it) => it.mode === 'swapped_away'),
    [effectiveSessionItems]
  )

  const sessionGuestCount = useMemo(
    () =>
      attendableItems.filter(
        (it) =>
          it.mode === 'guest_swap' ||
          it.mode === 'guest_extra' ||
          it.mode === 'extra_long_term'
      ).length,
    [attendableItems]
  )

  const currentAttendance = useMemo(() => {
    if (!selectedSession || !classId) return {}
    const att: Record<string, AttendanceStatus | undefined> = {}
    attendance
      .filter(
        (a) =>
          a.class_id === classId &&
          a.date === selectedSession.date &&
          a.start_time === selectedSession.start_time
      )
      .forEach((a) => {
        att[a.student_id] = a.status
      })
    return att
  }, [attendance, classId, selectedSession])

  const currentSessionNote = useMemo(() => {
    if (!selectedSession || !classId) return ''
    return (
      sessionNotes.find(
        (n) =>
          n.class_id === classId &&
          n.date === selectedSession.date &&
          n.start_time === selectedSession.start_time
      )?.content || ''
    )
  }, [sessionNotes, classId, selectedSession])

  const [noteDraft, setNoteDraft] = useState(currentSessionNote)
  useEffect(() => {
    setNoteDraft(currentSessionNote)
  }, [currentSessionNote])

  const handleAttend = (studentId: string, status: AttendanceStatus) => {
    if (!selectedSession || !classId) return
    triggerHaptic(8)
    const current = currentAttendance[studentId]
    if (current === status) {
      removeAttendance(classId, selectedSession.date, selectedSession.start_time, studentId)
    } else {
      setAttendance(classId, selectedSession.date, selectedSession.start_time, studentId, status)
    }
  }

  const handleAllPresent = () => {
    if (!selectedSession || !classId) return
    triggerHaptic(15)
    attendableItems.forEach((it) => {
      setAttendance(classId, selectedSession.date, selectedSession.start_time, it.student.id, 'present')
    })
    toast.success(`Đã đánh dấu Có mặt cho cả ${attendableItems.length} học sinh!`)
  }

  // Keyboard shortcuts for Desktop attendance table (P = Present, V = Absent, K = Excused, Up/Down arrows)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'attendance' || attendableItems.length === 0 || !selectedSession) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedRowIndex((prev) => Math.min(attendableItems.length - 1, prev + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedRowIndex((prev) => Math.max(0, prev - 1))
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault()
        const targetItem = attendableItems[focusedRowIndex]
        if (targetItem) {
          handleAttend(targetItem.student.id, 'present')
          setFocusedRowIndex((prev) => Math.min(attendableItems.length - 1, prev + 1))
        }
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault()
        const targetItem = attendableItems[focusedRowIndex]
        if (targetItem) {
          handleAttend(targetItem.student.id, 'absent')
          setFocusedRowIndex((prev) => Math.min(attendableItems.length - 1, prev + 1))
        }
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const targetItem = attendableItems[focusedRowIndex]
        if (targetItem) {
          handleAttend(targetItem.student.id, 'excused')
          setFocusedRowIndex((prev) => Math.min(attendableItems.length - 1, prev + 1))
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab, attendableItems, focusedRowIndex, selectedSession, currentAttendance])

  // Guests visiting this class & students of this class visiting other classes (Group D4)
  const incomingGuests = useMemo(
    () =>
      sessionGuests
        .filter((g) => g.host_class_id === classId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessionGuests, classId]
  )
  const incomingLongTermExtras = useMemo(
    () =>
      studentEnrollments.filter((e) => e.class_id === classId && e.kind === 'extra'),
    [studentEnrollments, classId]
  )
  const outgoingGuests = useMemo(
    () =>
      sessionGuests
        .filter((g) => {
          const st = students.find((s) => s.id === g.student_id)
          return g.home_class_id === classId || st?.class_id === classId
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessionGuests, students, classId]
  )

  // Monthly Quick Statistics (Section 3.3 Right Column)
  const monthlyStats = useMemo(() => {
    if (!classId || !cls) return { sessionsCount: 0, attendanceRate: 0, estimatedRevenue: 0 }
    const currentMonth = format(new Date(), 'yyyy-MM')
    const days = getDaysInMonth(currentMonth)
    const monthSessions: { date: string; start_time: string }[] = []

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd')
      const weekday = dateToWeekday(day)
      const applicable = scheduleRules.filter(
        (r) =>
          r.class_id === classId &&
          r.weekday === weekday &&
          r.valid_from <= dateStr &&
          (!r.valid_to || r.valid_to >= dateStr)
      )
      for (const rule of applicable) {
        const ex = sessionExceptions.find(
          (e) => e.rule_id === rule.id && e.original_date === dateStr
        )
        if (ex?.action === 'cancelled') continue
        if (ex?.action === 'moved') {
          if (ex.new_date?.startsWith(currentMonth) && ex.new_date && ex.new_start) {
            monthSessions.push({ date: ex.new_date, start_time: ex.new_start })
          }
          continue
        }
        monthSessions.push({ date: dateStr, start_time: rule.start_time })
      }
    }

    extraSessions
      .filter((e) => e.class_id === classId && e.date.startsWith(currentMonth))
      .forEach((e) => monthSessions.push({ date: e.date, start_time: e.start_time }))

    const monthAtt = attendance.filter(
      (a) => a.class_id === classId && a.date.startsWith(currentMonth)
    )
    const presentTotal = monthAtt.filter((a) => a.status === 'present').length
    const markedTotal = monthAtt.length
    const attendanceRate = markedTotal > 0 ? Math.round((presentTotal / markedTotal) * 100) : 100

    let estimatedRevenue = 0
    for (const st of activeStudents) {
      const prof = debtProfilesMap.get(st.id)
      const mSum = prof?.months[currentMonth]
      if (mSum) {
        estimatedRevenue += mSum.due_amount
      }
    }

    return {
      sessionsCount: monthSessions.length,
      attendanceRate,
      estimatedRevenue,
    }
  }, [classId, cls, scheduleRules, sessionExceptions, extraSessions, attendance, activeStudents, debtProfilesMap])

  if (!cls || !classId) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Không tìm thấy thông tin lớp học này.</p>
        <button onClick={() => navigate('/classes')} className="btn-primary mt-4">
          Quay lại danh sách lớp
        </button>
      </div>
    )
  }

  const markedCount = attendableItems.filter((it) => Boolean(currentAttendance[it.student.id])).length
  const presentCount = attendableItems.filter((it) => currentAttendance[it.student.id] === 'present').length
  const absentCount = attendableItems.filter((it) => currentAttendance[it.student.id] === 'absent').length
  const excusedCount = attendableItems.filter((it) => currentAttendance[it.student.id] === 'excused').length
  const progressPercent =
    attendableItems.length > 0 ? Math.round((markedCount / attendableItems.length) * 100) : 0

  return (
    <div className="min-h-screen pb-28 desktop:pb-10">
      <TopBar
        title={cls.name}
        subtitle={[
          cls.location,
          cls.price > 0 ? `${formatMoney(cls.price)}/buổi` : '',
          `${activeStudents.length} học sinh${
            incomingLongTermExtras.length > 0 ? ` (+${incomingLongTermExtras.length} học ghép dài hạn)` : ''
          }`,
        ]
          .filter(Boolean)
          .join(' · ')}
        back
        rightContent={
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 ring-4 ring-slate-100 dark:ring-slate-800"
              style={{ backgroundColor: cls.color }}
            />
            <button
              type="button"
              onClick={() => {
                setEditingExtraSession(null)
                setShowExtraModal(true)
              }}
              className="btn-secondary py-1.5 px-3 text-xs hidden sm:inline-flex text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/70 bg-purple-50/70 dark:bg-purple-950/30"
            >
              <Sparkles size={14} className="text-purple-600" /> + Lịch phát sinh
            </button>
            <button
              onClick={() =>
                setGuestModalConfig({
                  open: true,
                  hostClassId: classId,
                  date: selectedSession?.date || todayStr,
                  startTime: selectedSession?.start_time || '17:30',
                })
              }
              className="btn-secondary py-1.5 px-3 text-xs hidden sm:inline-flex"
            >
              <UserPlus size={14} className="text-purple-600" /> + Học ghép
            </button>
            <button
              onClick={() => setShowAddStudent(true)}
              className="btn-primary py-1.5 px-3 text-xs hidden sm:inline-flex"
            >
              <Plus size={15} /> Thêm học sinh
            </button>
          </div>
        }
      />

      {/* Mobile & Tablet Navigation Tabs (< 1200px) */}
      <div
        style={{ overflowAnchor: 'none' }}
        className="desktop:hidden sticky top-[64px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800"
      >
        <div className="flex max-w-3xl mx-auto overflow-x-auto no-scrollbar">
          {[
            { key: 'attendance', label: 'Điểm danh', count: null },
            { key: 'students', label: 'Học sinh', count: activeStudents.length },
            {
              key: 'guests',
              label: 'Học ghép',
              count: incomingGuests.length + outgoingGuests.length + incomingLongTermExtras.length,
            },
            { key: 'schedule', label: 'Lịch & Thống kê', count: rules.length + classExtras.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                'flex-1 py-3 px-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              )}
            >
              {tab.label}
              {tab.count !== null ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Container: 2-Column Split on Desktop (>= 1200px) */}
      <div className="p-4 tablet:p-6 max-w-[1600px] mx-auto flex flex-col gap-4">
        {/* Group A4: Trial Reminder Banner ("Em X đã học thử đủ 2 buổi, chuyển sang đang học?") */}
        {trialReminders.length > 0 && (
          <div className="flex flex-col gap-2">
            {trialReminders.map(({ student, attendedTrialCount }) => (
              <div
                key={student.id}
                className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-950 dark:text-amber-200">
                  <Sparkles size={18} className="text-amber-600 shrink-0" />
                  <span>
                    Em <strong>{student.name}</strong> đã học thử đủ{' '}
                    <strong>{attendedTrialCount} buổi</strong>, chuyển sang đang học chính thức?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusModalStudent(student)}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                >
                  <UserCheck size={14} />
                  <span>Chuyển sang đang học</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 desktop:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN (8/12 on Desktop): Attendance, Student Roster & Guests */}
          <div className="desktop:col-span-8 flex flex-col gap-4">
            {/* Desktop Sub-navigation Switcher */}
            <div className="hidden desktop:flex items-center justify-between bg-white dark:bg-slate-850 p-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveTab('attendance')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2',
                    activeTab === 'attendance' || activeTab === 'schedule'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <ClipboardList size={16} />
                  Bảng điểm danh
                </button>
                <button
                  onClick={() => setActiveTab('students')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2',
                    activeTab === 'students'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <Users size={16} />
                  Danh sách học sinh ({activeStudents.length})
                </button>
                <button
                  onClick={() => setActiveTab('guests')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2',
                    activeTab === 'guests'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <UserPlus size={16} />
                  Học ghép ({incomingGuests.length + outgoingGuests.length + incomingLongTermExtras.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setGuestModalConfig({
                      open: true,
                      hostClassId: classId,
                      date: selectedSession?.date || todayStr,
                      startTime: selectedSession?.start_time || '17:30',
                    })
                  }
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  <UserPlus size={14} className="text-purple-600" /> + Học ghép
                </button>
                <button
                  onClick={() => setShowBulkAdd(true)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  Dán danh sách
                </button>
                <button
                  onClick={() => setShowAddStudent(true)}
                  className="btn-primary py-1.5 px-3 text-xs"
                >
                  <Plus size={15} /> Thêm học sinh
                </button>
              </div>
            </div>

            {/* ATTENDANCE SECTION */}
            {(activeTab === 'attendance' ||
              (activeTab === 'schedule' && window.innerWidth >= 1200)) && (
              <div className="flex flex-col gap-4">
                {sessions.length === 0 ? (
                  <EmptyState
                    icon={<ClipboardList size={44} />}
                    title="Chưa có buổi học nào để điểm danh"
                    description="Hãy thêm lịch học cố định hằng tuần hoặc tạo buổi phát sinh trên màn Lịch để bắt đầu điểm danh."
                    action={
                      <button onClick={() => setShowAddRule(true)} className="btn-primary">
                        <Plus size={16} /> Thêm ca học cố định
                      </button>
                    }
                  />
                ) : (
                  <>
                    {/* Session Selector & Counter Header */}
                    <div className="card p-4 flex flex-col gap-3">
                      <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-3">
                        <div className="flex-1">
                          <label className="label text-xs">Buổi học đang điểm danh</label>
                          <select
                            className="input font-semibold text-sm"
                            value={sessionKey}
                            onChange={(e) => {
                              const val = e.target.value
                              const sepIdx = val.indexOf('-T-')
                              const date = val.substring(0, sepIdx)
                              const start_time = val.substring(sepIdx + 3)
                              const sess = sessions.find(
                                (s) => s.date === date && s.start_time === start_time
                              )
                              setSelectedSession(sess || null)
                            }}
                          >
                            {sessions.map((s) => (
                              <option
                                key={`${s.date}-T-${s.start_time}`}
                                value={`${s.date}-T-${s.start_time}`}
                              >
                                {s.label} · {s.start_time}–{s.end_time}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              setGuestModalConfig({
                                open: true,
                                hostClassId: classId,
                                date: selectedSession?.date || todayStr,
                                startTime: selectedSession?.start_time || '17:30',
                              })
                            }
                            className="btn-secondary py-2 px-3 text-xs"
                          >
                            <UserPlus size={15} className="text-purple-600" /> + Thêm học sinh học ghép
                          </button>
                          <button
                            onClick={handleAllPresent}
                            className="btn-primary bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCheck size={17} /> Tất cả có mặt
                          </button>
                        </div>
                      </div>

                      {/* Progress Counter ("Đã điểm danh X/Y học sinh (Z học ghép)" - Group D4) */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Đã điểm danh {markedCount}/{attendableItems.length} học sinh
                            {sessionGuestCount > 0 ? ` (${sessionGuestCount} học ghép)` : ''}
                          </span>
                          <div className="flex items-center gap-3 font-semibold">
                            <span className="text-emerald-600 dark:text-emerald-400">
                              ✓ Có mặt: {presentCount}
                            </span>
                            <span className="text-red-600 dark:text-red-400">
                              ✗ Vắng: {absentCount}
                            </span>
                            <span className="text-amber-600 dark:text-amber-400">
                              P Có phép: {excusedCount}
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-200 rounded-full"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Month Lock Warning Banner (Section 2.9) */}
                      {selectedSession &&
                        isMonthLocked(classId, selectedSession.date.slice(0, 7)) && (
                          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                            <Lock size={14} className="shrink-0" />
                            <span>
                              <strong>Tháng {selectedSession.date.slice(0, 7)} đã chốt học phí.</strong>{' '}
                              Thay đổi điểm danh hiện tại sẽ không làm thay đổi số tiền phải thu đã chốt (trừ khi Mở chốt ở màn Học phí).
                            </span>
                          </div>
                        )}
                    </div>

                    {/* DESKTOP COMPACT TABLE (>= 768px) */}
                    <div className="hidden tablet:block card overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold">
                          Danh sách điểm danh ({attendableItems.length} học sinh
                          {sessionGuestCount > 0 ? `, gồm ${sessionGuestCount} học ghép` : ''})
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[11px]">
                          <Keyboard size={13} />
                          Phím nhanh: <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-mono">↑/↓</kbd> chọn dòng ·{' '}
                          <kbd className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 font-mono">P</kbd> Có mặt ·{' '}
                          <kbd className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 font-mono">V</kbd> Vắng ·{' '}
                          <kbd className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 font-mono">K</kbd> Có phép
                        </span>
                      </div>

                      {attendableItems.length === 0 && swappedAwayItems.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-400">
                          Buổi này chưa có học sinh trong diện điểm danh.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {attendableItems.map((item, idx) => {
                            const { student, mode, statusOnDate, badgeText } = item
                            const status = currentAttendance[student.id]
                            const isFocused = idx === focusedRowIndex
                            const isGuest = mode === 'guest_swap' || mode === 'guest_extra'
                            return (
                              <div
                                key={`${student.id}-${mode}`}
                                onClick={() => setFocusedRowIndex(idx)}
                                className={cn(
                                  'px-4 py-3 flex items-center justify-between gap-4 transition-colors cursor-pointer',
                                  isFocused
                                    ? 'bg-blue-50/60 dark:bg-blue-950/25'
                                    : isGuest
                                    ? 'bg-purple-50/30 dark:bg-purple-950/15 hover:bg-purple-50/60'
                                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                )}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="w-6 text-xs font-mono text-slate-400 text-right shrink-0">
                                    {idx + 1}.
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setFeeDetailStudent(student)
                                        }}
                                        className="font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-blue-600 hover:underline truncate text-left"
                                      >
                                        {student.name}
                                      </button>
                                      {statusOnDate === 'trial' && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setStatusModalStudent(student)
                                            }}
                                            className="badge bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold"
                                            title="Bấm để đổi phí học thử hoặc chuyển sang đang học"
                                          >
                                            Học thử (
                                            {formatMoney(
                                              student.trial_price ??
                                                student.custom_price ??
                                                cls.price
                                            )}
                                            )
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setStatusModalStudent(student)
                                            }}
                                            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                          >
                                            → Chuyển đang học / Đổi phí thử
                                          </button>
                                        </>
                                      )}
                                      {badgeText && mode !== 'regular' && (
                                        <span
                                          className={cn(
                                            'badge text-[10px] font-bold',
                                            mode === 'out_of_window'
                                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                          )}
                                        >
                                          {badgeText}
                                        </span>
                                      )}
                                    </div>
                                    {student.note && (
                                      <p className="text-xs text-slate-400 truncate">
                                        {student.note}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* 3 Horizontal Status Pill Buttons */}
                                <div className="flex items-center gap-2 shrink-0 w-[340px]">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setFocusedRowIndex(idx)
                                      handleAttend(student.id, 'present')
                                    }}
                                    className={cn(
                                      'attend-btn attend-present py-1.5 text-xs min-h-[36px]',
                                      status === 'present' && 'active'
                                    )}
                                  >
                                    ✓ Có mặt (P)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setFocusedRowIndex(idx)
                                      handleAttend(student.id, 'absent')
                                    }}
                                    className={cn(
                                      'attend-btn attend-absent py-1.5 text-xs min-h-[36px]',
                                      status === 'absent' && 'active'
                                    )}
                                  >
                                    ✗ Vắng (V)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setFocusedRowIndex(idx)
                                      handleAttend(student.id, 'excused')
                                    }}
                                    className={cn(
                                      'attend-btn attend-excused py-1.5 text-xs min-h-[36px]',
                                      status === 'excused' && 'active'
                                    )}
                                  >
                                    Có phép (K)
                                  </button>
                                </div>
                              </div>
                            )
                          })}

                          {/* Group D3: Swapped-away students shown muted at bottom */}
                          {swappedAwayItems.map((item) => (
                            <div
                              key={`swapped-${item.student.id}`}
                              className="px-4 py-2.5 flex items-center justify-between gap-4 bg-slate-50/80 dark:bg-slate-900/40 text-slate-400"
                            >
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-500 dark:text-slate-400 line-through">
                                  {item.student.name}
                                </span>
                                <span className="badge bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-semibold">
                                  {item.badgeText || 'Đã sang lớp khác'}
                                </span>
                              </div>
                              {item.swappedToGuest && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteGuestId(item.swappedToGuest!.id)}
                                  className="text-xs text-red-500 hover:underline font-medium"
                                >
                                  Hủy đổi buổi
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* MOBILE TALL PILL ROWS (< 768px) */}
                    <div className="tablet:hidden flex flex-col gap-2.5">
                      {attendableItems.map((item, idx) => {
                        const { student, statusOnDate, badgeText, mode } = item
                        const status = currentAttendance[student.id]
                        return (
                          <div key={`${student.id}-${mode}`} className="card p-3.5 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-xs font-bold text-slate-400">
                                  #{idx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setFeeDetailStudent(student)}
                                  className="font-bold text-base text-slate-900 dark:text-slate-100 truncate text-left"
                                >
                                  {student.name}
                                </button>
                                {statusOnDate === 'trial' && (
                                  <button
                                    type="button"
                                    onClick={() => setStatusModalStudent(student)}
                                    className="badge bg-amber-100 text-amber-800 text-[10px] font-bold"
                                  >
                                    Học thử · Chuyển đang học
                                  </button>
                                )}
                                {badgeText && (
                                  <span className="badge bg-purple-100 text-purple-800 text-[10px]">
                                    {badgeText}
                                  </span>
                                )}
                              </div>
                              {status && (
                                <span
                                  className={cn(
                                    'badge text-xs font-semibold shrink-0',
                                    status === 'present'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                      : status === 'absent'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                  )}
                                >
                                  {status === 'present'
                                    ? '✓ Có mặt'
                                    : status === 'absent'
                                    ? '✗ Vắng'
                                    : 'Có phép'}
                                </span>
                              )}
                            </div>

                            {/* 3 Large Pill Buttons */}
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => handleAttend(student.id, 'present')}
                                className={cn(
                                  'attend-btn attend-present',
                                  status === 'present' && 'active'
                                )}
                              >
                                Có mặt
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttend(student.id, 'absent')}
                                className={cn(
                                  'attend-btn attend-absent',
                                  status === 'absent' && 'active'
                                )}
                              >
                                Vắng
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttend(student.id, 'excused')}
                                className={cn(
                                  'attend-btn attend-excused',
                                  status === 'excused' && 'active'
                                )}
                              >
                                Có phép
                              </button>
                            </div>
                          </div>
                        )
                      })}

                      {swappedAwayItems.map((item) => (
                        <div
                          key={`mob-swapped-${item.student.id}`}
                          className="card p-3 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500"
                        >
                          <span>
                            <strong>{item.student.name}</strong> · {item.badgeText}
                          </span>
                          {item.swappedToGuest && (
                            <button
                              type="button"
                              onClick={() => setDeleteGuestId(item.swappedToGuest!.id)}
                              className="text-red-500 font-semibold"
                            >
                              Hủy đổi
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Sticky "Tất cả có mặt" button at bottom on mobile */}
                      {attendableItems.length > 0 && (
                        <div className="sticky bottom-[76px] z-20 pt-2">
                          <button
                            type="button"
                            onClick={handleAllPresent}
                            className="btn-primary w-full py-3.5 text-base shadow-lg bg-emerald-600 hover:bg-emerald-700 rounded-2xl"
                          >
                            <CheckCheck size={20} /> Đánh dấu tất cả có mặt ({attendableItems.length})
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STUDENTS ROSTER SECTION */}
            {activeTab === 'students' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 desktop:hidden">
                  <button
                    onClick={() => setShowAddStudent(true)}
                    className="btn-primary flex-1"
                  >
                    <Plus size={16} /> Thêm học sinh
                  </button>
                  <button onClick={() => setShowBulkAdd(true)} className="btn-secondary">
                    Dán danh sách
                  </button>
                </div>

                {classStudents.length === 0 ? (
                  <EmptyState
                    icon={<Users size={44} />}
                    title="Chưa có học sinh nào trong lớp"
                    description="Thêm từng học sinh hoặc dán nhanh danh sách từ Excel/Zalo."
                    action={
                      <button
                        onClick={() => setShowBulkAdd(true)}
                        className="btn-primary"
                      >
                        Dán danh sách học sinh
                      </button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
                    {activeStudents.map((student) => {
                      const debtProfile = debtProfilesMap.get(student.id)
                      const currentDebt = debtProfile?.debt_amount || 0
                      const currentCredit = debtProfile?.credit_amount || 0
                      const curStatus = getStudentCurrentStatus(
                        student,
                        studentStatusHistory,
                        todayStr
                      )
                      const extraEnrolls = studentEnrollments.filter(
                        (e) => e.student_id === student.id && e.kind === 'extra' && !e.to_date
                      )
                      return (
                        <div key={student.id} className="card p-4 flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-blue-700 dark:text-blue-400">
                                {student.name.charAt(student.name.lastIndexOf(' ') + 1) ||
                                  student.name[0]}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setFeeDetailStudent(student)}
                                  className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-blue-600 hover:underline truncate text-left"
                                >
                                  {student.name}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStatusModalStudent(student)}
                                  className={cn(
                                    'badge hover:opacity-80 transition-opacity',
                                    studentStatusColor(curStatus)
                                  )}
                                  title="Bấm để đổi trạng thái (Đang học / Học thử / Đã nghỉ) hoặc sửa phí học thử"
                                >
                                  {curStatus === 'trial'
                                    ? `Học thử (${formatMoney(student.trial_price ?? student.custom_price ?? cls.price)})`
                                    : studentStatusLabel(curStatus)}
                                </button>
                                {student.start_date && student.start_date > todayStr && (
                                  <span className="badge bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 font-bold text-[10px]">
                                    Bắt đầu từ {formatShortDdMm(student.start_date)}
                                  </span>
                                )}
                                {student.custom_price && (
                                  <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                    {formatMoney(student.custom_price)}/buổi
                                  </span>
                                )}
                                {currentDebt > 0 ? (
                                  <span className="badge bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 font-bold">
                                    Nợ {formatMoney(currentDebt)}
                                  </span>
                                ) : currentCredit > 0 ? (
                                  <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-bold">
                                    Dư +{formatMoney(currentCredit)}
                                  </span>
                                ) : (
                                  <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    Đủ học phí
                                  </span>
                                )}
                              </div>
                              {extraEnrolls.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {extraEnrolls.map((en) => {
                                    const ec = classes.find((c) => c.id === en.class_id)
                                    return (
                                      <span
                                        key={en.id}
                                        className="badge bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[10px]"
                                      >
                                        + Học thêm tại {ec?.name || en.class_id}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                              {student.parent_name && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  Phụ huynh: <strong>{student.parent_name}</strong>
                                </p>
                              )}
                              {student.parent_phone && (
                                <div className="flex gap-2 mt-1">
                                  <a
                                    href={formatPhoneTel(student.parent_phone)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    <Phone size={12} /> {student.parent_phone}
                                  </a>
                                </div>
                              )}
                              {student.note && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">
                                  "{student.note}"
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => setEditStudent(student)}
                                className="btn-icon p-1.5 text-slate-400 hover:text-slate-700"
                                title="Sửa học sinh"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => setDeleteStudentId(student.id)}
                                className="btn-icon p-1.5 text-slate-400 hover:text-red-500"
                                title="Xóa học sinh"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          {/* Group A3, D4, E3: Lifecycle Quick Actions */}
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setStatusModalStudent(student)}
                              className={cn(
                                'px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border transition-colors',
                                curStatus === 'trial'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                              )}
                            >
                              <UserCheck size={12} />
                              {curStatus === 'trial' ? 'Chuyển đang học' : 'Đổi trạng thái'}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setGuestModalConfig({
                                  open: true,
                                  student,
                                  date: selectedSession?.date || todayStr,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100"
                            >
                              <UserPlus size={12} /> Học ghép 1-2 buổi
                            </button>

                            <button
                              type="button"
                              onClick={() => setExtraEnrollStudent(student)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                            >
                              <Plus size={12} /> Học thêm dài hạn
                            </button>

                            <button
                              type="button"
                              onClick={() => setTransferModalStudent(student)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                            >
                              <ArrowRightLeft size={12} /> Chuyển lớp
                            </button>
                          </div>

                          {/* Fee Detail Drawer, Ledger & Record Payment Actions */}
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setFeeDetailStudent(student)}
                              className="btn-secondary py-1.5 px-2.5 text-xs flex-1"
                            >
                              <Calendar size={13} className="text-blue-600" /> Chi tiết tháng
                            </button>
                            <button
                              type="button"
                              onClick={() => setLedgerStudentId(student.id)}
                              className="btn-secondary py-1.5 px-2.5 text-xs flex-1"
                            >
                              <BookOpen size={13} /> Sổ học phí
                            </button>
                            <button
                              type="button"
                              onClick={() => setRecordPaymentStudentId(student.id)}
                              className="btn-primary py-1.5 px-2.5 text-xs flex-1"
                            >
                              <Wallet size={13} /> Thu phí
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {leftStudents.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                      Học sinh đã nghỉ ({leftStudents.length})
                    </p>
                    <div className="grid grid-cols-1 tablet:grid-cols-2 gap-2">
                      {leftStudents.map((student) => {
                        const debtProfile = debtProfilesMap.get(student.id)
                        const currentDebt = debtProfile?.debt_amount || 0
                        return (
                          <div
                            key={student.id}
                            className="card p-3 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 truncate">
                                  {student.name}
                                </span>
                                {currentDebt > 0 && (
                                  <span className="badge bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-bold text-[10px]">
                                    Còn nợ {formatMoney(currentDebt)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => setStatusModalStudent(student)}
                                className="btn-icon p-1.5 text-slate-500 hover:text-emerald-600"
                                title="Khôi phục trạng thái đang học"
                              >
                                <UserCheck size={14} />
                              </button>
                              <button
                                onClick={() => setLedgerStudentId(student.id)}
                                className="btn-icon p-1.5 text-slate-500 hover:text-blue-600"
                                title="Sổ học phí"
                              >
                                <BookOpen size={14} />
                              </button>
                              {currentDebt > 0 && (
                                <button
                                  onClick={() => setRecordPaymentStudentId(student.id)}
                                  className="btn-icon p-1.5 text-blue-600 hover:text-blue-700"
                                  title="Ghi nhận khoản thu"
                                >
                                  <Wallet size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => setEditStudent(student)}
                                className="btn-icon p-1.5 text-slate-400"
                                title="Sửa học sinh"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteStudentId(student.id)}
                                className="btn-icon p-1.5 text-red-400"
                                title="Xóa học sinh"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GROUP D4: "HỌC GHÉP" TAB */}
            {activeTab === 'guests' && (
              <div className="flex flex-col gap-4">
                <div className="card p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <UserPlus size={16} className="text-purple-600" />
                        Học sinh lớp khác đến học ghép / học thêm tại lớp {cls.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Bao gồm học ghép 1–2 buổi (đổi buổi / học bù) và đăng ký học thêm dài hạn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setGuestModalConfig({
                          open: true,
                          hostClassId: classId,
                          date: selectedSession?.date || todayStr,
                          startTime: selectedSession?.start_time || '17:30',
                        })
                      }
                      className="btn-primary py-1.5 px-3 text-xs bg-purple-600 hover:bg-purple-700"
                    >
                      <Plus size={14} /> Xếp học sinh học ghép vào lớp này
                    </button>
                  </div>

                  {incomingGuests.length === 0 && incomingLongTermExtras.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      Chưa có học sinh lớp khác đăng ký học ghép tại lớp này.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {incomingLongTermExtras.map((en) => {
                        const st = students.find((s) => s.id === en.student_id)
                        const homeCls = classes.find((c) => c.id === st?.class_id)
                        if (!st) return null
                        return (
                          <div
                            key={en.id}
                            className="py-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  {st.name}
                                </span>
                                <span className="badge bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                                  Học thêm dài hạn · từ {homeCls?.name || 'Lớp khác'}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                Từ {formatFullDdMmYyyy(en.from_date)}
                                {en.to_date ? ` đến ${formatFullDdMmYyyy(en.to_date)}` : ' · Đang theo học'}
                                {' · '}
                                Đơn giá:{' '}
                                <strong>
                                  {en.price_override === 0
                                    ? 'Miễn phí (0đ)'
                                    : formatMoney(en.price_override ?? cls.price)}
                                </strong>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExtraEnrollStudent(st)}
                              className="btn-secondary py-1 px-2.5 text-xs"
                            >
                              Quản lý
                            </button>
                          </div>
                        )
                      })}

                      {incomingGuests.map((g) => {
                        const st = students.find((s) => s.id === g.student_id)
                        const homeCls = classes.find((c) => c.id === (g.home_class_id || st?.class_id))
                        return (
                          <div
                            key={g.id}
                            className="py-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  {st?.name || g.student_id}
                                </span>
                                <span className="badge bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                                  {g.kind === 'swap' ? 'Đổi buổi (Học ghép)' : 'Học thêm ngắn hạn'} · từ{' '}
                                  {homeCls?.name || 'Lớp gốc'}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                Buổi học ghép: <strong>{formatFullDdMmYyyy(g.date)}</strong> ({g.start_time})
                                {g.home_session_key
                                  ? ` · Thay cho buổi lớp gốc ${formatShortDdMm(
                                      g.home_session_key.split('|')[1] || ''
                                    )}`
                                  : ''}
                                {' · '}
                                Tính phí:{' '}
                                <strong>
                                  {g.billing_mode === 'free'
                                    ? 'Miễn phí (0đ)'
                                    : g.billing_mode === 'host_price'
                                    ? `Theo giá lớp ghép (${formatMoney(cls.price)})`
                                    : g.billing_mode === 'custom'
                                    ? formatMoney(g.custom_amount || 0)
                                    : `Theo giá lớp gốc (${formatMoney(
                                        st?.custom_price ?? homeCls?.price ?? 0
                                      )})`}
                                </strong>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDeleteGuestId(g.id)}
                              className="btn-icon p-1.5 text-slate-400 hover:text-red-500"
                              title="Xóa buổi học ghép"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Section 2: Outgoing guests from this class */}
                <div className="card p-4 flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ArrowRightLeft size={16} className="text-blue-600" />
                      Học sinh lớp {cls.name} đi học ghép ở lớp khác ({outgoingGuests.length})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Các buổi học sinh của lớp này xin sang lớp khác học bù hoặc học tăng cường.
                    </p>
                  </div>

                  {outgoingGuests.length === 0 ? (
                    <p className="text-xs text-slate-400 py-5 text-center">
                      Chưa có học sinh nào của lớp này đi học ghép ở lớp khác.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {outgoingGuests.map((g) => {
                        const st = students.find((s) => s.id === g.student_id)
                        const hostCls = classes.find((c) => c.id === g.host_class_id)
                        return (
                          <div
                            key={g.id}
                            className="py-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  {st?.name || g.student_id}
                                </span>
                                <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                  Sang lớp {hostCls?.name || g.host_class_id} ({formatShortDdMm(g.date)} ·{' '}
                                  {g.start_time})
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                Hình thức: {g.kind === 'swap' ? 'Đổi buổi cố định' : 'Học thêm tăng cường'}
                                {g.note ? ` · "${g.note}"` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDeleteGuestId(g.id)}
                              className="btn-icon p-1.5 text-slate-400 hover:text-red-500"
                              title="Hủy buổi học ghép"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (4/12 on Desktop, or "schedule" tab on Mobile): Class Info, Session Note, Quick Stats & Schedule Rules */}
          <div
            className={cn(
              'desktop:col-span-4 flex flex-col gap-4',
              activeTab !== 'schedule' && 'hidden desktop:flex'
            )}
          >
            {/* Quick Statistics Card (Section 3.3) */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-600 dark:text-blue-400" />
                  Thống kê nhanh tháng này
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  Tháng {format(new Date(), 'MM/yyyy')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Chuyên cần</div>
                  <div className="text-xl font-extrabold text-blue-700 dark:text-blue-300 mt-0.5">
                    {monthlyStats.attendanceRate}%
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Số buổi tháng</div>
                  <div className="text-xl font-extrabold text-orange-700 dark:text-orange-300 mt-0.5">
                    {monthlyStats.sessionsCount} buổi
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Tạm tính học phí tháng:
                </span>
                <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(monthlyStats.estimatedRevenue)}
                </span>
              </div>
            </div>

            {/* Session Lesson Note Card */}
            {selectedSession && (
              <div className="card p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <FileText size={16} className="text-purple-600 dark:text-purple-400" />
                    Ghi chú buổi học
                  </h3>
                  <span className="text-xs font-medium text-slate-500">
                    {formatDateShort(selectedSession.date)} ({selectedSession.start_time})
                  </span>
                </div>
                <textarea
                  className="input text-sm"
                  rows={3}
                  placeholder="Ghi nội dung bài dạy, bài tập về nhà hoặc nhận xét buổi học..."
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => {
                    if (selectedSession) {
                      setSessionNote(
                        classId,
                        selectedSession.date,
                        selectedSession.start_time,
                        noteDraft
                      )
                    }
                  }}
                />
                <p className="text-[11px] text-slate-400">
                  Tự động lưu khi bạn bấm ra ngoài ô nhập.
                </p>
              </div>
            )}

            {/* Fixed Weekly Schedule Rules Card */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Clock size={16} className="text-orange-500" />
                  Lịch học cố định ({rules.length})
                </h3>
                <button
                  onClick={() => setShowAddRule(true)}
                  className="btn-secondary py-1 px-2.5 text-xs"
                >
                  <Plus size={14} /> Thêm ca
                </button>
              </div>

              {rules.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">
                  Chưa có ca học cố định hằng tuần.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {getWeekdayName(rule.weekday, true)} · {rule.start_time}–{rule.end_time}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Từ {formatDate(rule.valid_from)}
                          {rule.valid_to ? ` đến ${formatDate(rule.valid_to)}` : ' · Lặp hằng tuần'}
                        </div>
                      </div>
                      <button
                        onClick={() => setDeleteRuleId(rule.id)}
                        className="btn-icon p-1.5 text-slate-400 hover:text-red-500"
                        title="Xóa ca cố định"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Extra Sessions Card ("Lịch học phát sinh") */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
                  Lịch học phát sinh ({classExtras.length})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingExtraSession(null)
                    setShowExtraModal(true)
                  }}
                  className="btn-secondary py-1 px-2.5 text-xs text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/70 bg-purple-50/70 dark:bg-purple-950/30"
                >
                  <Plus size={14} /> Thêm buổi
                </button>
              </div>

              {classExtras.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">
                  Chưa có buổi học phát sinh nào cho lớp này.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {classExtras.map((ex) => {
                    const effectivePrice =
                      ex.custom_price != null ? ex.custom_price : cls.price
                    return (
                      <div
                        key={ex.id}
                        className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/25 border border-purple-200/70 dark:border-purple-800/50 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {formatDate(ex.date)} · {ex.start_time}–{ex.end_time}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200">
                              {formatMoney(effectivePrice)}/buổi
                              {ex.custom_price != null ? ' (Giá riêng)' : ' (Giá lớp)'}
                            </span>
                          </div>
                          {ex.note && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                              {ex.note}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const found = sessions.find(
                                (s) => s.date === ex.date && s.start_time === ex.start_time
                              )
                              if (found) {
                                setSelectedSession(found)
                                setActiveTab('attendance')
                              }
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <CheckCheck size={13} /> Điểm danh buổi này
                          </button>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingExtraSession(ex)
                              setShowExtraModal(true)
                            }}
                            className="btn-icon p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-300"
                            title="Sửa buổi phát sinh"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteExtraId(ex.id)}
                            className="btn-icon p-1.5 text-slate-400 hover:text-red-500"
                            title="Xóa buổi phát sinh"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal
        open={showAddStudent}
        onClose={() => setShowAddStudent(false)}
        title="Thêm học sinh vào lớp"
      >
        <StudentForm
          classId={classId}
          onSave={addStudent}
          onClose={() => setShowAddStudent(false)}
        />
      </Modal>

      <Modal
        open={showBulkAdd}
        onClose={() => setShowBulkAdd(false)}
        title="Dán nhanh danh sách học sinh"
      >
        <BulkAddForm classId={classId} onClose={() => setShowBulkAdd(false)} />
      </Modal>

      <Modal
        open={!!editStudent}
        onClose={() => setEditStudent(null)}
        title="Sửa thông tin học sinh"
      >
        {editStudent && (
          <StudentForm
            classId={classId}
            initial={editStudent}
            onSave={(data) => updateStudent(editStudent.id, data)}
            onClose={() => setEditStudent(null)}
          />
        )}
      </Modal>

      <Modal
        open={showAddRule}
        onClose={() => setShowAddRule(false)}
        title="Thêm lịch học cố định hằng tuần"
      >
        <ScheduleRuleForm
          classId={classId}
          onSave={addScheduleRule}
          onClose={() => setShowAddRule(false)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteStudentId}
        onClose={() => setDeleteStudentId(null)}
        onConfirm={() => deleteStudentId && deleteStudent(deleteStudentId)}
        title="Xóa học sinh"
        message="Bạn có chắc muốn xóa học sinh này? Toàn bộ lịch sử điểm danh của học sinh sẽ bị xóa."
        confirmLabel="Xóa học sinh"
      />

      <ConfirmDialog
        open={!!deleteRuleId}
        onClose={() => setDeleteRuleId(null)}
        onConfirm={() => deleteRuleId && deleteScheduleRule(deleteRuleId)}
        title="Xóa ca học cố định"
        message="Xóa lịch học cố định này? Các buổi đã dời hoặc hủy trước đó vẫn được giữ nguyên."
        confirmLabel="Xóa lịch"
      />

      <AddExtraSessionModal
        open={showExtraModal}
        onClose={() => {
          setShowExtraModal(false)
          setEditingExtraSession(null)
        }}
        presetClassId={classId}
        editSession={editingExtraSession}
      />

      <ConfirmDialog
        open={!!deleteExtraId}
        onClose={() => setDeleteExtraId(null)}
        onConfirm={() => {
          if (deleteExtraId) {
            deleteExtraSession(deleteExtraId)
            toast.success('Đã xóa buổi học phát sinh')
          }
          setDeleteExtraId(null)
        }}
        title="Xóa buổi học phát sinh"
        message="Bạn có chắc muốn xóa buổi học phát sinh này? Dữ liệu điểm danh của buổi phát sinh này cũng sẽ được gỡ bỏ."
        confirmLabel="Xóa buổi phát sinh"
      />

      <ConfirmDialog
        open={!!deleteGuestId}
        onClose={() => setDeleteGuestId(null)}
        onConfirm={() => {
          if (deleteGuestId) {
            deleteSessionGuest(deleteGuestId)
            toast.success('Đã hủy/xóa buổi học ghép')
            setDeleteGuestId(null)
          }
        }}
        title="Xóa buổi học ghép?"
        message="Bạn có chắc muốn xóa lịch học ghép này? Nếu đây là buổi đổi lịch, buổi ở lớp gốc sẽ trở lại bình thường."
        confirmLabel="Xóa học ghép"
      />

      <RecordPaymentModal
        open={!!recordPaymentStudentId || !!editTx}
        onClose={() => {
          setRecordPaymentStudentId(null)
          setEditTx(null)
        }}
        student={
          students.find(
            (s) => s.id === (recordPaymentStudentId || editTx?.student_id)
          ) || null
        }
        editTransaction={editTx}
      />

      <StudentFeeLedgerModal
        open={!!ledgerStudentId}
        onClose={() => setLedgerStudentId(null)}
        studentId={ledgerStudentId}
        onOpenRecordPayment={(st, tx) => {
          setRecordPaymentStudentId(st.id)
          setEditTx(tx || null)
        }}
      />

      {/* Group A3: Student Status Change Modal ("Chuyển sang đang học") */}
      <StudentStatusChangeModal
        student={statusModalStudent}
        isOpen={!!statusModalStudent}
        onClose={() => setStatusModalStudent(null)}
      />

      {/* Group D4: Short-term Session Guest Modal */}
      <SessionGuestModal
        isOpen={guestModalConfig.open}
        onClose={() => setGuestModalConfig({ open: false })}
        presetStudent={guestModalConfig.student || null}
        presetHostClassId={guestModalConfig.hostClassId || null}
        presetDate={guestModalConfig.date || null}
        presetStartTime={guestModalConfig.startTime || null}
      />

      {/* Group D4: Long-term Extra Enrollment Modal */}
      <LongTermExtraEnrollmentModal
        student={extraEnrollStudent}
        isOpen={!!extraEnrollStudent}
        onClose={() => setExtraEnrollStudent(null)}
      />

      {/* Group E3: Mid-month Class Transfer Modal */}
      <ClassTransferModal
        student={transferModalStudent}
        isOpen={!!transferModalStudent}
        onClose={() => setTransferModalStudent(null)}
      />

      {/* Group E4: Student Fee Detail Drawer */}
      <StudentFeeDetailDrawer
        student={feeDetailStudent}
        initialMonth={selectedSession ? selectedSession.date.slice(0, 7) : format(new Date(), 'yyyy-MM')}
        isOpen={!!feeDetailStudent}
        onClose={() => setFeeDetailStudent(null)}
        onOpenRecordPayment={(st) => {
          setFeeDetailStudent(null)
          setRecordPaymentStudentId(st.id)
        }}
        onOpenStatusChange={(st) => {
          setFeeDetailStudent(null)
          setStatusModalStudent(st)
        }}
        onOpenGuestModal={(st) => {
          setFeeDetailStudent(null)
          setGuestModalConfig({ open: true, student: st })
        }}
        onOpenTransferClass={(st) => {
          setFeeDetailStudent(null)
          setTransferModalStudent(st)
        }}
      />
    </div>
  )
}
