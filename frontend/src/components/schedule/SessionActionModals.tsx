import { useState, useMemo } from 'react'
import { Calendar, Clock, AlertTriangle, MessageSquare, Copy, Check, ArrowRight, RotateCcw } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { checkScheduleConflict } from '../../lib/conflictDetector'
import { useAppStore } from '../../store/useAppStore'
import { formatFullDate, formatDate } from '../../lib/dateUtils'
import { cn } from '../../lib/utils'
import type { CalendarSession } from '../../types'
import toast from 'react-hot-toast'

// 1. Move Session Modal
export function MoveSessionModal({
  open,
  onClose,
  session,
}: {
  open: boolean
  onClose: () => void
  session: CalendarSession | null
}) {
  const { 
    classes, 
    schoolSchedule, 
    scheduleRules, 
    sessionExceptions, 
    extraSessions, 
    addSessionException 
  } = useAppStore()

  const [newDate, setNewDate] = useState(() => session?.date || '')
  const [newStart, setNewStart] = useState(() => session?.start_time || '18:00')
  const [newEnd, setNewEnd] = useState(() => session?.end_time || '20:00')
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState(false)

  // Live conflict check
  const conflict = useMemo(() => {
    if (!newDate || !newStart || !newEnd || !session) return null
    return checkScheduleConflict({
      date: newDate,
      start_time: newStart,
      end_time: newEnd,
      class_id: session.class_id,
      location: session.location,
      schoolSchedule,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      classes,
    })
  }, [newDate, newStart, newEnd, session, schoolSchedule, scheduleRules, sessionExceptions, extraSessions, classes])

  if (!session) return null

  const parentMessage = `Kính gửi quý phụ huynh lớp ${session.class_name},
Buổi học ngày ${formatDate(session.date)} (${session.start_time}–${session.end_time}) xin phép được dời sang:
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
    if (!session.rule_id) {
      toast.error('Không tìm thấy thông tin lịch của buổi này')
      return
    }

    addSessionException({
      rule_id: session.rule_id,
      original_date: session.date,
      action: 'moved',
      new_date: newDate,
      new_start: newStart,
      new_end: newEnd,
      reason: reason || null,
      needs_makeup: false,
    })

    toast.success(`Đã dời buổi học sang ngày ${formatDate(newDate)}!`)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Dời lịch: ${session.class_name}`} size="md">
      <div className="flex flex-col gap-4">
        <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          Buổi gốc: <strong>{formatFullDate(session.date)}</strong> ({session.start_time}–{session.end_time})
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
              className="input"
              value={newStart}
              onChange={e => setNewStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Giờ kết thúc *</label>
            <input
              type="time"
              className="input"
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
        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
              <MessageSquare size={13} />
              Soạn sẵn tin gửi phụ huynh:
            </span>
            <button
              onClick={handleCopy}
              className="btn-ghost text-xs text-blue-600 dark:text-blue-400 py-0.5 px-2 flex items-center gap-1"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Đã chép' : 'Sao chép'}
            </button>
          </div>
          <p className="text-xs text-gray-500 whitespace-pre-line font-mono bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
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
            <ArrowRight size={16} /> Xác nhận dời
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
          Buổi học: <strong>{formatFullDate(session.date)}</strong> ({session.start_time}–{session.end_time})
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
        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
              <MessageSquare size={13} />
              Soạn sẵn tin gửi phụ huynh:
            </span>
            <button
              onClick={handleCopy}
              className="btn-ghost text-xs text-blue-600 dark:text-blue-400 py-0.5 px-2 flex items-center gap-1"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Đã chép' : 'Sao chép'}
            </button>
          </div>
          <p className="text-xs text-gray-500 whitespace-pre-line font-mono bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
            {parentMessage}
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Đóng
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-danger flex-1"
          >
            Xác nhận hủy buổi
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 3. Add Extra Session Modal
export function AddExtraSessionModal({
  open,
  onClose,
  initialDate,
  makeupForId,
}: {
  open: boolean
  onClose: () => void
  initialDate?: string
  makeupForId?: string | null
}) {
  const { 
    classes, 
    schoolSchedule, 
    scheduleRules, 
    sessionExceptions, 
    extraSessions, 
    addExtraSession 
  } = useAppStore()

  // Find exception if makeup
  const makeupEx = sessionExceptions.find(e => e.id === makeupForId)
  const makeupRule = scheduleRules.find(r => r.id === makeupEx?.rule_id)

  const [classId, setClassId] = useState(() => makeupRule?.class_id || classes[0]?.id || '')
  const [date, setDate] = useState(() => initialDate || new Date().toISOString().substring(0, 10))
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('20:00')
  const [note, setNote] = useState(() => makeupEx ? `Dạy bù cho buổi ngày ${formatDate(makeupEx.original_date)}` : '')

  const selectedClass = classes.find(c => c.id === classId)

  // Live conflict check
  const conflict = useMemo(() => {
    if (!date || !startTime || !endTime) return null
    return checkScheduleConflict({
      date,
      start_time: startTime,
      end_time: endTime,
      class_id: classId,
      location: selectedClass?.location,
      schoolSchedule,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      classes,
    })
  }, [date, startTime, endTime, classId, selectedClass, schoolSchedule, scheduleRules, sessionExceptions, extraSessions, classes])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!classId) {
      toast.error('Vui lòng chọn lớp')
      return
    }

    addExtraSession({
      class_id: classId,
      date,
      start_time: startTime,
      end_time: endTime,
      note: note.trim() || null,
      makeup_for: makeupForId || null,
    })

    toast.success(makeupForId ? 'Đã xếp lịch dạy bù thành công!' : 'Đã thêm buổi phát sinh mới!')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={makeupForId ? 'Xếp lịch dạy bù' : 'Thêm buổi phát sinh'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {makeupEx && (
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
              <option key={c.id} value={c.id}>{c.name} {c.location ? `(${c.location})` : ''}</option>
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
              className="input"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Giờ kết thúc *</label>
            <input
              type="time"
              className="input"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Ghi chú</label>
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
            {makeupForId ? 'Xếp lịch bù' : 'Thêm buổi'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

