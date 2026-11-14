import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Download,
  MessageSquare,
  CheckCircle,
  TrendingUp,
  FileSpreadsheet,
  Mail,
  BarChart3,
  Copy,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  AlertCircle,
  Wallet,
  Users,
  Plus,
  BookOpen,
  Phone,
  Lock,
  Unlock,
  Clock,
  Calendar,
  UserCheck,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { RecordPaymentModal, StudentFeeLedgerModal } from '../components/fees/PaymentModals'
import { StudentFeeDetailDrawer } from '../components/fees/StudentFeeDetailDrawer'
import {
  StudentStatusChangeModal,
  SessionGuestModal,
  ClassTransferModal,
} from '../components/students/StudentLifecycleModals'
import {
  buildFeeRowFromProfile,
  computeAllStudentDebtProfiles,
  formatFullDdMmYyyy,
  generateDebtReminderMessage,
  getStudentCurrentStatus,
  type StudentDebtProfile,
} from '../lib/debtEngine'
import { formatMoney, formatMonth, getCurrentMonth, getWeekdayName } from '../lib/dateUtils'
import { cn, formatPhoneTel } from '../lib/utils'
import type { FeeRow, Class, Student, PaymentTransaction, MonthFeeStatus } from '../types'
import toast from 'react-hot-toast'

type SortField =
  | 'name'
  | 'class'
  | 'trial'
  | 'present'
  | 'price'
  | 'total'
  | 'paid_amount'
  | 'remaining'
  | 'status'
type SortDir = 'asc' | 'desc'

export function FeesPage() {
  const {
    classes,
    students,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    sessionNotes,
    attendance,
    paymentTransactions,
    monthLocks,
    lockMonth,
    unlockMonth,
    scheduleRules,
    extraSessions,
    sessionExceptions,
    holidays,
    settings,
  } = useAppStore()

  // Main mode switcher (Section 2.9: "Theo tháng" | "Công nợ" | "Biểu đồ thống kê")
  const [mainMode, setMainMode] = useState<'monthly' | 'debt' | 'stats'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [selectedClassId, setSelectedClassId] = useState<string>('all')

  // Modals & Drawers state
  const [recordPaymentStudent, setRecordPaymentStudent] = useState<Student | null>(null)
  const [editTx, setEditTx] = useState<PaymentTransaction | null>(null)
  const [defaultShortage, setDefaultShortage] = useState<number>(0)
  const [ledgerStudentId, setLedgerStudentId] = useState<string | null>(null)
  const [feeDetailStudent, setFeeDetailStudent] = useState<Student | null>(null)
  const [statusModalStudent, setStatusModalStudent] = useState<Student | null>(null)
  const [guestModalStudent, setGuestModalStudent] = useState<Student | null>(null)
  const [transferModalStudent, setTransferModalStudent] = useState<Student | null>(null)

  // Reminder modal state (with 2 templates: 'gentle' | 'second' & session breakdown toggle)
  const [reminderStudentId, setReminderStudentId] = useState<string | null>(null)
  const [reminderTemplate, setReminderTemplate] = useState<'gentle' | 'second'>('gentle')
  const [includeSessionBreakdown, setIncludeSessionBreakdown] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Month Lock confirm dialog state
  const [lockConfirmAction, setLockConfirmAction] = useState<{
    type: 'lock' | 'unlock'
    cls: Class
    month: string
  } | null>(null)

  // Desktop table sorting & inline header filters
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [headerSearch, setHeaderSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | MonthFeeStatus>('all')

  // Debt view sorting ("oldest" = nợ lâu nhất, "amount" = số tiền nợ)
  const [debtSortBy, setDebtSortBy] = useState<'oldest' | 'amount'>('oldest')

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Generate months list (last 12 months + current)
  const months = useMemo(() => {
    const result: string[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      result.push(format(d, 'yyyy-MM'))
    }
    return result
  }, [])

  // Unified Debt & FIFO Profiles for all students (Groups A, D, E)
  const profilesMap = useMemo(
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
        targetMonth: selectedMonth,
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
      selectedMonth,
    ]
  )

  const filteredClasses = useMemo(
    () =>
      selectedClassId === 'all'
        ? classes
        : classes.filter((c) => c.id === selectedClassId),
    [classes, selectedClassId]
  )

  // Monthly Fee Data per class using Unified Debt Engine
  const feeData = useMemo(() => {
    const result: {
      cls: Class
      rows: FeeRow[]
      totalDue: number
      totalPaid: number
      totalRemaining: number
      isLocked: boolean
    }[] = []

    for (const cls of filteredClasses) {
      const isLocked = monthLocks.some(
        (l) => l.class_id === cls.id && l.month === selectedMonth
      )
      // Include active students OR left/transferred students who had sessions/lock in this month
      const classStudents = students.filter((s) => {
        const prof = profilesMap.get(s.id)
        const mSum = prof?.months[selectedMonth]
        const curStatus = getStudentCurrentStatus(s, studentStatusHistory, todayStr)

        if (s.class_id === cls.id) {
          if (curStatus !== 'left') return true
          return Boolean(
            mSum &&
              (mSum.due_amount > 0 ||
                mSum.present_count > 0 ||
                mSum.trial_count > 0)
          )
        }

        // If filtering by a specific class, also show students who transferred from/to this class or had breakdown in it
        if (selectedClassId !== 'all' && mSum) {
          return mSum.class_breakdowns.some((b) => b.class_id === cls.id)
        }
        return false
      })

      const rows: FeeRow[] = classStudents
        .map((st) => {
          const prof = profilesMap.get(st.id)
          if (!prof) return null
          return buildFeeRowFromProfile(
            prof,
            selectedMonth,
            selectedClassId !== 'all' ? cls.id : undefined
          )
        })
        .filter((r): r is FeeRow => r !== null)

      const totalDue = rows.reduce((sum, r) => sum + r.total, 0)
      const totalPaid = rows.reduce((sum, r) => sum + r.paid_amount, 0)
      const totalRemaining = rows.reduce((sum, r) => sum + r.remaining_amount, 0)

      result.push({ cls, rows, totalDue, totalPaid, totalRemaining, isLocked })
    }

    return result
  }, [filteredClasses, students, profilesMap, selectedMonth, monthLocks, studentStatusHistory, todayStr, selectedClassId])

  // Flat rows for Desktop Monthly Table
  const flatRows = useMemo(() => {
    const list: { row: FeeRow; cls: Class; profile: StudentDebtProfile }[] = []
    feeData.forEach(({ cls, rows }) => {
      rows.forEach((row) => {
        const profile = profilesMap.get(row.student.id)
        if (profile) list.push({ row, cls, profile })
      })
    })

    const filtered = list.filter(({ row, cls }) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (headerSearch.trim()) {
        const q = headerSearch.trim().toLowerCase()
        const matchName = row.student.name.toLowerCase().includes(q)
        const matchParent = row.student.parent_name?.toLowerCase().includes(q)
        const matchClass = cls.name.toLowerCase().includes(q)
        const matchNote = row.status_note?.toLowerCase().includes(q)
        if (!matchName && !matchParent && !matchClass && !matchNote) return false
      }
      return true
    })

    return filtered.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.row.student.name.localeCompare(b.row.student.name, 'vi')
          break
        case 'class':
          cmp = a.cls.name.localeCompare(b.cls.name, 'vi')
          break
        case 'trial':
          cmp = (a.row.trial_count || 0) - (b.row.trial_count || 0)
          break
        case 'present':
          cmp = a.row.present_count - b.row.present_count
          break
        case 'price':
          cmp = a.row.price_per_session - b.row.price_per_session
          break
        case 'total':
          cmp = a.row.total - b.row.total
          break
        case 'paid_amount':
          cmp = a.row.paid_amount - b.row.paid_amount
          break
        case 'remaining':
          cmp = a.row.cumulative_balance - b.row.cumulative_balance
          break
        case 'status':
          cmp = a.row.status.localeCompare(b.row.status, 'vi')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [feeData, profilesMap, statusFilter, headerSearch, sortField, sortDir])

  // Debt Mode Data (Section 2.9: includes left students if they still owe!)
  const debtProfilesList = useMemo(() => {
    const list: StudentDebtProfile[] = []
    for (const profile of profilesMap.values()) {
      if (
        selectedClassId !== 'all' &&
        profile.student.class_id !== selectedClassId
      ) {
        continue
      }
      if (headerSearch.trim()) {
        const q = headerSearch.trim().toLowerCase()
        const matchName = profile.student.name.toLowerCase().includes(q)
        const matchParent = profile.student.parent_name?.toLowerCase().includes(q)
        if (!matchName && !matchParent) continue
      }
      if (profile.debt_amount > 0) {
        list.push(profile)
      }
    }

    return list.sort((a, b) => {
      if (debtSortBy === 'oldest') {
        const mA = a.oldest_unpaid_month || '9999-99'
        const mB = b.oldest_unpaid_month || '9999-99'
        if (mA !== mB) return mA.localeCompare(mB)
        return b.debt_amount - a.debt_amount
      }
      return b.debt_amount - a.debt_amount
    })
  }, [profilesMap, selectedClassId, headerSearch, debtSortBy])

  // Global Debt & Credit KPIs for Debt Mode
  const debtSummaryKPIs = useMemo(() => {
    let totalOwing = 0
    let totalCredit = 0
    const owingParentsSet = new Set<string>()

    for (const profile of profilesMap.values()) {
      if (
        selectedClassId !== 'all' &&
        profile.student.class_id !== selectedClassId
      ) {
        continue
      }
      if (profile.debt_amount > 0) {
        totalOwing += profile.debt_amount
        const parentKey =
          (profile.student.parent_phone || '').replace(/\D+/g, '') ||
          profile.student.parent_name?.trim().toLowerCase() ||
          profile.student.id
        owingParentsSet.add(parentKey)
      }
      if (profile.credit_amount > 0) {
        totalCredit += profile.credit_amount
      }
    }

    return {
      totalOwing,
      totalCredit,
      owingParentCount: owingParentsSet.size,
    }
  }, [profilesMap, selectedClassId])

  // 6-Month Bar Chart Data
  const last6MonthsStats = useMemo(() => {
    const last6 = months.slice(-6)
    return last6.map((m) => {
      let due = 0
      let paid = 0
      for (const profile of profilesMap.values()) {
        if (selectedClassId !== 'all') {
          const mInfo = profile.months[m]
          const inClass =
            profile.student.class_id === selectedClassId ||
            Boolean(mInfo?.class_breakdowns.some((b) => b.class_id === selectedClassId))
          if (!inClass) continue
          const scopedRow = buildFeeRowFromProfile(profile, m, selectedClassId)
          due += scopedRow.total
          paid += scopedRow.paid_amount
          continue
        }
        const mInfo = profile.months[m]
        if (mInfo) {
          due += mInfo.due_amount
          paid += mInfo.allocated_paid
        }
      }
      return {
        month: m,
        shortLabel: `T${parseInt(m.split('-')[1])}/${m.split('-')[0].slice(2)}`,
        due,
        paid,
      }
    })
  }, [months, profilesMap, selectedClassId])

  const max6MonthValue = Math.max(...last6MonthsStats.map((s) => s.due), 1)

  const grandTotal = feeData.reduce((sum, d) => sum + d.totalDue, 0)
  const grandPaid = feeData.reduce((sum, d) => sum + d.totalPaid, 0)
  const grandRemaining = feeData.reduce((sum, d) => sum + d.totalRemaining, 0)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="text-slate-400" />
    return sortDir === 'asc' ? (
      <ArrowUp size={13} className="text-blue-600 dark:text-blue-400" />
    ) : (
      <ArrowDown size={13} className="text-blue-600 dark:text-blue-400" />
    )
  }

  const renderStatusBadge = (status: MonthFeeStatus) => {
    const styles: Record<MonthFeeStatus, string> = {
      Đủ: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300/60',
      'Đóng dư':
        'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300/60',
      'Còn thiếu':
        'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/60',
      'Chưa đóng':
        'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300/60',
    }
    return (
      <span
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border',
          styles[status]
        )}
      >
        {status}
      </span>
    )
  }

  const handleCopyReminder = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Đã sao chép tin nhắn nhắc học phí!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Export native Excel .xlsx with 5 sheets (Groups A2, D5, E4, Section 2.9):
  // 1. "Học phí YYYY-MM"
  // 2. "Chi tiết từng buổi"
  // 3. "Học ghép và học thêm"
  // 4. "Công nợ"
  // 5. "Các khoản thu"
  const exportExcel = () => {
    // Sheet 1: Monthly Fee Summary
    const monthlySheetData: any[] = []
    feeData.forEach(({ cls, rows }) => {
      rows.forEach((r) => {
        const curStatus = getStudentCurrentStatus(
          r.student,
          studentStatusHistory,
          todayStr
        )
        monthlySheetData.push({
          Lớp: cls.name,
          'Tên học sinh': r.student.name,
          'Trạng thái hiện tại':
            curStatus === 'trial'
              ? 'Học thử'
              : curStatus === 'left'
              ? 'Đã nghỉ'
              : 'Đang học',
          'Số buổi học thử (0đ)': r.trial_count || 0,
          'Số buổi có mặt (Tính phí)': r.present_count,
          'Số buổi vắng': r.absent_count,
          'Số buổi có phép': r.excused_count,
          'Giá / buổi (VNĐ)': r.price_per_session,
          'Phải thu tháng (VNĐ)': r.total,
          'Đã phân bổ (VNĐ)': r.paid_amount,
          'Còn thiếu tháng (VNĐ)': r.remaining_amount,
          'Số dư tích lũy (VNĐ)': r.cumulative_balance,
          'Trạng thái tháng': r.status,
          'Ghi chú trạng thái / Chuyển lớp': r.status_note || '',
          'Chốt tháng': r.is_locked ? 'Đã chốt' : 'Chưa chốt',
          'SĐT Phụ huynh': r.student.parent_phone || '',
        })
      })
    })

    // Sheet 2: Detailed Session-by-Session Breakdown (Group E4)
    const sessionDetailSheetData: any[] = []
    for (const profile of profilesMap.values()) {
      if (
        selectedClassId !== 'all' &&
        profile.student.class_id !== selectedClassId
      ) {
        continue
      }
      const mInfo = profile.months[selectedMonth]
      if (!mInfo || !mInfo.session_details) continue

      for (const sd of mInfo.session_details) {
        sessionDetailSheetData.push({
          'Tên học sinh': profile.student.name,
          'Lớp gốc': profile.cls?.name || '',
          'Ngày học': formatFullDdMmYyyy(sd.date),
          Thứ: getWeekdayName(sd.weekday),
          'Khung giờ': `${sd.start_time}–${sd.end_time}`,
          'Lớp học thực tế': sd.class_name,
          'Loại buổi':
            sd.session_kind === 'primary'
              ? 'Lớp chính'
              : sd.session_kind === 'extra_long_term'
              ? 'Học thêm dài hạn'
              : sd.session_kind === 'guest_swap'
              ? 'Đổi buổi (Học ghép)'
              : sd.session_kind === 'guest_extra'
              ? 'Học thêm ngắn hạn'
              : sd.session_kind === 'swapped_away'
              ? 'Đã sang lớp khác'
              : 'Buổi nghỉ/hủy',
          'Trạng thái HS ngày đó':
            sd.student_status_on_date === 'trial'
              ? 'Học thử (0đ)'
              : sd.student_status_on_date === 'left'
              ? 'Đã nghỉ'
              : 'Đang học',
          'Điểm danh': sd.badge_label,
          'Đơn giá (VNĐ)': sd.unit_price,
          'Thành tiền (VNĐ)': sd.charged_amount,
          'Ghi chú': sd.note || '',
          'Nội dung bài học': sd.lesson_note || '',
        })
      }
    }

    // Sheet 3: Guest & Extra Enrollments (Group D5)
    const guestSheetData: any[] = []
    sessionGuests
      .filter((g) => g.date.startsWith(selectedMonth))
      .forEach((g) => {
        const st = students.find((s) => s.id === g.student_id)
        const homeCls = classes.find((c) => c.id === (g.home_class_id || st?.class_id))
        const hostCls = classes.find((c) => c.id === g.host_class_id)
        const billedCls = classes.find((c) => c.id === g.billed_class_id)
        guestSheetData.push({
          'Hình thức': g.kind === 'swap' ? 'Đổi buổi (Học ghép)' : 'Học thêm 1-2 buổi',
          'Tên học sinh': st?.name || g.student_id,
          'Lớp gốc': homeCls?.name || '',
          'Lớp đến học': hostCls?.name || '',
          'Ngày học': formatFullDdMmYyyy(g.date),
          'Giờ học': g.start_time,
          'Buổi gốc được thay': g.home_session_key || '',
          'Cách tính phí':
            g.billing_mode === 'free'
              ? 'Miễn phí (0đ)'
              : g.billing_mode === 'host_price'
              ? 'Theo giá lớp ghép'
              : g.billing_mode === 'custom'
              ? `Số tiền tự nhập (${g.custom_amount || 0}đ)`
              : 'Theo giá lớp gốc',
          'Ghi vào bảng học phí lớp': billedCls?.name || homeCls?.name || '',
          'Ghi chú': g.note || '',
        })
      })

    studentEnrollments
      .filter((e) => e.kind === 'extra')
      .forEach((en) => {
        const st = students.find((s) => s.id === en.student_id)
        const homeCls = classes.find((c) => c.id === st?.class_id)
        const extraCls = classes.find((c) => c.id === en.class_id)
        guestSheetData.push({
          'Hình thức': 'Đăng ký học thêm dài hạn',
          'Tên học sinh': st?.name || en.student_id,
          'Lớp gốc': homeCls?.name || '',
          'Lớp đến học': extraCls?.name || '',
          'Ngày học': `Từ ${formatFullDdMmYyyy(en.from_date)}${
            en.to_date ? ` đến ${formatFullDdMmYyyy(en.to_date)}` : ''
          }`,
          'Giờ học': 'Hàng tuần',
          'Buổi gốc được thay': '',
          'Cách tính phí':
            en.price_override === 0
              ? 'Miễn phí (0đ)'
              : en.price_override
              ? `Giá riêng (${en.price_override}đ/buổi)`
              : `Theo giá lớp (${extraCls?.price || 0}đ/buổi)`,
          'Ghi vào bảng học phí lớp': extraCls?.name || '',
          'Ghi chú': en.note || '',
        })
      })

    // Sheet 4: Debt Summary
    const debtSheetData: any[] = []
    for (const profile of profilesMap.values()) {
      if (profile.debt_amount > 0 || profile.credit_amount > 0) {
        debtSheetData.push({
          'Tên học sinh': profile.student.name,
          Lớp: profile.cls?.name || '',
          'Trạng thái học': profile.student.status === 'left' ? 'Đã nghỉ' : 'Đang học',
          'Phụ huynh': profile.student.parent_name || '',
          'SĐT Phụ huynh': profile.student.parent_phone || '',
          'Tổng phải thu (VNĐ)': profile.total_due,
          'Tổng đã thu (VNĐ)': profile.total_paid,
          'Đang nợ (VNĐ)': profile.debt_amount,
          'Đang dư (VNĐ)': profile.credit_amount,
          'Nợ từ tháng': profile.oldest_unpaid_month || '',
          'Số tháng nợ': profile.unpaid_months_count,
          'Chi tiết tháng nợ': profile.unpaid_months
            .map((u) => `${u.month}: ${u.shortage}đ`)
            .join('; '),
        })
      }
    }

    // Sheet 5: Payment Transactions
    const txSheetData: any[] = paymentTransactions
      .slice()
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
      .map((tx) => {
        const st = students.find((s) => s.id === tx.student_id)
        const cls = classes.find((c) => c.id === st?.class_id)
        return {
          'Mã giao dịch': tx.id,
          'Ngày thu': tx.paid_at,
          'Tên học sinh': st?.name || tx.student_id,
          Lớp: cls?.name || '',
          'Số tiền thu (VNĐ)': tx.amount,
          'Hình thức':
            tx.method === 'transfer'
              ? 'Chuyển khoản'
              : tx.method === 'cash'
              ? 'Tiền mặt'
              : 'Khác',
          'Ghi chú': tx.note || '',
          'Mã gộp anh chị em': tx.group_id || '',
          'Thời điểm tạo': tx.created_at,
        }
      })

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        monthlySheetData.length > 0 ? monthlySheetData : [{ Thông_báo: 'Chưa có dữ liệu' }]
      ),
      `Học phí ${selectedMonth}`
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        sessionDetailSheetData.length > 0
          ? sessionDetailSheetData
          : [{ Thông_báo: 'Chưa có dữ liệu buổi học' }]
      ),
      'Chi tiết từng buổi'
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        guestSheetData.length > 0
          ? guestSheetData
          : [{ Thông_báo: 'Chưa có dữ liệu học ghép / học thêm' }]
      ),
      'Học ghép và học thêm'
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        debtSheetData.length > 0 ? debtSheetData : [{ Thông_báo: 'Không có công nợ' }]
      ),
      'Công nợ'
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        txSheetData.length > 0 ? txSheetData : [{ Thông_báo: 'Chưa có khoản thu' }]
      ),
      'Các khoản thu'
    )

    XLSX.writeFile(workbook, `So-Hoc-Phi-Cong-No-${selectedMonth}.xlsx`)
    toast.success(
      'Đã xuất file Excel gồm 5 sheet (Học phí, Chi tiết từng buổi, Học ghép, Công nợ, Các khoản thu)!'
    )
  }

  const handleSendEmailSummary = () => {
    const subject = encodeURIComponent(
      `Báo cáo học phí & công nợ ${formatMonth(selectedMonth)}`
    )
    let body = `BÁO CÁO HỌC PHÍ & CÔNG NỢ ${formatMonth(selectedMonth).toUpperCase()}\n`
    body += `Tổng phải thu tháng: ${formatMoney(grandTotal)}\n`
    body += `Đã phân bổ tháng: ${formatMoney(grandPaid)}\n`
    body += `Còn thiếu tháng: ${formatMoney(grandRemaining)}\n`
    body += `Tổng công nợ lũy kế: ${formatMoney(debtSummaryKPIs.totalOwing)} (${debtSummaryKPIs.owingParentCount} phụ huynh)\n\n`

    feeData.forEach(({ cls, rows, totalDue, totalPaid }) => {
      body += `--- LỚP: ${cls.name} (Phải thu: ${formatMoney(totalDue)} | Đã thu: ${formatMoney(totalPaid)}) ---\n`
      rows.forEach((r) => {
        const trialNote = r.trial_count ? ` (Học thử: ${r.trial_count} buổi 0đ)` : ''
        body += `- ${r.student.name}: ${r.present_count} buổi tính phí${trialNote} = ${formatMoney(r.total)} | Đã thu: ${formatMoney(r.paid_amount)} [${r.status}]\n`
      })
      body += '\n'
    })

    const recipient = settings.notify_email || ''
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${encodeURIComponent(body)}`
  }

  // Totals for desktop table footer
  const tableFooterTotals = useMemo(() => {
    return flatRows.reduce(
      (acc, { row }) => {
        acc.trial += row.trial_count || 0
        acc.present += row.present_count
        acc.total += row.total
        acc.paid += row.paid_amount
        acc.remaining += row.remaining_amount
        acc.balance += row.cumulative_balance
        return acc
      },
      { trial: 0, present: 0, total: 0, paid: 0, remaining: 0, balance: 0 }
    )
  }, [flatRows])

  const reminderProfile = reminderStudentId
    ? profilesMap.get(reminderStudentId)
    : undefined

  return (
    <div className="min-h-screen pb-24 desktop:pb-10">
      <TopBar
        title="Quản lý học phí & Công nợ"
        subtitle={`Kỳ đang xem: ${formatMonth(selectedMonth)} · Tự động tính theo từng buổi & FIFO`}
        rightContent={
          <div className="flex items-center gap-2">
            <button
              onClick={exportExcel}
              className="btn-primary py-1.5 px-3 text-xs bg-emerald-600 hover:bg-emerald-700"
              title="Xuất Excel 5 Sheet: Học phí, Chi tiết từng buổi, Học ghép, Công nợ, Các khoản thu"
            >
              <Download size={15} /> <span className="hidden sm:inline">Xuất Excel (5 sheet)</span>
            </button>
          </div>
        }
      />

      <div className="p-4 tablet:p-6 max-w-[1600px] mx-auto flex flex-col gap-5">
        {/* Mode Switcher Bar (Section 2.9: "Theo tháng" | "Công nợ" | "Thống kê") */}
        <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-3 bg-white dark:bg-slate-850 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setMainMode('monthly')}
              className={cn(
                'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2',
                mainMode === 'monthly'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <FileSpreadsheet size={16} />
              Theo tháng ({formatMonth(selectedMonth)})
            </button>
            <button
              type="button"
              onClick={() => setMainMode('debt')}
              className={cn(
                'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2',
                mainMode === 'debt'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <AlertCircle size={16} />
              Công nợ ({debtProfilesList.length})
            </button>
            <button
              type="button"
              onClick={() => setMainMode('stats')}
              className={cn(
                'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2',
                mainMode === 'stats'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <BarChart3 size={16} />
              Biểu đồ thu nhập
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <select
              aria-label="Chọn tháng"
              className="input text-xs py-1.5 font-semibold w-40"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>

            <select
              aria-label="Lọc theo lớp"
              className="input text-xs py-1.5 font-semibold w-48"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="all">Tất cả lớp ({classes.length})</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleSendEmailSummary}
              className="btn-secondary py-1.5 px-3 text-xs hidden sm:inline-flex items-center gap-1.5"
            >
              <Mail size={14} className="text-blue-500" />
              Gửi Gmail
            </button>
          </div>
        </div>

        {/* =========================================================
            MODE 1: "THEO THÁNG" (Section 2.4 + 2.9 + Groups A2, D5, E4)
           ========================================================= */}
        {mainMode === 'monthly' && (
          <>
            {/* 4 KPI Cards */}
            <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3 tablet:gap-4">
              <div className="card p-4 border-l-4 border-l-blue-600 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Phải thu ({formatMonth(selectedMonth)})</span>
                  <Wallet size={16} className="text-blue-500" />
                </div>
                <div className="mt-2 font-extrabold text-lg tablet:text-2xl text-slate-900 dark:text-white">
                  {formatMoney(grandTotal)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Buổi có mặt × đơn giá (Phí học thử mặc định = phí đi học, có thể chỉnh)
                </div>
              </div>

              <div className="card p-4 border-l-4 border-l-emerald-600 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Đã thu phân bổ</span>
                  <CheckCircle size={16} className="text-emerald-500" />
                </div>
                <div className="mt-2 font-extrabold text-lg tablet:text-2xl text-emerald-600 dark:text-emerald-400">
                  {formatMoney(grandPaid)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Phân bổ tự động theo FIFO
                </div>
              </div>

              <div className="card p-4 border-l-4 border-l-red-500 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Còn thiếu tháng này</span>
                  <AlertCircle size={16} className="text-red-500" />
                </div>
                <div
                  className={cn(
                    'mt-2 font-extrabold text-lg tablet:text-2xl',
                    grandRemaining > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {formatMoney(grandRemaining)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tự cập nhật khi ghi nhận khoản thu
                </div>
              </div>

              <div className="card p-4 border-l-4 border-l-amber-500 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Số phụ huynh đang nợ</span>
                  <Users size={16} className="text-amber-500" />
                </div>
                <div className="mt-2 font-extrabold text-lg tablet:text-2xl text-amber-600 dark:text-amber-400">
                  {debtSummaryKPIs.owingParentCount}{' '}
                  <span className="text-sm font-semibold">phụ huynh</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tổng nợ lũy kế: {formatMoney(debtSummaryKPIs.totalOwing)}
                </div>
              </div>
            </div>

            {/* Month Lock ("Chốt tháng") Banner per Class (Section 2.9) */}
            <div className="card p-3.5 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Lock size={15} className="text-amber-600 shrink-0" />
                <span>
                  <strong>Chốt tháng ({formatMonth(selectedMonth)}):</strong> Khi chốt tháng cho một lớp, số tiền phải thu của tháng đó được cố định, mọi thay đổi điểm danh/giá về sau không làm đổi số đã chốt.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {filteredClasses.map((cls) => {
                  const locked = monthLocks.some(
                    (l) => l.class_id === cls.id && l.month === selectedMonth
                  )
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() =>
                        setLockConfirmAction({
                          type: locked ? 'unlock' : 'lock',
                          cls,
                          month: selectedMonth,
                        })
                      }
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border transition-all',
                        locked
                          ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
                          : 'bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      )}
                    >
                      {locked ? (
                        <>
                          <Lock size={13} className="text-amber-600" /> {cls.name}: Đã chốt (Mở chốt)
                        </>
                      ) : (
                        <>
                          <Unlock size={13} className="text-slate-400" /> Chốt tháng {cls.name}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* DESKTOP FULL DATA TABLE (>= 1200px) */}
            <div className="hidden desktop:block card overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="relative w-72">
                    <Search
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={headerSearch}
                      onChange={(e) => setHeaderSearch(e.target.value)}
                      placeholder="Lọc nhanh tên học sinh, phụ huynh, lớp..."
                      className="input pl-9 py-1.5 text-xs"
                    />
                  </div>

                  <select
                    aria-label="Lọc theo lớp trong bảng"
                    className="input text-xs py-1.5 font-semibold w-44"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                  >
                    <option value="all">Tất cả lớp ({classes.length})</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 mr-1">
                    Trạng thái tháng:
                  </span>
                  {(['all', 'Đủ', 'Còn thiếu', 'Chưa đóng', 'Đóng dư'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                          statusFilter === st
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        )}
                      >
                        {st === 'all' ? `Tất cả (${flatRows.length})` : st}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <th
                        onClick={() => handleSort('name')}
                        className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 px-4 py-3.5 cursor-pointer hover:text-blue-600 select-none min-w-[230px]"
                      >
                        <div className="flex items-center gap-1.5">
                          Học sinh {renderSortIcon('name')}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('class')}
                        className="px-3 py-3.5 cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          Lớp {renderSortIcon('class')}
                        </div>
                      </th>
                      {/* Group A2: "Học thử" column */}
                      <th
                        onClick={() => handleSort('trial')}
                        className="px-3 py-3.5 text-center cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center justify-center gap-1">
                          Học thử {renderSortIcon('trial')}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('present')}
                        className="px-3 py-3.5 text-center cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center justify-center gap-1">
                          Có mặt / V / P {renderSortIcon('present')}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('price')}
                        className="px-3 py-3.5 text-right cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center justify-end gap-1">
                          Đơn giá {renderSortIcon('price')}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('total')}
                        className="px-3 py-3.5 text-right cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center justify-end gap-1">
                          Phải thu {renderSortIcon('total')}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('paid_amount')}
                        className="px-3 py-3.5 text-right cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center justify-end gap-1">
                          Đã thu {renderSortIcon('paid_amount')}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('remaining')}
                        className="px-3 py-3.5 text-right cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center justify-end gap-1">
                          Còn thiếu / Dư {renderSortIcon('remaining')}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('status')}
                        className="px-3 py-3.5 text-center cursor-pointer hover:text-blue-600 select-none"
                      >
                        <div className="flex items-center justify-center gap-1">
                          Trạng thái {renderSortIcon('status')}
                        </div>
                      </th>
                      <th className="px-4 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {flatRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                          Không có dữ liệu học sinh khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      flatRows.map(({ row, cls }) => {
                        const curStatus = getStudentCurrentStatus(
                          row.student,
                          studentStatusHistory,
                          todayStr
                        )
                        return (
                          <tr
                            key={row.student.id}
                            className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors group"
                          >
                            <td className="sticky left-0 z-10 bg-white dark:bg-slate-850 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setFeeDetailStudent(row.student)}
                                  className="hover:text-blue-600 hover:underline text-left font-bold"
                                  title="Bấm để xem Chi tiết học phí từng buổi (Mục E4)"
                                >
                                  {row.student.name}
                                </button>
                                {curStatus === 'trial' && (
                                  <button
                                    type="button"
                                    onClick={() => setStatusModalStudent(row.student)}
                                    className="badge bg-amber-100 text-amber-800 hover:bg-amber-200 text-[10px] font-bold"
                                    title="Bấm để chuyển sang đang học chính thức"
                                  >
                                    Học thử
                                  </button>
                                )}
                                {row.is_locked && (
                                  <span title="Đã chốt tháng">
                                    <Lock size={12} className="text-amber-600" />
                                  </span>
                                )}
                              </div>

                              {/* Group A2 & E3: Status / Transfer note line */}
                              {row.status_note && (
                                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mt-0.5">
                                  {row.status_note}
                                </div>
                              )}

                              {/* Group D5 & E3: Multi-class breakdown sub-lines */}
                              {row.class_breakdowns && row.class_breakdowns.length > 1 && (
                                <div className="text-[11px] font-normal text-purple-700 dark:text-purple-300 mt-0.5 space-y-0.5">
                                  {row.class_breakdowns.map((bd) => (
                                    <div key={`${bd.class_id}-${bd.kind}`}>
                                      • {bd.class_name}
                                      {bd.kind === 'extra'
                                        ? ' (học thêm)'
                                        : bd.kind === 'guest'
                                        ? ' (học ghép)'
                                        : ''}
                                      : {bd.present_count} buổi = {formatMoney(bd.due_amount)}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {row.student.parent_name && (
                                <div className="text-xs font-normal text-slate-400">
                                  PH: {row.student.parent_name}{' '}
                                  {row.student.parent_phone
                                    ? `· ${row.student.parent_phone}`
                                    : ''}
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-3">
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 text-xs">
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: cls.color }}
                                />
                                {cls.name}
                              </span>
                            </td>

                            {/* Group A2: "Học thử" column */}
                            <td className="px-3 py-3 text-center text-xs">
                              {row.trial_count && row.trial_count > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setStatusModalStudent(row.student)}
                                  className="px-2 py-0.5 rounded-full bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold text-[11px]"
                                  title="Bấm để thay đổi phí học thử hoặc chuyển trạng thái"
                                >
                                  {row.trial_count} buổi (
                                  {row.student.trial_price === 0
                                    ? '0đ'
                                    : formatMoney(
                                        row.student.trial_price ?? row.price_per_session
                                      )}
                                  )
                                </button>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>

                            <td className="px-3 py-3 text-center text-xs">
                              <span className="font-bold text-emerald-600">
                                {row.present_count}
                              </span>
                              <span className="text-slate-300 mx-1">/</span>
                              <span className="text-red-500">{row.absent_count}</span>
                              <span className="text-slate-300 mx-1">/</span>
                              <span className="text-amber-600">{row.excused_count}</span>
                            </td>

                            <td className="px-3 py-3 text-right text-slate-600 dark:text-slate-400 text-xs font-medium">
                              {formatMoney(row.price_per_session)}
                            </td>

                            <td className="px-3 py-3 text-right font-bold text-slate-900 dark:text-white">
                              {formatMoney(row.total)}
                            </td>

                            <td className="px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {formatMoney(row.paid_amount)}
                            </td>

                            <td className="px-3 py-3 text-right font-extrabold">
                              {row.remaining_amount > 0 ? (
                                <span className="text-red-600 dark:text-red-400">
                                  Thiếu {formatMoney(row.remaining_amount)}
                                </span>
                              ) : row.cumulative_balance > 0 ? (
                                <span className="text-blue-600 dark:text-blue-400">
                                  Dư +{formatMoney(row.cumulative_balance)}
                                </span>
                              ) : (
                                <span className="text-slate-400">0đ</span>
                              )}
                            </td>

                            <td className="px-3 py-3 text-center">
                              {renderStatusBadge(row.status)}
                            </td>

                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setFeeDetailStudent(row.student)}
                                  className="btn-secondary py-1 px-2 text-xs"
                                  title="Xem chi tiết từng buổi trong tháng (Mục E4)"
                                >
                                  <Calendar size={13} className="text-blue-600" /> Chi tiết
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditTx(null)
                                    setDefaultShortage(row.remaining_amount)
                                    setRecordPaymentStudent(row.student)
                                  }}
                                  className="btn-primary py-1 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                                  title="Ghi nhận khoản thu"
                                >
                                  <Plus size={13} /> Thu phí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLedgerStudentId(row.student.id)}
                                  className="btn-secondary py-1 px-2 text-xs"
                                  title="Mở Sổ học phí"
                                >
                                  <BookOpen size={13} /> Sổ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReminderTemplate('gentle')
                                    setReminderStudentId(row.student.id)
                                  }}
                                  className="btn-secondary py-1 px-2 text-xs"
                                  title="Soạn tin nhắn nhắc học phí Zalo"
                                >
                                  <MessageSquare size={13} className="text-blue-600" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>

                  {flatRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 font-extrabold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700 text-sm">
                        <td className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 px-4 py-3.5">
                          TỔNG CỘNG ({flatRows.length} học sinh)
                        </td>
                        <td className="px-3 py-3.5" />
                        <td className="px-3 py-3.5 text-center text-amber-700 dark:text-amber-400">
                          {tableFooterTotals.trial > 0
                            ? `${tableFooterTotals.trial} buổi thử`
                            : '—'}
                        </td>
                        <td className="px-3 py-3.5 text-center text-emerald-700 dark:text-emerald-400">
                          {tableFooterTotals.present} buổi
                        </td>
                        <td className="px-3 py-3.5" />
                        <td className="px-3 py-3.5 text-right text-blue-600 dark:text-blue-400">
                          {formatMoney(tableFooterTotals.total)}
                        </td>
                        <td className="px-3 py-3.5 text-right text-emerald-600 dark:text-emerald-400">
                          {formatMoney(tableFooterTotals.paid)}
                        </td>
                        <td className="px-3 py-3.5 text-right text-red-600 dark:text-red-400">
                          Thiếu: {formatMoney(tableFooterTotals.remaining)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* MOBILE & TABLET CARDS (< 1200px) */}
            <div className="desktop:hidden flex flex-col gap-4">
              {feeData.map(({ cls, rows, totalDue, totalPaid, totalRemaining, isLocked }) => (
                <div key={cls.id} className="card overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60"
                    style={{ borderLeftColor: cls.color, borderLeftWidth: 4 }}
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                        {cls.name}
                        {isLocked && (
                          <span className="badge bg-amber-100 text-amber-800 text-[10px]">
                            🔒 Đã chốt
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Phải thu: <strong>{formatMoney(totalDue)}</strong> · Đã thu:{' '}
                        <strong className="text-emerald-600">{formatMoney(totalPaid)}</strong>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'badge text-xs',
                        totalRemaining > 0
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      )}
                    >
                      {totalRemaining > 0
                        ? `Thiếu ${formatMoney(totalRemaining)}`
                        : 'Đã thu đủ'}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row) => (
                      <div key={row.student.id} className="p-3.5 flex flex-col gap-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setFeeDetailStudent(row.student)}
                                className="text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 text-left"
                              >
                                {row.student.name}
                              </button>
                              {row.trial_count && row.trial_count > 0 ? (
                                <span className="badge bg-amber-100 text-amber-800 text-[10px]">
                                  Học thử {row.trial_count} buổi (0đ)
                                </span>
                              ) : null}
                            </div>
                            {row.status_note && (
                              <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mt-0.5">
                                {row.status_note}
                              </div>
                            )}
                            <div className="text-xs text-slate-500 mt-0.5">
                              {row.present_count} buổi tính phí × {formatMoney(row.price_per_session)} ={' '}
                              <strong>{formatMoney(row.total)}</strong>
                            </div>
                            <div className="text-xs mt-0.5">
                              Đã thu:{' '}
                              <strong className="text-emerald-600">
                                {formatMoney(row.paid_amount)}
                              </strong>{' '}
                              ·{' '}
                              {row.remaining_amount > 0 ? (
                                <span className="text-red-600 font-bold">
                                  Thiếu {formatMoney(row.remaining_amount)}
                                </span>
                              ) : row.cumulative_balance > 0 ? (
                                <span className="text-blue-600 font-bold">
                                  Dư +{formatMoney(row.cumulative_balance)}
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-semibold">Đủ</span>
                              )}
                            </div>
                          </div>
                          {renderStatusBadge(row.status)}
                        </div>

                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setFeeDetailStudent(row.student)}
                            className="btn-secondary py-1.5 px-2.5 text-xs"
                          >
                            <Calendar size={14} className="text-blue-600" /> Chi tiết
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditTx(null)
                              setDefaultShortage(row.remaining_amount)
                              setRecordPaymentStudent(row.student)
                            }}
                            className="btn-primary py-1.5 px-3 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Plus size={14} /> Thu phí
                          </button>
                          <button
                            type="button"
                            onClick={() => setLedgerStudentId(row.student.id)}
                            className="btn-secondary py-1.5 px-2.5 text-xs"
                          >
                            <BookOpen size={14} /> Sổ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReminderTemplate('gentle')
                              setReminderStudentId(row.student.id)
                            }}
                            className="btn-secondary py-1.5 px-2.5 text-xs"
                          >
                            <MessageSquare size={14} className="text-blue-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* =========================================================
            MODE 2: "CÔNG NỢ" (Section 2.9 Debt Management View)
           ========================================================= */}
        {mainMode === 'debt' && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
              <div className="card p-4 border-l-4 border-l-red-600">
                <div className="text-xs font-semibold text-slate-500">Tổng đang nợ</div>
                <div className="text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1">
                  {formatMoney(debtSummaryKPIs.totalOwing)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Cộng dồn tất cả các tháng chưa đóng đủ
                </div>
              </div>

              <div className="card p-4 border-l-4 border-l-blue-600">
                <div className="text-xs font-semibold text-slate-500">
                  Tổng đang dư (Đóng trước)
                </div>
                <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
                  {formatMoney(debtSummaryKPIs.totalCredit)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tự động khấu trừ vào các tháng kế tiếp
                </div>
              </div>

              <div className="card p-4 border-l-4 border-l-amber-500">
                <div className="text-xs font-semibold text-slate-500">
                  Số phụ huynh đang nợ
                </div>
                <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                  {debtSummaryKPIs.owingParentCount}{' '}
                  <span className="text-sm font-semibold">phụ huynh</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Gồm cả học sinh đã nghỉ nhưng còn nợ
                </div>
              </div>
            </div>

            {/* Debt Filter & Sort Toolbar */}
            <div className="card p-4 flex flex-col tablet:flex-row tablet:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  placeholder="Tìm học sinh hoặc phụ huynh đang nợ..."
                  className="input pl-9 py-1.5 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Sắp xếp theo:</span>
                <button
                  type="button"
                  onClick={() => setDebtSortBy('oldest')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5',
                    debtSortBy === 'oldest'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  )}
                >
                  <Clock size={13} /> Nợ lâu nhất trước
                </button>
                <button
                  type="button"
                  onClick={() => setDebtSortBy('amount')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5',
                    debtSortBy === 'amount'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  )}
                >
                  <Wallet size={13} /> Số tiền nợ lớn nhất
                </button>
              </div>
            </div>

            {/* Owing Students List */}
            {debtProfilesList.length === 0 ? (
              <div className="card p-12 text-center">
                <CheckCircle size={44} className="mx-auto text-emerald-500 mb-3" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Tuyệt vời! Không có học sinh nào đang nợ học phí
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tất cả học phí phát sinh đến hiện tại đã được thu đủ.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {debtProfilesList.map((profile) => (
                  <div
                    key={profile.student.id}
                    className="card p-4 flex flex-col tablet:flex-row tablet:items-center justify-between gap-4 border-l-4 border-l-red-500"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setFeeDetailStudent(profile.student)}
                          className="text-base font-extrabold text-slate-900 dark:text-white hover:text-blue-600 hover:underline"
                        >
                          {profile.student.name}
                        </button>
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: profile.cls?.color || '#3B82F6' }}
                        >
                          {profile.cls?.name || 'Lớp'}
                        </span>
                        {profile.student.status === 'left' && (
                          <span className="badge bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 text-xs font-bold">
                            Đã nghỉ học (còn nợ)
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap mt-0.5">
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          Nợ từ {formatMonth(profile.oldest_unpaid_month || selectedMonth)} ({profile.unpaid_months_count} tháng)
                        </span>
                        <span>·</span>
                        <span>
                          Chi tiết:{' '}
                          {profile.unpaid_months
                            .map(
                              (u) =>
                                `T${u.month.split('-')[1]}/${u.month.split('-')[0]} (${formatMoney(u.shortage)})`
                            )
                            .join(', ')}
                        </span>
                      </div>

                      {profile.student.parent_name && (
                        <div className="text-xs text-slate-400">
                          Phụ huynh: <strong>{profile.student.parent_name}</strong>{' '}
                          {profile.student.parent_phone
                            ? `· ${profile.student.parent_phone}`
                            : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col tablet:items-end gap-2.5 shrink-0">
                      <div className="text-lg font-extrabold text-red-600 dark:text-red-400">
                        Nợ: {formatMoney(profile.debt_amount)}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {profile.student.parent_phone && (
                          <a
                            href={formatPhoneTel(profile.student.parent_phone)}
                            className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                          >
                            <Phone size={14} className="text-blue-600" /> Gọi phụ huynh
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setFeeDetailStudent(profile.student)}
                          className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                        >
                          <Calendar size={14} className="text-blue-600" /> Chi tiết buổi
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReminderTemplate('gentle')
                            setReminderStudentId(profile.student.id)
                          }}
                          className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                        >
                          <MessageSquare size={14} className="text-blue-600" /> Soạn tin nhắc
                        </button>
                        <button
                          type="button"
                          onClick={() => setLedgerStudentId(profile.student.id)}
                          className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                        >
                          <BookOpen size={14} /> Sổ học phí
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditTx(null)
                            setDefaultShortage(profile.debt_amount)
                            setRecordPaymentStudent(profile.student)
                          }}
                          className="btn-primary py-1.5 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5"
                        >
                          <Plus size={14} /> Ghi nhận khoản thu
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            MODE 3: "BIỂU ĐỒ THU NHẬP" (Section 3.4)
           ========================================================= */}
        {mainMode === 'stats' && (
          <div className="grid grid-cols-1 desktop:grid-cols-2 gap-5">
            <div className="card p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BarChart3 size={18} className="text-blue-600 dark:text-blue-400" />
                  Biểu đồ thu nhập theo tháng (6 tháng gần nhất)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  So sánh tổng học phí phải thu và số tiền đã phân bổ (FIFO)
                </p>
              </div>

              <div className="mt-6 h-56 flex items-end justify-between gap-3 pt-6 px-2 border-b border-slate-200 dark:border-slate-800">
                {last6MonthsStats.map((item) => {
                  const dueHeight = Math.max(
                    Math.round((item.due / max6MonthValue) * 100),
                    item.due > 0 ? 8 : 2
                  )
                  const isSelected = item.month === selectedMonth
                  return (
                    <div
                      key={item.month}
                      onClick={() => setSelectedMonth(item.month)}
                      className="flex-1 flex flex-col items-center gap-2 cursor-pointer group"
                    >
                      <div className="text-[10px] font-bold text-slate-500">
                        {item.due > 0 ? `${Math.round(item.due / 1000)}k` : '0'}
                      </div>
                      <div className="w-full max-w-[44px] h-40 bg-slate-100/80 dark:bg-slate-800/60 rounded-t-xl relative flex items-end justify-center overflow-hidden">
                        <div
                          className="w-full bg-blue-200 dark:bg-blue-900/60 transition-all duration-300 rounded-t-xl relative"
                          style={{ height: `${dueHeight}%` }}
                        >
                          <div
                            className="w-full bg-emerald-500 bottom-0 absolute left-0 right-0 transition-all duration-300 rounded-t-lg"
                            style={{
                              height:
                                item.due > 0
                                  ? `${Math.min(100, Math.round((item.paid / item.due) * 100))}%`
                                  : '0%',
                            }}
                          />
                        </div>
                      </div>
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          isSelected
                            ? 'text-blue-600 dark:text-blue-400 font-bold underline'
                            : 'text-slate-500'
                        )}
                      >
                        {item.shortLabel}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <TrendingUp size={18} className="text-orange-500" />
                  So sánh thu nhập giữa các lớp ({formatMonth(selectedMonth)})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tỷ trọng doanh thu và tiến độ thu của từng lớp
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4 flex-1 justify-center">
                {feeData.map(({ cls, totalDue, totalPaid, totalRemaining }) => {
                  const percent =
                    grandTotal > 0 ? Math.round((totalDue / grandTotal) * 100) : 0
                  const paidPercent =
                    totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

                  return (
                    <div key={cls.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: cls.color }}
                          />
                          {cls.name}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatMoney(totalDue)} ({percent}%)
                        </span>
                      </div>

                      <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className="h-full transition-all duration-300 rounded-full"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: cls.color,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          Đã thu:{' '}
                          <strong className="text-emerald-600">
                            {formatMoney(totalPaid)}
                          </strong>{' '}
                          ({paidPercent}%)
                        </span>
                        <span
                          className={
                            totalRemaining > 0
                              ? 'text-red-500 font-semibold'
                              : 'text-emerald-600 font-semibold'
                          }
                        >
                          {totalRemaining > 0
                            ? `Còn thiếu: ${formatMoney(totalRemaining)}`
                            : '✓ Đã thu đủ'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Record / Edit Payment Modal */}
      <RecordPaymentModal
        open={!!recordPaymentStudent}
        onClose={() => {
          setRecordPaymentStudent(null)
          setEditTx(null)
        }}
        student={recordPaymentStudent}
        editTransaction={editTx}
        defaultMonthShortage={defaultShortage}
      />

      {/* Student Fee Ledger Modal ("Sổ học phí") */}
      <StudentFeeLedgerModal
        open={!!ledgerStudentId}
        onClose={() => setLedgerStudentId(null)}
        studentId={ledgerStudentId}
        onOpenRecordPayment={(st, txToEdit) => {
          setEditTx(txToEdit || null)
          setRecordPaymentStudent(st)
        }}
      />

      {/* Group E4: Student Fee Detail Drawer (Right Slide-over / Mobile Fullscreen) */}
      <StudentFeeDetailDrawer
        student={feeDetailStudent}
        initialMonth={selectedMonth}
        isOpen={!!feeDetailStudent}
        onClose={() => setFeeDetailStudent(null)}
        onOpenRecordPayment={(st) => {
          setFeeDetailStudent(null)
          setEditTx(null)
          setRecordPaymentStudent(st)
        }}
        onOpenStatusChange={(st) => {
          setFeeDetailStudent(null)
          setStatusModalStudent(st)
        }}
        onOpenGuestModal={(st) => {
          setFeeDetailStudent(null)
          setGuestModalStudent(st)
        }}
        onOpenTransferClass={(st) => {
          setFeeDetailStudent(null)
          setTransferModalStudent(st)
        }}
      />

      {/* Group A3: Student Status Change Modal */}
      <StudentStatusChangeModal
        student={statusModalStudent}
        isOpen={!!statusModalStudent}
        onClose={() => setStatusModalStudent(null)}
      />

      {/* Group D4: Session Guest Modal */}
      <SessionGuestModal
        isOpen={!!guestModalStudent}
        onClose={() => setGuestModalStudent(null)}
        presetStudent={guestModalStudent}
      />

      {/* Group E3: Class Transfer Modal */}
      <ClassTransferModal
        student={transferModalStudent}
        isOpen={!!transferModalStudent}
        onClose={() => setTransferModalStudent(null)}
      />

      {/* Zalo / SMS Fee Reminder Modal with 2 Templates (Nhắc nhẹ & Nhắc lần 2) */}
      <Modal
        open={!!reminderProfile}
        onClose={() => setReminderStudentId(null)}
        title="Soạn tin nhắn nhắc học phí (Số liệu công nợ thực tế)"
      >
        {reminderProfile && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500">Chọn mẫu tin nhắn:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setReminderTemplate('gentle')}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-bold transition-colors',
                    reminderTemplate === 'gentle'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  )}
                >
                  Mẫu 1: Nhắc nhẹ
                </button>
                <button
                  type="button"
                  onClick={() => setReminderTemplate('second')}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-bold transition-colors',
                    reminderTemplate === 'second'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  )}
                >
                  Mẫu 2: Nhắc lần 2
                </button>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSessionBreakdown}
                onChange={(e) => setIncludeSessionBreakdown(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>Đính kèm danh sách chi tiết từng buổi trong tháng {formatMonth(selectedMonth)}</span>
            </label>

            <textarea
              className="input font-mono text-xs leading-relaxed"
              rows={11}
              readOnly
              value={generateDebtReminderMessage({
                profile: reminderProfile,
                selectedMonth,
                template: reminderTemplate,
                includeSessionBreakdown,
              })}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setReminderStudentId(null)}
                className="btn-secondary flex-1"
              >
                Đóng
              </button>
              <button
                onClick={() =>
                  handleCopyReminder(
                    generateDebtReminderMessage({
                      profile: reminderProfile,
                      selectedMonth,
                      template: reminderTemplate,
                      includeSessionBreakdown,
                    }),
                    reminderProfile.student.id
                  )
                }
                className="btn-primary flex-1"
              >
                {copiedId === reminderProfile.student.id ? (
                  <>
                    <Check size={16} /> Đã sao chép
                  </>
                ) : (
                  <>
                    <Copy size={16} /> Sao chép tin nhắn
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Month Lock / Unlock Confirmation Dialog */}
      <ConfirmDialog
        open={!!lockConfirmAction}
        onClose={() => setLockConfirmAction(null)}
        onConfirm={() => {
          if (!lockConfirmAction) return
          if (lockConfirmAction.type === 'lock') {
            lockMonth(lockConfirmAction.cls.id, lockConfirmAction.month)
            toast.success(
              `Đã chốt số liệu phải thu ${formatMonth(lockConfirmAction.month)} cho lớp ${lockConfirmAction.cls.name}!`
            )
          } else {
            unlockMonth(lockConfirmAction.cls.id, lockConfirmAction.month)
            toast.success(
              `Đã mở chốt ${formatMonth(lockConfirmAction.month)} cho lớp ${lockConfirmAction.cls.name}!`
            )
          }
          setLockConfirmAction(null)
        }}
        title={
          lockConfirmAction?.type === 'lock'
            ? `Chốt học phí ${formatMonth(lockConfirmAction.month)}?`
            : `Mở chốt học phí ${lockConfirmAction ? formatMonth(lockConfirmAction.month) : ''}?`
        }
        message={
          lockConfirmAction?.type === 'lock'
            ? `Khi chốt tháng cho lớp "${lockConfirmAction.cls.name}", số tiền phải thu của từng học sinh trong tháng này sẽ được cố định vào bản chụp (snapshot). Các chỉnh sửa điểm danh hoặc đơn giá về sau sẽ không làm thay đổi số tiền đã chốt.`
            : `Khi mở chốt, học phí phải thu của lớp "${lockConfirmAction?.cls.name}" trong tháng này sẽ được tính động trở lại theo dữ liệu điểm danh và đơn giá hiện hành.`
        }
        confirmLabel={lockConfirmAction?.type === 'lock' ? 'Xác nhận chốt tháng' : 'Mở chốt'}
      />
    </div>
  )
}
