import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  X,
  Clock,
  MapPin,
  Users,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Trash2,
  RotateCcw,
  Maximize2,
  Download,
  Calendar,
  Keyboard,
  SlidersHorizontal,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useAppStore } from '../../store/useAppStore'
import { checkScheduleConflict } from '../../lib/conflictDetector'
import {
  formatFullDate,
  formatDate,
  formatDateShort,
  VI_WEEKDAYS_FULL,
  dateToWeekday,
  dateToStr,
  formatWeekHeader,
} from '../../lib/dateUtils'
import { timeGroupLabel } from '../../lib/schoolPeriods'
import { cn } from '../../lib/utils'
import type { CalendarSession } from '../../types'
import toast from 'react-hot-toast'

// 1. Google Calendar-style Quick Add Dialog / Popover
export function QuickAddModal({
  open,
  onClose,
  initialDate,
  initialStart,
  initialEnd,
  onOpenDetailed,
}: {
  open: boolean
  onClose: () => void
  initialDate: string
  initialStart: string
  initialEnd: string
  onOpenDetailed: (date: string, start: string, end: string) => void
}) {
  const {
    classes,
    schoolSchedule,
    schoolPeriods,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    addExtraSession,
  } = useAppStore()

  const [classId, setClassId] = useState(() => classes[0]?.id || '')
  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(initialEnd)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setDate(initialDate)
      setStartTime(initialStart)
      setEndTime(initialEnd)
      setNote('')
      if (!classId && classes[0]?.id) setClassId(classes[0].id)
    }
  }, [open, initialDate, initialStart, initialEnd, classes])

  const selectedClass = classes.find(c => c.id === classId)

  const conflict = useMemo(() => {
    if (!date || !startTime || !endTime) return null
    return checkScheduleConflict({
      date,
      start_time: startTime,
      end_time: endTime,
      class_id: classId,
      location: selectedClass?.location,
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
    schoolSchedule,
    schoolPeriods,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    classes,
  ])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!classId) {
      toast.error('Vui lòng chọn lớp dạy thêm')
      return
    }
    addExtraSession({
      class_id: classId,
      date,
      start_time: startTime,
      end_time: endTime,
      note: note.trim() || null,
      makeup_for: null,
    })
    toast.success(`Đã tạo nhanh buổi phát sinh (${startTime}–${endTime})`)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm nhanh buổi phát sinh" size="sm">
      <form onSubmit={handleSave} className="flex flex-col gap-3.5">
        <div>
          <label className="label">Chọn lớp dạy thêm *</label>
          <select
            className="input font-semibold"
            value={classId}
            onChange={e => setClassId(e.target.value)}
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.location ? `(${c.location})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 tablet:col-span-1">
            <label className="label">Ngày</label>
            <input
              type="date"
              className="input text-xs px-2"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Bắt đầu</label>
            <input
              type="time"
              className="input text-xs px-2 font-mono"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Kết thúc</label>
            <input
              type="time"
              className="input text-xs px-2 font-mono"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Ghi chú nhanh</label>
          <input
            className="input"
            placeholder="Vd: Ôn tập chương 2, tăng cường..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {conflict?.hasConflict && (
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2 font-semibold">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{conflict.message}</span>
          </div>
        )}

        {conflict?.severity === 'warning' && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{conflict.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-[#2D2F34]">
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenDetailed(date, startTime, endTime)
            }}
            className="btn-ghost text-xs text-[#1A73E8] dark:text-[#8AB4F8]"
          >
            Thêm chi tiết...
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs py-1.5 px-3">
              Hủy
            </button>
            <button type="submit" className="btn-primary text-xs py-1.5 px-4">
              Lưu
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// 2. Session Detail Popover (Desktop) + Slide-over Drawer ("Mở đầy đủ") + Bottom Sheet (Mobile)
export function SessionDetailSheet({
  session,
  onClose,
  onAttend,
  onMove,
  onCancelSession,
  onRestoreException,
  onDeleteExtra,
  onSwitchToSchoolGrid,
  onAddGuestStudent,
}: {
  session: CalendarSession | null
  onClose: () => void
  onAttend: (classId: string) => void
  onMove: (session: CalendarSession) => void
  onCancelSession: (session: CalendarSession) => void
  onRestoreException: (exceptionId: string) => void
  onDeleteExtra: (extraId: string) => void
  onSwitchToSchoolGrid: () => void
  onAddGuestStudent?: (session: CalendarSession) => void
}) {
  const { sessionGuests, students, classes, deleteSessionGuest } = useAppStore()
  const [drawerMode, setDrawerMode] = useState(false)

  useEffect(() => {
    setDrawerMode(false)
  }, [session?.id])

  if (!session) return null

  const guestsForSession = session.class_id
    ? sessionGuests.filter(
        g =>
          g.host_class_id === session.class_id &&
          g.date === session.date &&
          g.start_time === session.start_time
      )
    : []

  const isSchool = session.type === 'school'
  const isDuty = session.type === 'duty'
  const isExtra = session.type === 'tutoring_extra'
  const isCancelled = !!session.is_cancelled

  const badgeLabel = isSchool
    ? `Lịch trường ${session.period_code ? '· Tiết ' + session.period_code : ''}`
    : isDuty
      ? `Ca Trực trường ${session.period_code ? '· Tiết ' + session.period_code : ''}`
      : isExtra
        ? session.makeup_for
          ? 'Buổi dạy bù'
          : session.is_moved
            ? 'Buổi đã dời đến'
            : 'Buổi phát sinh'
        : 'Lịch dạy thêm cố định'

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title={session.class_name}
      subtitle={badgeLabel}
      size="md"
      variant={drawerMode ? 'drawer' : 'dialog'}
    >
      <div className="flex flex-col gap-4">
        {/* Top Metadata Card */}
        <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-[#282A2E]/70 border border-gray-100 dark:border-[#37393F] flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-200">
              <Clock size={14} className="text-[#1A73E8]" />
              {formatFullDate(session.date)} · {session.start_time} – {session.end_time}
            </span>
            {session.session_group && (
              <span className="badge bg-blue-100/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold">
                Buổi {timeGroupLabel(session.session_group)}
              </span>
            )}
          </div>

          {session.spans_to_group && (
            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              ↪ Buổi học bắt đầu ở {timeGroupLabel(session.session_group || 'afternoon')} và kéo dài sang{' '}
              {timeGroupLabel(session.spans_to_group).toLowerCase()}
            </div>
          )}

          {session.subject && (
            <div className="text-gray-600 dark:text-gray-300">
              <strong>Môn / Nội dung:</strong> {session.subject}
            </div>
          )}

          {session.location && (
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <MapPin size={14} className="text-gray-400 shrink-0" />
              <span>{session.location}</span>
            </div>
          )}

          {session.student_count !== undefined && session.student_count > 0 && (
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <Users size={14} className="text-gray-400 shrink-0" />
              <span>Sĩ số đang học: {session.student_count} học sinh</span>
            </div>
          )}

          {session.reason && (
            <div className="text-amber-700 dark:text-amber-300 italic pt-1 border-t border-gray-200/60 dark:border-[#37393F]">
              Ghi chú: {session.reason}
            </div>
          )}

          {session.is_moved && session.moved_to_date && (
            <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-semibold pt-1">
              <ArrowRight size={14} />
              <span>
                Đã dời sang {formatDate(session.moved_to_date)} lúc {session.moved_to_start}
              </span>
            </div>
          )}
        </div>

        {/* Conflict Warning Banner */}
        {session.has_conflict && !isCancelled && session.conflict_details && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-600" />
            <div>
              <div className="font-bold">Cảnh báo trùng lịch:</div>
              <ul className="list-disc list-inside mt-0.5">
                {session.conflict_details.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Guest students list if any (Group D4) */}
        {guestsForSession.length > 0 && (
          <div className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-xs space-y-1.5">
            <div className="font-bold text-purple-900 dark:text-purple-200">
              Học sinh học ghép / học thêm ({guestsForSession.length}):
            </div>
            {guestsForSession.map(g => {
              const st = students.find(s => s.id === g.student_id)
              const homeCls = classes.find(c => c.id === g.home_class_id)
              return (
                <div
                  key={g.id}
                  className="flex items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-purple-100 dark:border-purple-800/50"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {st?.name || 'Học sinh'}
                    </span>{' '}
                    <span className="text-[11px] text-purple-700 dark:text-purple-300">
                      ({g.kind === 'swap' ? `Học ghép từ ${homeCls?.name || ''}` : 'Học thêm lẻ'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      deleteSessionGuest(g.id)
                      toast.success('Đã gỡ học sinh khỏi buổi học ghép')
                    }}
                    className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                    title="Gỡ học ghép"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {/* Primary Action: Go to Attendance */}
          {session.class_id && !isCancelled && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onAttend(session.class_id!)
              }}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} />
              Điểm danh buổi học này
            </button>
          )}

          {/* Group D4: Button "Thêm học sinh học ghép" */}
          {session.class_id && !isCancelled && onAddGuestStudent && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onAddGuestStudent(session)
              }}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-xs text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60 bg-purple-50/60 dark:bg-purple-950/30 hover:bg-purple-100/70"
            >
              <Users size={15} />
              + Thêm học sinh học ghép
            </button>
          )}

          {/* Move / Cancel for Active Fixed Tutoring */}
          {session.rule_id && !isCancelled && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onMove(session)}
                className="btn-secondary flex items-center justify-center gap-1.5 text-xs"
              >
                🔄 Dời buổi (tuần này)
              </button>
              <button
                type="button"
                onClick={() => onCancelSession(session)}
                className="btn-danger flex items-center justify-center gap-1.5 text-xs"
              >
                ❌ Hủy buổi này
              </button>
            </div>
          )}

          {/* Restore if cancelled or moved */}
          {session.exception_id && (
            <button
              type="button"
              onClick={() => {
                onRestoreException(session.exception_id!)
                onClose()
              }}
              className="btn-secondary w-full flex items-center justify-center gap-1.5 text-xs"
            >
              <RotateCcw size={14} />
              Khôi phục về lịch cố định ban đầu
            </button>
          )}

          {/* Delete Extra Session */}
          {session.id.startsWith('extra-') && (
            <button
              type="button"
              onClick={() => {
                const extraId = session.id.replace('extra-', '')
                onDeleteExtra(extraId)
                onClose()
              }}
              className="btn-danger w-full flex items-center justify-center gap-1.5 text-xs"
            >
              <Trash2 size={14} />
              Xóa buổi phát sinh này
            </button>
          )}

          {/* School / Duty Edit Shortcut */}
          {(isSchool || isDuty) && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onSwitchToSchoolGrid()
              }}
              className="btn-secondary w-full flex items-center justify-center gap-1.5 text-xs"
            >
              🏫 Sửa trong Bảng tiết của trường
            </button>
          )}

          {/* Desktop toggle between Dialog and Right Drawer ("Mở đầy đủ") */}
          {!drawerMode && (
            <button
              type="button"
              onClick={() => setDrawerMode(true)}
              className="hidden tablet:inline-flex btn-ghost w-full text-xs items-center justify-center gap-1.5 text-gray-500"
            >
              <Maximize2 size={13} />
              Mở đầy đủ bên phải (Side Panel)
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// 3. Export Week Image (.PNG) & Google Calendar (.ICS) Modal (Section 5.9)
export function ExportWeekModal({
  open,
  onClose,
  weekStart,
  weekDays,
  sessionsByDay,
}: {
  open: boolean
  onClose: () => void
  weekStart: Date
  weekDays: Date[]
  sessionsByDay: Record<string, CalendarSession[]>
}) {
  const { settings } = useAppStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const showDuty = settings.show_duty_in_gcal !== false

  // Render weekly schedule onto HTML5 Canvas whenever modal opens
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return

    const width = 1400
    const height = 860
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Background
    ctx.fillStyle = '#F8FAFC'
    ctx.fillRect(0, 0, width, height)

    // Header Banner
    ctx.fillStyle = '#1A73E8'
    ctx.fillRect(0, 0, width, 76)

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 24px "Be Vietnam Pro", Inter, sans-serif'
    ctx.fillText(`THỜI KHÓA BIỂU & LỊCH DẠY TUẦN (${formatWeekHeader(weekStart)})`, 32, 46)

    // Legend on header right
    const legends = [
      { label: 'Lịch trường', color: '#DBEAFE' },
      { label: 'Dạy thêm', color: '#FFEDD5' },
      { label: 'Phát sinh', color: '#EDE9FE' },
      { label: 'Trực', color: '#E2E8F0' },
    ]
    let lx = width - 480
    legends.forEach(leg => {
      ctx.fillStyle = leg.color
      ctx.fillRect(lx, 28, 16, 16)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '600 13px "Be Vietnam Pro", Inter, sans-serif'
      ctx.fillText(leg.label, lx + 22, 41)
      lx += 115
    })

    // 7 Day Columns
    const marginX = 24
    const topY = 96
    const colGap = 12
    const colW = (width - marginX * 2 - colGap * 6) / 7
    const colH = height - topY - 28

    weekDays.forEach((day, idx) => {
      const x = marginX + idx * (colW + colGap)
      const dStr = dateToStr(day)
      const wdName = VI_WEEKDAYS_FULL[dateToWeekday(day) - 1]
      const daySessions = (sessionsByDay[dStr] || []).filter(
        s => !s.is_cancelled && (showDuty || s.type !== 'duty')
      )

      // Card background
      ctx.fillStyle = '#FFFFFF'
      ctx.strokeStyle = '#E2E8F0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x, topY, colW, colH, 12)
      ctx.fill()
      ctx.stroke()

      // Day Header
      ctx.fillStyle = '#F1F5F9'
      ctx.beginPath()
      ctx.roundRect(x, topY, colW, 52, [12, 12, 0, 0])
      ctx.fill()

      ctx.fillStyle = '#0F172A'
      ctx.font = 'bold 15px "Be Vietnam Pro", Inter, sans-serif'
      ctx.fillText(wdName, x + 12, topY + 24)
      ctx.fillStyle = '#64748B'
      ctx.font = '500 12px "Be Vietnam Pro", Inter, sans-serif'
      ctx.fillText(formatDate(day), x + 12, topY + 42)

      // Group by Sáng / Chiều / Tối
      const groups: { key: 'morning' | 'afternoon' | 'evening'; label: string }[] = [
        { key: 'morning', label: '🌅 SÁNG' },
        { key: 'afternoon', label: '☀️ CHIỀU' },
        { key: 'evening', label: '🌙 TỐI' },
      ]

      let curY = topY + 66
      groups.forEach(g => {
        const items = daySessions.filter(s => (s.session_group || 'morning') === g.key)
        if (items.length === 0) return

        ctx.fillStyle = '#475569'
        ctx.font = 'bold 11px "Be Vietnam Pro", Inter, sans-serif'
        ctx.fillText(`${g.label} (${items.length})`, x + 10, curY)
        curY += 8

        items.forEach(s => {
          if (curY > topY + colH - 64) return
          const isSch = s.type === 'school'
          const isDuty = s.type === 'duty'
          const isExt = s.type === 'tutoring_extra'

          const bg = isSch ? '#EFF6FF' : isDuty ? '#F1F5F9' : isExt ? '#F5F3FF' : '#FFF7ED'
          const border = isSch ? '#2563EB' : isDuty ? '#64748B' : isExt ? '#7C3AED' : '#EA580C'
          const textCol = isSch ? '#1E3A8A' : isDuty ? '#334155' : isExt ? '#4C1D95' : '#7C2D12'

          ctx.fillStyle = bg
          ctx.beginPath()
          ctx.roundRect(x + 8, curY, colW - 16, 54, 8)
          ctx.fill()

          ctx.fillStyle = border
          ctx.fillRect(x + 8, curY, 4, 54)

          // Line 1: Period code + time + class (Section 5.9: "S1-S2 · 07:00-08:35 · 10A5")
          ctx.fillStyle = textCol
          ctx.font = 'bold 12px "Be Vietnam Pro", Inter, sans-serif'
          const titleLine = s.period_code
            ? `${s.period_code} · ${s.class_name}`
            : s.class_name
          ctx.fillText(titleLine.slice(0, 22), x + 18, curY + 18)

          ctx.font = '500 11px monospace'
          ctx.fillText(`${s.start_time}–${s.end_time}`, x + 18, curY + 34)

          if (s.location) {
            ctx.fillStyle = '#64748B'
            ctx.font = '400 10px "Be Vietnam Pro", Inter, sans-serif'
            ctx.fillText(s.location.slice(0, 24), x + 18, curY + 48)
          }

          curY += 62
        })

        curY += 8
      })
    })

    setImageUrl(canvas.toDataURL('image/png'))
  }, [open, weekStart, weekDays, sessionsByDay, showDuty])

  const handleDownloadPng = () => {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `Lich-Day-Tuan-${dateToStr(weekStart)}.png`
    a.click()
    toast.success('Đã tải xuống ảnh lịch tuần (.png)!')
  }

  const handleExportIcs = () => {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LichDayGV//TeacherSchedule//VI',
      'CALSCALE:GREGORIAN',
    ]

    weekDays.forEach(day => {
      const dStr = dateToStr(day)
      const compactDate = dStr.replace(/-/g, '')
      const list = (sessionsByDay[dStr] || []).filter(
        s => !s.is_cancelled && (showDuty || s.type !== 'duty')
      )

      list.forEach(s => {
        if (s.start_time === '00:00') return
        const startStr = `${compactDate}T${s.start_time.replace(':', '')}00`
        const endStr = `${compactDate}T${s.end_time.replace(':', '')}00`
        const summary = s.period_code
          ? `[${s.period_code}] ${s.class_name}${s.subject ? ' - ' + s.subject : ''}`
          : `${s.class_name}`
        lines.push(
          'BEGIN:VEVENT',
          `UID:${s.id}@lichdaygv.local`,
          `DTSTART;TZID=Asia/Ho_Chi_Minh:${startStr}`,
          `DTEND;TZID=Asia/Ho_Chi_Minh:${endStr}`,
          `SUMMARY:${summary}`,
          `LOCATION:${s.location || ''}`,
          `DESCRIPTION:${s.reason || s.note || ''}`,
          'END:VEVENT'
        )
      })
    })

    lines.push('END:VCALENDAR')
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Lich-Day-${dateToStr(weekStart)}.ics`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã xuất file .ics để nhập vào Google Calendar!')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xuất ảnh lịch tuần & Đồng bộ Google Calendar"
      subtitle="Chia nhóm Sáng / Chiều / Tối, ghi rõ mã tiết trường và giờ quy đổi"
      size="xl"
    >
      <div className="flex flex-col gap-4">
        <canvas ref={canvasRef} className="hidden" />

        {imageUrl && (
          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-[#37393F] bg-gray-100 dark:bg-[#131314] p-2">
            <img
              src={imageUrl}
              alt="Bản xem trước ảnh lịch tuần"
              className="w-full h-auto rounded-lg shadow-sm"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-[#2D2F34]">
          <button
            type="button"
            onClick={handleExportIcs}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <Calendar size={15} className="text-[#1A73E8]" />
            Xuất file Google Calendar (.ics)
          </button>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Đóng
            </button>
            <button
              type="button"
              onClick={handleDownloadPng}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Download size={15} />
              Tải ảnh tuần (.PNG)
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// 4. Keyboard Shortcuts Reference Modal (Section 5.4)
export function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const shortcuts = [
    { key: 'D', desc: 'Chuyển sang chế độ xem Ngày (Day)' },
    { key: 'W', desc: 'Chuyển sang chế độ xem Tuần (Week)' },
    { key: 'M', desc: 'Chuyển sang chế độ xem Tháng (Month)' },
    { key: 'A', desc: 'Chuyển sang chế độ xem Lịch biểu (Agenda)' },
    { key: 'X', desc: 'Chuyển sang chế độ xem 4 ngày / 3 ngày' },
    { key: 'P', desc: 'Chuyển sang chế độ Bảng tiết của trường' },
    { key: 'T', desc: 'Nhảy nhanh về ngày Hôm nay (Today)' },
    { key: 'J / ←', desc: 'Lùi về kỳ trước (Ngày/Tuần/Tháng trước)' },
    { key: 'K / →', desc: 'Tiến tới kỳ sau (Ngày/Tuần/Tháng sau)' },
    { key: 'C', desc: 'Mở hộp tạo nhanh buổi phát sinh (Create)' },
    { key: '/', desc: 'Đặt con trỏ vào ô Tìm kiếm lịch' },
    { key: '?', desc: 'Mở bảng danh sách phím tắt này' },
    { key: 'Esc', desc: 'Đóng hộp thoại / Popover đang mở' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Phím tắt bàn phím (Kiểu Google Calendar)" size="md">
      <div className="divide-y divide-gray-100 dark:divide-[#2D2F34]">
        {shortcuts.map(item => (
          <div key={item.key} className="py-2.5 flex items-center justify-between gap-4 text-xs">
            <span className="text-gray-700 dark:text-gray-300">{item.desc}</span>
            <kbd className="px-2.5 py-1 rounded-md bg-gray-100 dark:bg-[#282A2E] border border-gray-300 dark:border-[#37393F] font-mono font-bold text-gray-800 dark:text-gray-200 shrink-0">
              {item.key}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  )
}

