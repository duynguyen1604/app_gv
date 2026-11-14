import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle, MessageSquare, Copy, Check, ArrowRight } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { checkScheduleConflict } from '../../lib/conflictDetector'
import { useAppStore } from '../../store/useAppStore'
import { formatFullDate, formatDate, formatMoney } from '../../lib/dateUtils'
import type { CalendarSession, ExtraSession } from '../../types'
import toast from 'react-hot-toast'

// 1. Move Session Modal (Supports both button click & Drag-and-Drop confirmation "Chỉ tuần này")
export function MoveSessionModal({
  open,
  onClose,
  session,
  prefillDate,
  prefillStart,
  prefillEnd,
}: {
  open: boolean
  onClose: () => void
  session: CalendarSession | null
  prefillDate?: string
  prefillStart?: string
  prefillEnd?: string
}) {
  const {
    classes,
    schoolSchedule,
    schoolPeriods,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    addSessionException,
    updateExtraSession,
  } = useAppStore()

  const [newDate, setNewDate] = useState(() => prefillDate || session?.date || '')
  const [newStart, setNewStart] = useState(() => prefillStart || session?.start_time || '18:00')
  const [newEnd, setNewEnd] = useState(() => prefillEnd || session?.end_time || '20:00')
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && session) {
      setNewDate(prefillDate || session.date)
      setNewStart(prefillStart || session.start_time)
      setNewEnd(prefillEnd || session.end_time)
      setReason(session.reason || '')
    }
  }, [open, session, prefillDate, prefillStart, prefillEnd])

  // Live conflict check
  const conflict = useMemo(() => {
    if (!newDate || !newStart || !newEnd || !session) return null
    const excludeId = session.id.startsWith('extra-')
      ? session.id.replace('extra-', '')
      : session.exception_id || session.rule_id
    return checkScheduleConflict({
      date: newDate,
      start_time: newStart,
      end_time: newEnd,
      class_id: session.class_id,
      location: session.location,
      exclude_id: excludeId,
      schoolSchedule,
      schoolPeriods,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      classes,
    })
  }, [
    newDate,
    newStart,
    newEnd,
    session,
    schoolSchedule,
    schoolPeriods,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    classes,
  ])

  if (!session) return null

  const parentMessage = `Kính gửi quý phụ huynh lớp ${session.class_name},
Buổi học ngày ${formatDate(session.date)} (${session.start_time}–${session.end_time}) xin phép được dời sang (chỉ áp dụng tuần này):
📅 ${formatFullDate(newDate || session.date)}
⏰ ${newStart} – ${newEnd}
${reason ? `Lý do: ${reason}\n` : ''}Mong quý phụ huynh và các em học sinh lưu ý. Trân trọng!`

  const handleCopy = () => {
    navigator.clipboard.writeText(parentMessage)
    setCopied(true)
    toast.success('Đã sao chép tin nhắn Zalo gửi phụ huynh!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleConfirm = () => {
    if (session.id.startsWith('extra-')) {
      const extraId = session.id.replace('extra-', '')
      updateExtraSession(extraId, {
        date: newDate,
        start_time: newStart,
        end_time: newEnd,
        note: reason || session.note || null,
      })
      toast.success(`Đã dời buổi phát sinh sang ngày ${formatDate(newDate)}!`)
      onClose()
      return
    }

    if (!session.rule_id) {
      toast.error('Không tìm thấy thông tin lịch của buổi này')
      return
    }

    const origDate = session.moved_from_date || session.date

    addSessionException({
      rule_id: session.rule_id,
      original_date: origDate,
      action: 'moved',
      new_date: newDate,
      new_start: newStart,
      new_end: newEnd,
      reason: reason || null,
      needs_makeup: false,
    })

    toast.success(`Đã dời buổi học sang ngày ${formatDate(newDate)} (Chỉ tuần này)!`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Dời lịch (Chỉ tuần này): ${session.class_name}`}
      subtitle="Tuần sau lịch học cố định vẫn giữ nguyên như cũ"
      size="md"
    >
      <div className="flex flex-col gap-4">
        <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          Buổi gốc: <strong>{formatFullDate(session.moved_from_date || session.date)}</strong> (
          {session.start_time}–{session.end_time})
        </div>

        <div>
          <label className="label">Dời sang ngày mới *</label>
          <input
            type="date"
            className="input"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Giờ bắt đầu *</label>
            <input
              type="time"
              className="input font-mono"
              value={newStart}
              onChange={e => setNewStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Giờ kết thúc *</label>
            <input
              type="time"
              className="input font-mono"
              value={newEnd}
              onChange={e => setNewEnd(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Lý do dời</label>
          <input
            className="input"
            placeholder="Vd: Cô bận họp đột xuất, gia đình có việc..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        {/* Conflict Warning in RED */}
        {conflict?.hasConflict && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl flex items-start gap-2 text-xs text-red-600 dark:text-red-400 font-semibold">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p>CẢNH BÁO TRÙNG LỊCH:</p>
              <p className="font-normal mt-0.5">{conflict.message}</p>
            </div>
          </div>
        )}

        {/* Travel Buffer Warning */}
        {conflict?.severity === 'warning' && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Lưu ý thời gian di chuyển:</p>
              <p className="mt-0.5">{conflict.message}</p>
            </div>
          </div>
        )}

        {/* Pre-composed message for parents */}
        <div className="p-3 bg-gray-50 dark:bg-[#282A2E]/80 rounded-xl border border-gray-100 dark:border-[#37393F]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
              <MessageSquare size={13} />
              Soạn sẵn tin gửi phụ huynh:
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="btn-ghost text-xs text-[#1A73E8] dark:text-[#8AB4F8] py-0.5 px-2 flex items-center gap-1"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Đã chép' : 'Sao chép'}
            </button>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line font-mono bg-white dark:bg-[#1E1F22] p-2.5 rounded-lg border border-gray-200 dark:border-[#37393F]">
            {parentMessage}
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5"
          >
            <ArrowRight size={16} /> Chỉ tuần này
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 2. Cancel Session Modal
export function CancelSessionModal({
  open,
  onClose,
  session,
}: {
  open: boolean
  onClose: () => void
  session: CalendarSession | null
}) {
  const { addSessionException } = useAppStore()

  const [reason, setReason] = useState('')
  const [needsMakeup, setNeedsMakeup] = useState(true)
  const [copied, setCopied] = useState(false)

  if (!session) return null

  const parentMessage = `Kính gửi quý phụ huynh lớp ${session.class_name},
Buổi học ngày ${formatDate(session.date)} (${session.start_time}–${session.end_time}) xin phép được TẠM NGHỈ.
${reason ? `Lý do: ${reason}\n` : ''}${needsMakeup ? 'Giáo viên sẽ sắp xếp lịch học bù sau.' : 'Buổi này không tính học phí.'}
Kính mong quý phụ huynh thông cảm. Trân trọng!`

  const handleCopy = () => {
    navigator.clipboard.writeText(parentMessage)
    setCopied(true)
    toast.success('Đã sao chép tin nhắn Zalo gửi phụ huynh!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleConfirm = () => {
    if (!session.rule_id) {
      toast.error('Không tìm thấy thông tin lịch')
      return
    }

    addSessionException({
      rule_id: session.rule_id,
      original_date: session.date,
      action: 'cancelled',
      new_date: null,
      new_start: null,
      new_end: null,
      reason: reason || null,
      needs_makeup: needsMakeup,
    })

    toast.success('Đã hủy buổi học. ' + (needsMakeup ? 'Đã thêm vào danh sách cần dạy bù.' : ''))
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Hủy buổi: ${session.class_name}`} size="md">
      <div className="flex flex-col gap-4">
        <div className="p-2.5 bg-red-50 dark:bg-red-950/30 rounded-xl text-xs text-red-700 dark:text-red-300">
          Buổi học: <strong>{formatFullDate(session.date)}</strong> ({session.start_time}–
          {session.end_time})
        </div>

        <div>
          <label className="label">Lý do hủy buổi *</label>
          <input
            className="input"
            placeholder="Vd: Giáo viên bận, thời tiết mưa bão, học sinh xin nghỉ..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            checked={needsMakeup}
            onChange={e => setNeedsMakeup(e.target.checked)}
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Đánh dấu cần dạy bù cho buổi này
          </span>
        </label>

        {/* Pre-composed message for parents */}
        <div className="p-3 bg-gray-50 dark:bg-[#282A2E]/80 rounded-xl border border-gray-100 dark:border-[#37393F]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
              <MessageSquare size={13} />
              Soạn sẵn tin gửi phụ huynh:
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="btn-ghost text-xs text-[#1A73E8] dark:text-[#8AB4F8] py-0.5 px-2 flex items-center gap-1"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Đã chép' : 'Sao chép'}
            </button>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line font-mono bg-white dark:bg-[#1E1F22] p-2.5 rounded-lg border border-gray-200 dark:border-[#37393F]">
            {parentMessage}
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Đóng
          </button>
          <button type="button" onClick={handleConfirm} className="btn-danger flex-1">
            Xác nhận hủy buổi
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 3. Add / Edit Extra Session Modal (Full details)
export function AddExtraSessionModal({
  open,
  onClose,
  initialDate,
  initialStart,
  initialEnd,
  makeupForId,
  presetClassId,
  editSession,
}: {
  open: boolean
  onClose: () => void
  initialDate?: string
  initialStart?: string
  initialEnd?: string
  makeupForId?: string | null
  presetClassId?: string
  editSession?: ExtraSession | null
}) {
  const {
    classes,
    schoolSchedule,
    schoolPeriods,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    addExtraSession,
    updateExtraSession,
  } = useAppStore()

  const makeupEx = sessionExceptions.find(e => e.id === makeupForId)
  const makeupRule = scheduleRules.find(r => r.id === makeupEx?.rule_id)

  const [classId, setClassId] = useState(
    () => editSession?.class_id || presetClassId || makeupRule?.class_id || classes[0]?.id || ''
  )
  const [date, setDate] = useState(
    () => editSession?.date || initialDate || new Date().toISOString().substring(0, 10)
  )
  const [startTime, setStartTime] = useState(() => editSession?.start_time || initialStart || '18:00')
  const [endTime, setEndTime] = useState(() => editSession?.end_time || initialEnd || '19:30')
  const [customPrice, setCustomPrice] = useState(() =>
    editSession?.custom_price != null ? String(editSession.custom_price) : ''
  )
  const [note, setNote] = useState(() =>
    editSession
      ? editSession.note || ''
      : makeupEx
      ? `Dạy bù cho buổi ngày ${formatDate(makeupEx.original_date)}`
      : ''
  )

  useEffect(() => {
    if (open) {
      if (editSession) {
        setClassId(editSession.class_id)
        setDate(editSession.date)
        setStartTime(editSession.start_time)
        setEndTime(editSession.end_time)
        setCustomPrice(editSession.custom_price != null ? String(editSession.custom_price) : '')
        setNote(editSession.note || '')
      } else {
        if (presetClassId) setClassId(presetClassId)
        else if (makeupRule?.class_id) setClassId(makeupRule.class_id)
        else if (!classId && classes[0]?.id) setClassId(classes[0].id)
        setDate(initialDate || new Date().toISOString().substring(0, 10))
        setStartTime(initialStart || '18:00')
        setEndTime(initialEnd || '19:30')
        setCustomPrice('')
        setNote(makeupEx ? `Dạy bù cho buổi ngày ${formatDate(makeupEx.original_date)}` : '')
      }
    }
  }, [
    open,
    editSession,
    presetClassId,
    initialDate,
    initialStart,
    initialEnd,
    makeupForId,
    makeupRule,
    makeupEx,
    classes,
  ])

  const selectedClass = classes.find(c => c.id === classId)

  const conflict = useMemo(() => {
    if (!date || !startTime || !endTime) return null
    return checkScheduleConflict({
      date,
      start_time: startTime,
      end_time: endTime,
      class_id: classId,
      location: selectedClass?.location,
      excludeExtraId: editSession ? editSession.id : undefined,
      schoolSchedule,
      schoolPeriods,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      classes,
    })
  }, [
    date,
    startTime,
    endTime,
    classId,
    selectedClass,
    editSession,
    schoolSchedule,
    schoolPeriods,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    classes,
  ])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!classId) {
      toast.error('Vui lòng chọn lớp')
      return
    }
    if (!date || !startTime || !endTime) {
      toast.error('Vui lòng nhập đầy đủ ngày và giờ học')
      return
    }
    if (startTime >= endTime) {
      toast.error('Giờ kết thúc phải sau giờ bắt đầu')
      return
    }

    const parsedCustomPrice =
      customPrice.trim() === '' ? null : Math.max(0, Math.round(Number(customPrice)))

    if (editSession) {
      updateExtraSession(editSession.id, {
        class_id: classId,
        date,
        start_time: startTime,
        end_time: endTime,
        custom_price: parsedCustomPrice,
        note: note.trim() || null,
      })
      toast.success('Đã cập nhật buổi học phát sinh!')
    } else {
      addExtraSession({
        class_id: classId,
        date,
        start_time: startTime,
        end_time: endTime,
        custom_price: parsedCustomPrice,
        note: note.trim() || null,
        makeup_for: makeupForId || null,
      })
      toast.success(makeupForId ? 'Đã xếp lịch dạy bù thành công!' : 'Đã thêm buổi học phát sinh mới!')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editSession
          ? 'Sửa lịch học phát sinh'
          : makeupForId
          ? 'Xếp lịch dạy bù'
          : 'Thêm lịch học phát sinh'
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {makeupEx && !editSession && (
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-300">
            Dạy bù cho buổi hủy ngày <strong>{formatDate(makeupEx.original_date)}</strong>
            {makeupEx.reason && ` (${makeupEx.reason})`}
          </div>
        )}

        <div>
          <label className="label">Lớp dạy thêm *</label>
          <select
            className="input"
            value={classId}
            onChange={e => setClassId(e.target.value)}
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.location ? `(${c.location})` : ''} — {formatMoney(c.price)}/buổi
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Ngày học *</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Giờ bắt đầu *</label>
            <input
              type="time"
              className="input font-mono"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Giờ kết thúc *</label>
            <input
              type="time"
              className="input font-mono"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Học phí buổi này (VNĐ, không bắt buộc)</label>
          <input
            type="number"
            min={0}
            step={1000}
            className="input"
            placeholder={
              selectedClass
                ? `Để trống = giữ giá mặc định của lớp (${formatMoney(selectedClass.price)})`
                : 'Để trống = giữ nguyên giá mặc định của lớp'
            }
            value={customPrice}
            onChange={e => setCustomPrice(e.target.value)}
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {customPrice.trim() !== ''
              ? `Buổi phát sinh này sẽ tính ${formatMoney(Math.max(0, Math.round(Number(customPrice) || 0)))}/buổi thay cho giá mặc định.`
              : `Đang để trống: giữ nguyên giá mặc định của lớp (${selectedClass ? formatMoney(selectedClass.price) : '0đ'}/buổi).`}
          </p>
        </div>

        <div>
          <label className="label">Ghi chú (không bắt buộc)</label>
          <input
            className="input"
            placeholder="Vd: Ôn thi giữa kỳ, phụ đạo học sinh..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {/* Conflict Warning */}
        {conflict?.hasConflict && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl flex items-start gap-2 text-xs text-red-600 dark:text-red-400 font-semibold">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p>CẢNH BÁO TRÙNG LỊCH:</p>
              <p className="font-normal mt-0.5">{conflict.message}</p>
            </div>
          </div>
        )}

        {/* Travel Warning */}
        {conflict?.severity === 'warning' && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Lưu ý thời gian di chuyển:</p>
              <p className="mt-0.5">{conflict.message}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Hủy
          </button>
          <button type="submit" className="btn-primary flex-1">
            {editSession ? 'Lưu thay đổi' : makeupForId ? 'Xếp lịch bù' : 'Thêm buổi phát sinh'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
