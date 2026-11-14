import React, { useMemo, useState } from 'react'
import { Sunrise, Sun, Plus, Pencil, ShieldAlert, BookOpen, Clock, Coffee } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { VI_WEEKDAYS_FULL, dateToStr, dateToWeekday } from '../../lib/dateUtils'
import {
  getEffectivePeriodsForDate,
  getMondayOfDateStr,
} from '../../lib/schoolPeriods'
import { formatFullDdMmYyyy } from '../../lib/debtEngine'
import { getSessionInlineStyle } from '../../lib/sessionStyles'
import { Modal } from '../ui/Modal'
import { cn } from '../../lib/utils'
import type { CalendarSession, SchoolCellType, SchoolSchedule } from '../../types'
import toast from 'react-hot-toast'

interface SchoolPeriodGridViewProps {
  weekDays: Date[]
  sessionsByDay: Record<string, CalendarSession[]>
  onSelectSession: (session: CalendarSession, anchorRect?: DOMRect) => void
}

export function SchoolPeriodGridView({
  weekDays,
  sessionsByDay,
  onSelectSession,
}: SchoolPeriodGridViewProps) {
  const {
    darkMode,
    schoolPeriods,
    schoolSchedule,
    schoolWeekConfigs,
    setSchoolWeekConfig,
    upsertSchoolCell,
    settings,
  } = useAppStore()

  const weekMonday = useMemo(
    () => getMondayOfDateStr(weekDays[0] ? dateToStr(weekDays[0]) : undefined),
    [weekDays]
  )

  const weekConfig = schoolWeekConfigs[weekMonday] || null
  const afternoonLongBreak = Boolean(weekConfig?.afternoon_long_break)
  const afternoonBreakMinutes = weekConfig?.afternoon_break_minutes || settings.afternoon_long_break_minutes || 20

  const weekSchoolItems = useMemo(
    () =>
      schoolSchedule.filter((s) =>
        s.week_start ? s.week_start === weekMonday : true
      ),
    [schoolSchedule, weekMonday]
  )

  const effectivePeriods = useMemo(
    () =>
      getEffectivePeriodsForDate(
        schoolPeriods,
        weekMonday,
        weekConfig,
        weekSchoolItems,
        settings
      ),
    [schoolPeriods, weekMonday, weekConfig, weekSchoolItems, settings]
  )

  const morningCount = settings.morning_periods_count || 5
  const afternoonCount = settings.afternoon_periods_count || 4

  const morningCodes = Array.from({ length: morningCount }, (_, i) => `S${i + 1}`)
  const afternoonCodes = Array.from({ length: afternoonCount }, (_, i) => `C${i + 1}`)

  // Columns T2 (1) -> T7 (6) as standard paper school timetable
  const schoolWeekdays = [1, 2, 3, 4, 5, 6]

  // Count teaching periods (excluding "Trực")
  const teachingPeriodsCount = useMemo(
    () => weekSchoolItems.filter((s) => s.cell_type === 'class').length,
    [weekSchoolItems]
  )

  const [editingCell, setEditingCell] = useState<{
    weekday: number
    period_code: string
    existing?: SchoolSchedule
  } | null>(null)

  const [cellType, setCellType] = useState<SchoolCellType | 'empty'>('class')
  const [className, setClassName] = useState('')
  const [subject, setSubject] = useState('Toán')
  const [room, setRoom] = useState('')
  const [note, setNote] = useState('')

  const openEditCell = (weekday: number, period_code: string) => {
    const isAfternoon = period_code.toUpperCase().startsWith('C')
    const existing =
      weekSchoolItems.find(
        (s) => s.weekday === weekday && s.period_code.toUpperCase() === period_code.toUpperCase()
      ) ||
      (isAfternoon
        ? weekSchoolItems.find(
            (s) =>
              s.weekday === weekday &&
              s.period_code.toUpperCase().startsWith('C') &&
              s.cell_type === 'duty'
          )
        : undefined)

    setEditingCell({ weekday, period_code, existing })
    if (existing) {
      setCellType(existing.cell_type || 'class')
      setClassName(existing.class_name || '')
      setSubject(existing.subject || 'Toán')
      setRoom(existing.room || '')
      setNote(existing.note || '')
    } else {
      setCellType('class')
      setClassName('')
      setSubject('Toán')
      setRoom('')
      setNote('')
    }
  }

  const handleSaveCell = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCell) return

    if (cellType === 'class' && !className.trim()) {
      toast.error('Vui lòng nhập tên lớp (vd: 10A5)')
      return
    }

    const targetCode =
      cellType === 'duty' && editingCell.period_code.toUpperCase().startsWith('C')
        ? 'C1'
        : editingCell.existing?.cell_type === 'duty' && cellType === 'empty'
        ? editingCell.existing.period_code
        : editingCell.period_code

    upsertSchoolCell({
      week_start: weekMonday,
      weekday: editingCell.weekday,
      period_code: targetCode,
      cell_type: cellType,
      class_name: className,
      subject,
      room,
      note,
    })

    toast.success(
      cellType === 'empty'
        ? `Đã xóa ô tiết (${VI_WEEKDAYS_FULL[editingCell.weekday - 1]})`
        : cellType === 'duty'
        ? `Đã đặt Trực cả buổi chiều 13:30–${settings.duty_end_time || '16:30'} (${VI_WEEKDAYS_FULL[editingCell.weekday - 1]})`
        : `Đã lưu tiết ${editingCell.period_code} (${VI_WEEKDAYS_FULL[editingCell.weekday - 1]})`
    )
    setEditingCell(null)
  }

  const getPeriodTimeLabel = (code: string) => {
    const p = effectivePeriods.find((sp) => sp.period_code.toUpperCase() === code.toUpperCase())
    return p ? `${p.start_time}–${p.end_time}` : ''
  }

  const renderSessionRows = (codes: string[], sessionTitle: string, isMorning: boolean) => (
    <>
      <tr className="bg-gray-100/90 dark:bg-[#282A2E] border-y border-gray-200 dark:border-[#37393F]">
        <td
          colSpan={schoolWeekdays.length + 1}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              {isMorning ? (
                <Sunrise size={14} className="text-amber-500" />
              ) : (
                <Sun size={14} className="text-orange-500" />
              )}
              <span>{sessionTitle}</span>
            </div>

            {!isMorning && (
              <div className="flex items-center gap-2 normal-case font-semibold">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={afternoonLongBreak}
                    onChange={(e) => {
                      setSchoolWeekConfig(weekMonday, {
                        afternoon_long_break: e.target.checked,
                        afternoon_break_minutes: afternoonBreakMinutes,
                      })
                      toast.success(
                        e.target.checked
                          ? `Đã bật ra chơi dài chiều (${afternoonBreakMinutes}p sau C2: C4 tan 17:00)`
                          : 'Đã tắt ra chơi dài chiều (C4 tan 16:45)'
                      )
                    }}
                    className="rounded text-blue-600"
                  />
                  <span>Chiều có ra chơi dài ({afternoonBreakMinutes}p sau C2)</span>
                </label>
              </div>
            )}
          </div>
        </td>
      </tr>

      {codes.map((code, rowIdx) => {
        const timeRange = getPeriodTimeLabel(code)
        return (
          <React.Fragment key={code}>
            <tr className="divide-x divide-gray-200 dark:divide-[#2D2F34] border-b border-gray-200/80 dark:border-[#2D2F34]">
              {/* Period Code & Time Column */}
              <td className="px-2.5 py-2.5 bg-gray-50/70 dark:bg-[#1E1F22] text-center w-24 shrink-0">
                <div className="font-bold text-xs text-gray-900 dark:text-white">{code}</div>
                {timeRange && (
                  <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                    {timeRange}
                  </div>
                )}
              </td>

              {/* Weekday Cells (T2 - T7) */}
              {schoolWeekdays.map((wd) => {
                // Group B2: Check if this weekday afternoon has "Trực"
                const afternoonDutyItem =
                  !isMorning &&
                  weekSchoolItems.find(
                    (s) =>
                      s.weekday === wd &&
                      s.period_code.toUpperCase().startsWith('C') &&
                      s.cell_type === 'duty'
                  )

                if (afternoonDutyItem && rowIdx > 0) {
                  // Covered by rowSpan of C1..Cn
                  return null
                }

                const item =
                  afternoonDutyItem ||
                  weekSchoolItems.find(
                    (s) => s.weekday === wd && s.period_code.toUpperCase() === code.toUpperCase()
                  )
                const isDuty = item?.cell_type === 'duty'
                const isOther = item?.cell_type === 'other'

                return (
                  <td
                    key={`${wd}-${code}`}
                    rowSpan={afternoonDutyItem && rowIdx === 0 ? codes.length : 1}
                    onClick={() => openEditCell(wd, code)}
                    className={cn(
                      'p-1.5 align-top cursor-pointer transition-colors min-w-[110px] h-16 group relative',
                      !item && 'hover:bg-blue-50/40 dark:hover:bg-blue-950/20',
                      item &&
                        !isDuty &&
                        !isOther &&
                        'bg-blue-50/70 dark:bg-blue-950/35 hover:bg-blue-100/70',
                      isDuty &&
                        'bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300/70 align-middle text-center',
                      isOther && 'bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/70'
                    )}
                  >
                    {!item ? (
                      <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-gray-400 text-xs">
                        <Plus size={14} />
                      </div>
                    ) : isDuty ? (
                      <div className="flex flex-col items-center justify-center h-full gap-1 py-2">
                        <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100">
                          🛡️ TRỰC CHIỀU
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                          13:30–{settings.duty_end_time || '16:30'}
                        </span>
                        {item.room && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 dark:bg-black/30 text-slate-600 dark:text-slate-300">
                            {item.room}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col h-full justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={cn(
                                'font-bold text-xs',
                                isOther
                                  ? 'text-amber-900 dark:text-amber-200'
                                  : 'text-[#174EA6] dark:text-blue-200'
                              )}
                            >
                              {item.class_name}
                            </span>
                            <Pencil
                              size={11}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 shrink-0"
                            />
                          </div>
                          {item.subject && (
                            <div className="text-[11px] text-gray-600 dark:text-gray-300 truncate">
                              {item.subject}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-1">
                          {item.room && (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-white/80 dark:bg-black/30 text-gray-600 dark:text-gray-300">
                              P.{item.room.replace(/^P\.?/i, '')}
                            </span>
                          )}
                          {item.note && (
                            <span className="text-[10px] text-gray-500 italic truncate">
                              {item.note}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>

            {/* Morning Long Break Band after S2 (08:35 - 08:55) */}
            {code === 'S2' && (
              <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-gray-200 dark:border-[#2D2F34]">
                <td
                  colSpan={schoolWeekdays.length + 1}
                  className="px-3 py-1 text-center text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Coffee size={12} /> Ra chơi dài buổi sáng: 08:35 – 08:55 (20 phút)
                  </span>
                </td>
              </tr>
            )}

            {/* Afternoon Long Break Band after C2 (15:05 - 15:25) when enabled */}
            {code === 'C2' && afternoonLongBreak && (
              <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-gray-200 dark:border-[#2D2F34]">
                <td
                  colSpan={schoolWeekdays.length + 1}
                  className="px-3 py-1 text-center text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Coffee size={12} /> Ra chơi dài buổi chiều: 15:05 – 15:25 ({afternoonBreakMinutes} phút)
                  </span>
                </td>
              </tr>
            )}
          </React.Fragment>
        )
      })}
    </>
  )

  return (
    <div className="flex-1 overflow-y-auto p-3 tablet:p-5 flex flex-col gap-5">
      {/* Paper School Timetable Card */}
      <div className="card shrink-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#2D2F34] flex flex-wrap items-center justify-between gap-2 bg-gray-50/60 dark:bg-[#282A2E]/50">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <BookOpen size={16} className="text-[#1A73E8]" />
              Bảng tiết của trường · Tuần từ {formatFullDdMmYyyy(weekMonday)} ({teachingPeriodsCount} tiết dạy)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Bấm vào ô tiết bất kỳ (S1–S{morningCount}, C1–C{afternoonCount}) để gán Lớp dạy, ô "Trực" (cả buổi chiều 13:30–{settings.duty_end_time || '16:30'}) hoặc để trống.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Lớp trường ({teachingPeriodsCount} tiết)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-500 inline-block" /> Ô Trực (13:30–{settings.duty_end_time || '16:30'})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Họp / SHCN
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="divide-x divide-gray-200 dark:divide-[#2D2F34] bg-gray-50 dark:bg-[#1E1F22] border-b border-gray-200 dark:border-[#2D2F34]">
                <th className="px-2.5 py-2.5 text-center text-xs font-bold text-gray-500 dark:text-gray-400 w-24">
                  Tiết / Giờ
                </th>
                {schoolWeekdays.map((wd) => (
                  <th
                    key={wd}
                    className="px-3 py-2.5 text-center text-xs font-bold text-gray-800 dark:text-gray-200"
                  >
                    {VI_WEEKDAYS_FULL[wd - 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderSessionRows(morningCodes, 'Buổi Sáng (S1 – S' + morningCount + ')', true)}
              {renderSessionRows(afternoonCodes, 'Buổi Chiều (C1 – C' + afternoonCount + ')', false)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Separate Band Below: Tutoring & Extra Sessions for the Week */}
      <div className="card shrink-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#2D2F34] bg-orange-50/40 dark:bg-orange-950/20">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Clock size={16} className="text-orange-500" />
            Dải lịch dạy thêm & phát sinh trong tuần (Thứ 2 – Chủ nhật)
          </h3>
        </div>
        <div className="grid grid-cols-1 tablet:grid-cols-7 divide-y tablet:divide-y-0 tablet:divide-x divide-gray-200 dark:divide-[#2D2F34]">
          {weekDays.map((day) => {
            const dStr = dateToStr(day)
            const wd = dateToWeekday(day)
            const tutoringList = (sessionsByDay[dStr] || []).filter(
              (s) => s.type === 'tutoring_fixed' || s.type === 'tutoring_extra'
            )

            return (
              <div key={dStr} className="p-2.5 flex flex-col gap-1.5 min-h-[100px]">
                <div className="text-xs font-bold text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-[#2D2F34] pb-1">
                  {VI_WEEKDAYS_FULL[wd - 1]}
                </div>
                {tutoringList.length === 0 ? (
                  <div className="text-[11px] text-gray-400 py-2 italic">Trống</div>
                ) : (
                  tutoringList.map((s) => (
                    <div
                      key={s.id}
                      onClick={(e) => onSelectSession(s, e.currentTarget.getBoundingClientRect())}
                      style={getSessionInlineStyle(s, darkMode)}
                      className="p-2 rounded-lg text-xs cursor-pointer border border-black/5 dark:border-white/10 border-l-4 transition-shadow hover:shadow-sm"
                    >
                      <div className="font-extrabold truncate">{s.class_name}</div>
                      <div className="font-mono text-[10px] font-bold opacity-85 mt-0.5">
                        {s.start_time}–{s.end_time}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Edit School Period Cell Modal */}
      <Modal
        open={!!editingCell}
        onClose={() => setEditingCell(null)}
        title={
          editingCell
            ? `Ô tiết ${editingCell.period_code} · ${VI_WEEKDAYS_FULL[editingCell.weekday - 1]} (Tuần ${formatFullDdMmYyyy(weekMonday)})`
            : 'Chỉnh sửa tiết trường'
        }
        subtitle={editingCell ? `Khung giờ quy đổi: ${getPeriodTimeLabel(editingCell.period_code)}` : ''}
        size="sm"
      >
        <form onSubmit={handleSaveCell} className="flex flex-col gap-4">
          <div>
            <label className="label">Loại ô tiết</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'class', label: '🏫 Lớp dạy' },
                { key: 'duty', label: `🛡️ Ô Trực (13:30–${settings.duty_end_time || '16:30'})` },
                { key: 'other', label: '📋 Họp / SHCN' },
                { key: 'empty', label: '⬜ Để trống (Xóa)' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setCellType(opt.key as any)
                    if (opt.key === 'duty' && !className) setClassName('Trực')
                  }}
                  className={cn(
                    'py-2 px-3 rounded-lg text-xs font-semibold border text-left transition-all',
                    cellType === opt.key
                      ? 'border-[#1A73E8] bg-[#E8F0FE] dark:bg-blue-950/50 text-[#1A73E8] dark:text-[#8AB4F8]'
                      : 'border-gray-200 dark:border-[#37393F] text-gray-700 dark:text-gray-300'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {cellType !== 'empty' && (
            <>
              <div>
                <label className="label">
                  {cellType === 'duty' ? 'Tiêu đề ca Trực' : 'Tên lớp trường *'}
                </label>
                <input
                  className="input"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder={cellType === 'duty' ? 'Vd: Trực chiều' : 'Vd: 10A5, 11B2...'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Môn / Nội dung</label>
                  <input
                    className="input"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Vd: Toán, Đại số..."
                  />
                </div>
                <div>
                  <label className="label">Phòng học</label>
                  <input
                    className="input"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    placeholder="Vd: 201, P.HĐ..."
                  />
                </div>
              </div>

              <div>
                <label className="label">Ghi chú thêm</label>
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú cho tiết này..."
                />
              </div>

              {cellType === 'duty' && (
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-2">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5 text-slate-500" />
                  <span>
                    Ô "Trực" chiếm cả buổi chiều (13:30–{settings.duty_end_time || '16:30'}), được tính vào kiểm tra trùng lịch dạy thêm nhưng KHÔNG cộng vào "Số tiết dạy".
                  </span>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setEditingCell(null)} className="btn-secondary flex-1">
              Hủy
            </button>
            <button type="submit" className="btn-primary flex-1">
              Lưu ô tiết
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
