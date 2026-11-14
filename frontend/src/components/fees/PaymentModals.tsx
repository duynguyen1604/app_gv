import { useState, useMemo, useEffect } from 'react'
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  Users,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Phone,
  History,
  Sparkles,
  Lock,
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useAppStore } from '../../store/useAppStore'
import {
  computeAllStudentDebtProfiles,
  findSiblingStudents,
  type StudentDebtProfile,
} from '../../lib/debtEngine'
import { formatDate, formatMoney, formatMonth } from '../../lib/dateUtils'
import { cn, formatPhoneTel } from '../../lib/utils'
import type { PaymentMethod, PaymentTransaction, Student } from '../../types'

interface RecordPaymentModalProps {
  open: boolean
  onClose: () => void
  student: Student | null
  editTransaction?: PaymentTransaction | null
  defaultMonthShortage?: number
}

export function RecordPaymentModal({
  open,
  onClose,
  student,
  editTransaction,
  defaultMonthShortage,
}: RecordPaymentModalProps) {
  const {
    classes,
    students,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    paymentTransactions,
    monthLocks,
    addPaymentTransaction,
    addBulkPaymentTransactions,
    updatePaymentTransaction,
  } = useAppStore()

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
    ]
  )

  const profile = student ? profilesMap.get(student.id) : undefined
  const suggestedDebt =
    profile && profile.debt_amount > 0
      ? profile.debt_amount
      : defaultMonthShortage && defaultMonthShortage > 0
      ? defaultMonthShortage
      : 0

  const [amount, setAmount] = useState<string>('')
  const [paidAt, setPaidAt] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [note, setNote] = useState<string>('')

  // Multi-student (sibling) split payment state
  const [isMultiStudent, setIsMultiStudent] = useState(false)
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<string[]>([])
  const [siblingAllocations, setSiblingAllocations] = useState<Record<string, number>>({})
  const [extraCandidateId, setExtraCandidateId] = useState<string>('')

  // Confirm dialog before updating an existing transaction
  const [showConfirmEdit, setShowConfirmEdit] = useState(false)

  // Detect natural siblings (same parent phone or parent name)
  const detectedSiblings = useMemo(() => {
    if (!student) return []
    return findSiblingStudents(student, students)
  }, [student, students])

  useEffect(() => {
    if (!open || !student) return
    if (editTransaction) {
      setAmount(String(editTransaction.amount))
      setPaidAt(editTransaction.paid_at.slice(0, 10))
      setMethod(editTransaction.method)
      setNote(editTransaction.note || '')
      setIsMultiStudent(false)
    } else {
      setAmount(suggestedDebt > 0 ? String(suggestedDebt) : '')
      setPaidAt(format(new Date(), 'yyyy-MM-dd'))
      setMethod('transfer')
      setNote('')
      setIsMultiStudent(false)

      const sibIds = detectedSiblings.map((s) => s.id)
      setSelectedSiblingIds(sibIds)
      const initAlloc: Record<string, number> = {}
      let sumDebt = 0
      for (const id of sibIds) {
        const d = profilesMap.get(id)?.debt_amount || 0
        initAlloc[id] = d
        sumDebt += d
      }
      setSiblingAllocations(initAlloc)
      if (sibIds.length > 1 && sumDebt > 0) {
        // Keep single student default, user can toggle multi-student if desired
      }
    }
  }, [open, student, editTransaction, suggestedDebt, detectedSiblings, profilesMap])

  // Auto-distribute total amount across selected siblings proportionally / up to each child's debt
  const distributeTotalAcrossSiblings = (totalVal: number, ids: string[]) => {
    let remaining = Math.max(0, Math.round(totalVal))
    const nextAlloc: Record<string, number> = {}
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const stDebt = profilesMap.get(id)?.debt_amount || 0
      if (i === ids.length - 1) {
        nextAlloc[id] = remaining
      } else {
        const give = Math.min(remaining, stDebt)
        nextAlloc[id] = give
        remaining = Math.max(0, remaining - give)
      }
    }
    setSiblingAllocations(nextAlloc)
  }

  const handleToggleMultiStudent = (checked: boolean) => {
    setIsMultiStudent(checked)
    if (checked && student) {
      const ids =
        selectedSiblingIds.length > 0 ? selectedSiblingIds : [student.id]
      let totalDebt = 0
      const nextAlloc: Record<string, number> = {}
      for (const id of ids) {
        const d = profilesMap.get(id)?.debt_amount || 0
        nextAlloc[id] = d
        totalDebt += d
      }
      setSiblingAllocations(nextAlloc)
      if (totalDebt > 0) {
        setAmount(String(totalDebt))
      }
    } else if (student) {
      setAmount(suggestedDebt > 0 ? String(suggestedDebt) : '')
    }
  }

  const handleAddSiblingCandidate = () => {
    if (!extraCandidateId || selectedSiblingIds.includes(extraCandidateId)) return
    const nextIds = [...selectedSiblingIds, extraCandidateId]
    setSelectedSiblingIds(nextIds)
    const d = profilesMap.get(extraCandidateId)?.debt_amount || 0
    const nextAlloc = { ...siblingAllocations, [extraCandidateId]: d }
    setSiblingAllocations(nextAlloc)
    const sum = Object.values(nextAlloc).reduce((s, v) => s + v, 0)
    setAmount(String(sum))
    setExtraCandidateId('')
  }

  const executeSave = () => {
    if (!student) return

    if (editTransaction) {
      const parsed = Math.round(Number(amount) || 0)
      if (parsed <= 0) {
        toast.error('Vui lòng nhập số tiền hợp lệ (> 0đ)')
        return
      }
      updatePaymentTransaction(editTransaction.id, {
        amount: parsed,
        paid_at: paidAt,
        method,
        note: note.trim() || null,
      })
      toast.success('Đã cập nhật khoản thu và ghi vào nhật ký thay đổi!')
      setShowConfirmEdit(false)
      onClose()
      return
    }

    if (isMultiStudent && selectedSiblingIds.length > 1) {
      const items = selectedSiblingIds
        .map((id) => ({
          student_id: id,
          amount: Math.round(siblingAllocations[id] || 0),
          paid_at: paidAt,
          method,
          note:
            note.trim() ||
            `Thu gộp cùng phụ huynh (${selectedSiblingIds.length} học sinh)`,
        }))
        .filter((it) => it.amount > 0)

      if (items.length === 0) {
        toast.error('Vui lòng phân bổ số tiền > 0đ cho ít nhất 1 học sinh')
        return
      }
      addBulkPaymentTransactions(items)
      toast.success(
        `Đã ghi nhận khoản thu gộp cho ${items.length} học sinh!`
      )
      onClose()
      return
    }

    const parsed = Math.round(Number(amount) || 0)
    if (parsed <= 0) {
      toast.error('Vui lòng nhập số tiền thu (> 0đ)')
      return
    }

    addPaymentTransaction({
      student_id: student.id,
      amount: parsed,
      paid_at: paidAt,
      method,
      note: note.trim() || null,
    })
    toast.success(`Đã ghi nhận thu ${formatMoney(parsed)} của ${student.name}!`)
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editTransaction) {
      setShowConfirmEdit(true)
    } else {
      executeSave()
    }
  }

  if (!student) return null

  const allocatedSum = selectedSiblingIds.reduce(
    (s, id) => s + Math.round(siblingAllocations[id] || 0),
    0
  )
  const totalInputNum = Math.round(Number(amount) || 0)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          editTransaction
            ? 'Sửa giao dịch thu học phí'
            : `Ghi nhận khoản thu · ${student.name}`
        }
        size="md"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Student Current Debt Status Banner */}
          {profile && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Học sinh: <strong className="text-slate-900 dark:text-white">{student.name}</strong> ({profile.cls?.name})
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Tổng phải thu: <strong>{formatMoney(profile.total_due)}</strong> · Đã thu:{' '}
                  <strong className="text-emerald-600">{formatMoney(profile.total_paid)}</strong>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-semibold uppercase text-slate-400">
                  {profile.debt_amount > 0
                    ? 'Đang còn thiếu'
                    : profile.credit_amount > 0
                    ? 'Đang đóng dư'
                    : 'Trạng thái'}
                </div>
                <div
                  className={cn(
                    'text-base font-extrabold',
                    profile.debt_amount > 0
                      ? 'text-red-600 dark:text-red-400'
                      : profile.credit_amount > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {profile.debt_amount > 0
                    ? formatMoney(profile.debt_amount)
                    : profile.credit_amount > 0
                    ? `+${formatMoney(profile.credit_amount)}`
                    : 'Đủ (0đ)'}
                </div>
              </div>
            </div>
          )}

          {/* Multi-student sibling toggle (only when creating new transaction) */}
          {!editTransaction && (
            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-200/60 dark:border-blue-900/50">
              <label className="flex items-center justify-between gap-2 cursor-pointer text-xs font-semibold text-blue-900 dark:text-blue-200">
                <span className="flex items-center gap-1.5">
                  <Users size={15} className="text-blue-600" />
                  Thu gộp một lần cho nhiều học sinh cùng phụ huynh (anh/chị/em)
                </span>
                <input
                  type="checkbox"
                  checked={isMultiStudent}
                  onChange={(e) => handleToggleMultiStudent(e.target.checked)}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              {isMultiStudent && (
                <div className="mt-3 pt-3 border-t border-blue-200/60 dark:border-blue-900/50 flex flex-col gap-2.5">
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Mặc định hệ thống chia theo số tiền đang nợ của từng em, thầy/cô có thể sửa tay từng ô:
                  </div>

                  {selectedSiblingIds.map((sibId) => {
                    const sibProfile = profilesMap.get(sibId)
                    if (!sibProfile) return null
                    return (
                      <div
                        key={sibId}
                        className="flex items-center justify-between gap-2 bg-white dark:bg-slate-850 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                            {sibProfile.student.name}{' '}
                            <span className="font-normal text-slate-400">
                              ({sibProfile.cls?.name})
                            </span>
                          </div>
                          <div className="text-[11px] text-red-500">
                            Đang nợ: {formatMoney(sibProfile.debt_amount)}
                          </div>
                        </div>
                        <input
                          type="number"
                          className="input py-1 px-2 text-xs w-32 text-right font-bold"
                          value={siblingAllocations[sibId] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, Math.round(Number(e.target.value) || 0))
                            const next = { ...siblingAllocations, [sibId]: val }
                            setSiblingAllocations(next)
                            const sum = Object.values(next).reduce((s, v) => s + v, 0)
                            setAmount(String(sum))
                          }}
                        />
                      </div>
                    )
                  })}

                  {/* Add another student to this group payment */}
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      className="input py-1 text-xs flex-1"
                      value={extraCandidateId}
                      onChange={(e) => setExtraCandidateId(e.target.value)}
                    >
                      <option value="">+ Chọn thêm anh/chị/em khác để gộp thu...</option>
                      {students
                        .filter((s) => !selectedSiblingIds.includes(s.id))
                        .map((s) => {
                          const c = classes.find((cl) => cl.id === s.class_id)
                          return (
                            <option key={s.id} value={s.id}>
                              {s.name} ({c?.name})
                            </option>
                          )
                        })}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddSiblingCandidate}
                      disabled={!extraCandidateId}
                      className="btn-secondary py-1 px-2.5 text-xs shrink-0"
                    >
                      Thêm em này
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amount Input + Quick Suggestion Button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">
                {isMultiStudent ? 'Tổng số tiền phụ huynh đưa (VNĐ) *' : 'Số tiền thu (VNĐ) *'}
              </label>
              {!isMultiStudent && suggestedDebt > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(suggestedDebt))}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles size={12} /> Đóng đủ số còn thiếu ({formatMoney(suggestedDebt)})
                </button>
              )}
            </div>
            <input
              type="number"
              min={0}
              step={1000}
              className="input text-base font-extrabold text-emerald-700 dark:text-emerald-400"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                if (isMultiStudent && selectedSiblingIds.length > 1) {
                  distributeTotalAcrossSiblings(
                    Number(e.target.value) || 0,
                    selectedSiblingIds
                  )
                }
              }}
              placeholder="Vd: 600000"
              autoFocus
            />
            {isMultiStudent && selectedSiblingIds.length > 1 && allocatedSum !== totalInputNum && (
              <p className="text-[11px] text-amber-600 mt-1">
                Tổng các phần chia ({formatMoney(allocatedSum)}) đang lệch so với tổng tiền nhập ({formatMoney(totalInputNum)}).
              </p>
            )}
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Ngày thu</label>
              <input
                type="date"
                className="input text-sm"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Hình thức thanh toán</label>
              <select
                className="input text-sm font-semibold"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                <option value="transfer">🏦 Chuyển khoản ngân hàng</option>
                <option value="cash">💵 Tiền mặt</option>
                <option value="other">💳 Khác (Ví điện tử...)</option>
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="label">Ghi chú khoản thu</label>
            <input
              type="text"
              className="input text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Vd: PH chuyển khoản VCB, đóng học phí tháng 11..."
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Hủy
            </button>
            <button type="submit" className="btn-primary flex-1 bg-emerald-600 hover:bg-emerald-700">
              <Wallet size={16} />
              {editTransaction ? 'Lưu chỉnh sửa' : 'Ghi nhận khoản thu'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={showConfirmEdit}
        onClose={() => setShowConfirmEdit(false)}
        onConfirm={executeSave}
        title="Xác nhận sửa khoản thu"
        message="Mọi thay đổi về số tiền, ngày thu hoặc hình thức thu sẽ tự động tính lại công nợ học sinh và được lưu vào Nhật ký thay đổi (change_log). Bạn có chắc chắn muốn lưu?"
        confirmLabel="Xác nhận lưu"
      />
    </>
  )
}

interface StudentFeeLedgerModalProps {
  open: boolean
  onClose: () => void
  studentId: string | null
  onOpenRecordPayment: (student: Student, editTx?: PaymentTransaction | null) => void
}

export function StudentFeeLedgerModal({
  open,
  onClose,
  studentId,
  onOpenRecordPayment,
}: StudentFeeLedgerModalProps) {
  const {
    classes,
    students,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    paymentTransactions,
    monthLocks,
    changeLogs,
    deletePaymentTransaction,
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<'ledger' | 'months' | 'changelog'>('ledger')
  const [deleteTxId, setDeleteTxId] = useState<string | null>(null)

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
    ]
  )

  const profile: StudentDebtProfile | undefined = studentId
    ? profilesMap.get(studentId)
    : undefined

  const studentLogs = useMemo(() => {
    if (!studentId) return []
    return changeLogs.filter(
      (log) =>
        log.entity === 'payment_transaction' &&
        (log.before?.student_id === studentId || log.after?.student_id === studentId)
    )
  }, [changeLogs, studentId])

  if (!profile) return null
  const { student, cls } = profile

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Sổ học phí & Hồ sơ công nợ · ${student.name}`}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          {/* Student Header Summary */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-extrabold text-slate-900 dark:text-white">
                  {student.name}
                </span>
                <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-xs">
                  {cls?.name || 'Lớp'}
                </span>
                {student.status === 'left' && (
                  <span className="badge bg-slate-200 text-slate-700 text-xs">Đã nghỉ</span>
                )}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                {student.parent_name && <span>Phụ huynh: <strong>{student.parent_name}</strong></span>}
                {student.parent_phone && (
                  <a
                    href={formatPhoneTel(student.parent_phone)}
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    <Phone size={12} /> {student.parent_phone}
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenRecordPayment(student, null)}
                className="btn-primary py-2 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus size={15} /> Ghi nhận khoản thu
              </button>
            </div>
          </div>

          {/* 3 Balance Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-center">
              <div className="text-[11px] text-slate-500 font-medium">Tổng phải thu</div>
              <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                {formatMoney(profile.total_due)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-center">
              <div className="text-[11px] text-slate-500 font-medium">Tổng đã thu</div>
              <div className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatMoney(profile.total_paid)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-center">
              <div className="text-[11px] text-slate-500 font-medium">Số dư tích lũy</div>
              <div
                className={cn(
                  'text-sm sm:text-base font-extrabold mt-0.5',
                  profile.balance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : profile.balance > 0
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {profile.balance < 0
                  ? `Nợ ${formatMoney(Math.abs(profile.balance))}`
                  : profile.balance > 0
                  ? `Dư +${formatMoney(profile.balance)}`
                  : 'Đủ (0đ)'}
              </div>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                activeTab === 'ledger'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              Sổ học phí theo thời gian ({profile.ledgerEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('months')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                activeTab === 'months'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              Phân bổ theo tháng (FIFO)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('changelog')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1',
                activeTab === 'changelog'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <History size={13} /> Nhật ký sửa/xóa ({studentLogs.length})
            </button>
          </div>

          {/* TAB 1: CHRONOLOGICAL LEDGER ("Sổ học phí") */}
          {activeTab === 'ledger' && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl max-h-[380px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2.5">Ngày / Kỳ</th>
                    <th className="px-3 py-2.5">Diễn giải</th>
                    <th className="px-3 py-2.5 text-right">Phải thu</th>
                    <th className="px-3 py-2.5 text-right">Đã đóng</th>
                    <th className="px-3 py-2.5 text-right">Số dư sau dòng</th>
                    <th className="px-3 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {profile.ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        Chưa có phát sinh học phí hoặc khoản thu nào.
                      </td>
                    </tr>
                  ) : (
                    profile.ledgerEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={cn(
                          'transition-colors',
                          entry.type === 'payment'
                            ? 'bg-emerald-50/30 dark:bg-emerald-950/15'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                        )}
                      >
                        <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {entry.type === 'charge'
                            ? `Tháng ${entry.month.split('-')[1]}/${entry.month.split('-')[0]}`
                            : formatDate(entry.date)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {entry.title}
                            {entry.is_locked && (
                              <span title="Tháng đã chốt">
                                <Lock size={12} className="text-amber-600" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{entry.subtitle}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {entry.debit > 0 ? formatMoney(entry.debit) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {entry.credit > 0 ? `+${formatMoney(entry.credit)}` : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-right font-extrabold whitespace-nowrap',
                            entry.balance_after < 0
                              ? 'text-red-600 dark:text-red-400'
                              : entry.balance_after > 0
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {entry.balance_after < 0
                            ? `-${formatMoney(Math.abs(entry.balance_after))}`
                            : entry.balance_after > 0
                            ? `+${formatMoney(entry.balance_after)}`
                            : '0đ'}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {entry.transaction && (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenRecordPayment(student, entry.transaction)}
                                className="btn-icon p-1 text-slate-400 hover:text-blue-600"
                                title="Sửa khoản thu"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTxId(entry.transaction!.id)}
                                className="btn-icon p-1 text-slate-400 hover:text-red-600"
                                title="Xóa khoản thu"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: MONTHLY FIFO BREAKDOWN */}
          {activeTab === 'months' && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl max-h-[380px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2.5">Tháng</th>
                    <th className="px-3 py-2.5 text-center">Số buổi có mặt</th>
                    <th className="px-3 py-2.5 text-right">Phải thu</th>
                    <th className="px-3 py-2.5 text-right">Đã phân bổ (FIFO)</th>
                    <th className="px-3 py-2.5 text-right">Còn thiếu</th>
                    <th className="px-3 py-2.5 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {profile.orderedMonths.map((m) => (
                    <tr key={m.month} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">
                        {formatMonth(m.month)}{' '}
                        {m.is_locked && (
                          <span className="text-[10px] text-amber-600 font-semibold">(Đã chốt)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold">
                        {m.present_count} buổi
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {formatMoney(m.due_amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(m.allocated_paid)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-600 dark:text-red-400">
                        {m.shortage > 0 ? formatMoney(m.shortage) : '0đ'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={cn(
                            'badge text-[11px] font-bold',
                            m.status === 'Đủ'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : m.status === 'Đóng dư'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : m.status === 'Còn thiếu'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          )}
                        >
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: CHANGE LOG */}
          {activeTab === 'changelog' && (
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
              {studentLogs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  Chưa có lịch sử thêm/sửa/xóa khoản thu của học sinh này.
                </p>
              ) : (
                studentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 text-xs flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">
                        {log.action === 'create'
                          ? '➕ Ghi nhận khoản thu mới'
                          : log.action === 'update'
                          ? '✏️ Sửa khoản thu'
                          : '🗑️ Xóa khoản thu'}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {log.before && (
                          <span>
                            Trước: <strong>{formatMoney(log.before.amount)}</strong> ({log.before.paid_at}) ·{' '}
                          </span>
                        )}
                        {log.after && (
                          <span>
                            Sau: <strong className="text-emerald-600">{formatMoney(log.after.amount)}</strong> ({log.after.paid_at})
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                      {format(new Date(log.created_at), 'HH:mm dd/MM/yyyy')}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTxId}
        onClose={() => setDeleteTxId(null)}
        onConfirm={() => {
          if (deleteTxId) {
            deletePaymentTransaction(deleteTxId)
            toast.success('Đã xóa khoản thu và ghi lại vào nhật ký thay đổi!')
          }
          setDeleteTxId(null)
        }}
        title="Xóa khoản thu học phí?"
        message="Bạn có chắc chắn muốn xóa giao dịch thu này? Công nợ của học sinh sẽ tự động tính lại và thao tác xóa sẽ được lưu vào nhật ký thay đổi (change_log)."
        confirmLabel="Xóa khoản thu"
      />
    </>
  )
}
