import React from 'react'
import { format, isToday } from 'date-fns'
import {
  Sunrise,
  Sun,
  Moon,
  Plus,
  Users,
  AlertTriangle,
  School,
  ArrowRight,
  Clock,
  BookOpen,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import {
  VI_WEEKDAYS,
  VI_WEEKDAYS_FULL,
  dateToWeekday,
  dateToStr,
  formatDateShort,
} from '../../lib/dateUtils'
import { getSessionInlineStyle, getSessionVisualStyle } from '../../lib/sessionStyles'
import { cn } from '../../lib/utils'
import type { CalendarSession, TimeOfDayGroup } from '../../types'

interface SessionMatrixViewProps {
  days: Date[]
  sessionsByDay: Record<string, CalendarSession[]>
  onSelectSession: (session: CalendarSession, anchorRect?: DOMRect) => void
  onQuickCreate: (dateStr: string, startTime: string, endTime: string) => void
  onSelectDayHeader?: (day: Date) => void
}

const BAND_ROWS: {
  key: TimeOfDayGroup
  title: string
  shortTitle: string
  timeHint: string
  defaultStart: string
  defaultEnd: string
  icon: typeof Sunrise
  accentBorder: string
  headerBg: string
  iconBg: string
  iconColor: string
}[] = [
  {
    key: 'morning',
    title: 'Buổi Sáng',
    shortTitle: 'Sáng',
    timeHint: '07:00 – 11:45',
    defaultStart: '08:00',
    defaultEnd: '10:00',
    icon: Sunrise,
    accentBorder: 'border-l-4 border-l-amber-500',
    headerBg: 'bg-amber-50/60 dark:bg-amber-950/20',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    key: 'afternoon',
    title: 'Buổi Chiều',
    shortTitle: 'Chiều',
    timeHint: '13:00 – 18:00',
    defaultStart: '14:00',
    defaultEnd: '16:00',
    icon: Sun,
    accentBorder: 'border-l-4 border-l-sky-500',
    headerBg: 'bg-sky-50/60 dark:bg-sky-950/20',
    iconBg: 'bg-sky-100 dark:bg-sky-900/40',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
  {
    key: 'evening',
    title: 'Buổi Tối',
    shortTitle: 'Tối',
    timeHint: '18:30 – 21:30',
    defaultStart: '19:00',
    defaultEnd: '20:30',
    icon: Moon,
    accentBorder: 'border-l-4 border-l-indigo-500',
    headerBg: 'bg-indigo-50/60 dark:bg-indigo-950/20',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/40',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
]

function getCleanLocationBadge(session: CalendarSession): string | null {
  const loc = (session.location || '').trim()
  if (!loc) return null
  const lower = loc.toLowerCase()
  if (lower === 'online' || lower.includes('online')) return 'Online'
  if (lower.includes('offline') || lower.includes('trực tiếp')) return 'Offline'
  // Hide redundant auto-generated descriptions like "Phòng học Văn 7V1" or "Kèm Văn 7"
  if (
    lower.startsWith('phòng học') ||
    lower.startsWith('kèm ') ||
    lower.startsWith('ca ghép')
  ) {
    return null
  }
  return loc
}

export function SessionMatrixView({
  days,
  sessionsByDay,
  onSelectSession,
  onQuickCreate,
  onSelectDayHeader,
}: SessionMatrixViewProps) {
  const darkMode = useAppStore((s) => s.darkMode)

  // Compute daily tutoring shift index ("Ca 1", "Ca 2", "Ca 3", "Ca 4") per day
  const shiftIndexBySessionId = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const day of days) {
      const dStr = dateToStr(day)
      const list = (sessionsByDay[dStr] || []).filter(
        (s) =>
          s.type !== 'school' &&
          s.type !== 'duty' &&
          !(s.start_time === '00:00' && s.end_time === '23:59')
      )
      list.forEach((s, idx) => {
        map.set(s.id, idx + 1)
      })
    }
    return map
  }, [days, sessionsByDay])

  // Compute weekly summary stats
  const weekStats = React.useMemo(() => {
    let schoolSessions = 0
    let tutoringSessions = 0
    for (const day of days) {
      const dStr = dateToStr(day)
      const list = (sessionsByDay[dStr] || []).filter((s) => !s.is_cancelled)
      for (const s of list) {
        if (s.start_time === '00:00' && s.end_time === '23:59') continue
        if (s.type === 'school' || s.type === 'duty') schoolSessions++
        else tutoringSessions++
      }
    }
    return { schoolSessions, tutoringSessions }
  }, [days, sessionsByDay])

  const weekRangeLabel = React.useMemo(() => {
    if (days.length === 0) return ''
    const first = days[0]
    const last = days[days.length - 1]
    return `${format(first, 'dd/MM')} – ${format(last, 'dd/MM/yyyy')}`
  }, [days])

  return (
    <div className="flex-1 overflow-auto bg-slate-100/70 dark:bg-[#141518] p-2 tablet:p-3.5 scrollbar-thin">
      <div className="min-w-[860px] tablet:min-w-full bg-white dark:bg-[#1E1F22] rounded-2xl border border-slate-200/90 dark:border-[#2D2F34] shadow-xs overflow-hidden flex flex-col">
        {/* Top Table Title & Summary Bar */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2D2F34] bg-white dark:bg-[#1E1F22] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center">
              <BookOpen size={15} />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-xs tablet:text-sm font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                Thời khóa biểu dạy thêm & lịch trường
              </h2>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                ({weekRangeLabel})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#282A2E] text-slate-700 dark:text-slate-300 font-semibold">
              <School size={12} className="text-slate-500" />
              <span>Dạy trường: {weekStats.schoolSessions} buổi</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#1A73E8] dark:text-[#8AB4F8] font-bold">
              <Clock size={12} />
              <span>Dạy thêm: {weekStats.tutoringSessions} ca</span>
            </span>
          </div>
        </div>

        {/* Fixed 7-Column Timetable Matrix */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#2D2F34] bg-slate-50/90 dark:bg-[#25272C]">
                {/* Left Corner Column Header */}
                <th className="w-[112px] desktop:w-[126px] p-2.5 border-r border-slate-200 dark:border-[#2D2F34] text-left align-middle">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Khung giờ
                  </div>
                  <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">
                    Buổi / Thứ
                  </div>
                </th>

                {/* 7 Weekday Headers */}
                {days.map((day) => {
                  const dStr = dateToStr(day)
                  const wdIdx = dateToWeekday(day) - 1
                  const isT = isToday(day)
                  const daySessions = (sessionsByDay[dStr] || []).filter((s) => !s.is_cancelled)
                  const tutoringCount = daySessions.filter(
                    (s) => s.type !== 'school' && s.type !== 'duty'
                  ).length

                  return (
                    <th
                      key={dStr}
                      onClick={() => onSelectDayHeader?.(day)}
                      className={cn(
                        'p-2 border-r last:border-r-0 border-slate-200 dark:border-[#2D2F34] cursor-pointer transition-colors select-none align-middle',
                        isT
                          ? 'bg-blue-50/90 dark:bg-blue-950/35'
                          : 'hover:bg-slate-100 dark:hover:bg-[#2D2F34]/60'
                      )}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              'text-xs font-extrabold uppercase tracking-wide',
                              isT
                                ? 'text-[#1A73E8] dark:text-[#8AB4F8]'
                                : 'text-slate-800 dark:text-slate-100'
                            )}
                          >
                            {VI_WEEKDAYS_FULL[wdIdx] || VI_WEEKDAYS[wdIdx]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'text-[11px] font-bold px-1.5 py-0.2 rounded-md',
                              isT
                                ? 'bg-[#1A73E8] text-white'
                                : 'text-slate-500 dark:text-slate-400'
                            )}
                          >
                            {format(day, 'dd/MM')}
                          </span>
                          {tutoringCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                              {tutoringCount} ca
                            </span>
                          )}
                        </div>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-[#2D2F34]">
              {BAND_ROWS.map((band) => {
                const BandIcon = band.icon
                return (
                  <tr key={band.key} className="align-top">
                    {/* Left Band Row Header */}
                    <td
                      className={cn(
                        'p-3 border-r border-slate-200 dark:border-[#2D2F34] align-middle',
                        band.headerBg,
                        band.accentBorder
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={cn(
                              'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
                              band.iconBg
                            )}
                          >
                            <BandIcon size={14} className={band.iconColor} />
                          </div>
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                            {band.title}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-400 pl-0.5">
                          {band.timeHint}
                        </div>
                      </div>
                    </td>

                    {/* 7 Day Cells in this Row */}
                    {days.map((day) => {
                      const dStr = dateToStr(day)
                      const isT = isToday(day)
                      const cellSessions = (sessionsByDay[dStr] || []).filter(
                        (s) =>
                          !(s.start_time === '00:00' && s.end_time === '23:59') &&
                          (s.session_group || 'morning') === band.key
                      )

                      return (
                        <td
                          key={`${band.key}-${dStr}`}
                          className={cn(
                            'p-1.5 tablet:p-2 border-r last:border-r-0 border-slate-200 dark:border-[#2D2F34] align-top relative group/cell transition-colors',
                            isT
                              ? 'bg-blue-50/20 dark:bg-blue-950/10'
                              : 'hover:bg-slate-50/60 dark:hover:bg-[#23252A]/40'
                          )}
                        >
                          {/* Subtle floating "+" button in top-right corner on hover */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onQuickCreate(dStr, band.defaultStart, band.defaultEnd)
                            }}
                            title={`Thêm buổi vào ${band.title} ngày ${format(day, 'dd/MM/yyyy')}`}
                            className="opacity-0 group-hover/cell:opacity-100 focus:opacity-100 absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-md bg-white/90 dark:bg-[#282A2E] border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#1A73E8] hover:border-[#1A73E8] shadow-xs flex items-center justify-center transition-opacity"
                          >
                            <Plus size={12} />
                          </button>

                          <div className="min-h-[96px] flex flex-col gap-1.5 h-full">
                            {cellSessions.length === 0 ? (
                              <div
                                onClick={() =>
                                  onQuickCreate(dStr, band.defaultStart, band.defaultEnd)
                                }
                                className="flex-1 min-h-[92px] rounded-xl border border-dashed border-transparent group-hover/cell:border-slate-200 dark:group-hover/cell:border-slate-700/70 flex items-center justify-center cursor-pointer transition-all"
                              >
                                <span className="opacity-0 group-hover/cell:opacity-100 text-[11px] font-semibold text-slate-400 hover:text-[#1A73E8] inline-flex items-center gap-1">
                                  <Plus size={12} />
                                  Thêm ca
                                </span>
                              </div>
                            ) : (
                              cellSessions.map((session) => {
                                const isSchool = session.type === 'school'
                                const isDuty = session.type === 'duty'
                                const isExtra = session.type === 'tutoring_extra'
                                const isCancelled = !!session.is_cancelled
                                const shiftNum = shiftIndexBySessionId.get(session.id)
                                const inlineStyle = getSessionInlineStyle(session, darkMode)
                                const visual = getSessionVisualStyle(session)
                                const cleanLoc = getCleanLocationBadge(session)

                                // 1. School / Duty Block ("Dạy Trường")
                                if (isSchool || isDuty) {
                                  return (
                                    <div
                                      key={session.id}
                                      onClick={(e) =>
                                        onSelectSession(
                                          session,
                                          e.currentTarget.getBoundingClientRect()
                                        )
                                      }
                                      className={cn(
                                        'flex-1 min-h-[84px] rounded-xl border border-slate-200/90 dark:border-slate-700/70 bg-slate-100/80 dark:bg-slate-800/40 px-2.5 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-all flex flex-col items-center justify-center text-center gap-1'
                                      )}
                                    >
                                      <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                                        <School size={13} className="text-slate-500 shrink-0" />
                                        <span>{session.class_name}</span>
                                      </div>
                                      <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                                        {session.start_time} – {session.end_time}
                                      </div>
                                    </div>
                                  )
                                }

                                // 2. Tutoring / Extra Session Block
                                return (
                                  <div
                                    key={session.id}
                                    onClick={(e) =>
                                      onSelectSession(
                                        session,
                                        e.currentTarget.getBoundingClientRect()
                                      )
                                    }
                                    style={inlineStyle}
                                    className={cn(
                                      'flex-1 rounded-xl border border-black/5 dark:border-white/10 border-l-4 px-2.5 py-2 cursor-pointer hover:shadow-md transition-all flex flex-col justify-between gap-1',
                                      isCancelled && 'opacity-60',
                                      session.has_conflict &&
                                        !isCancelled &&
                                        'ring-2 ring-red-500'
                                    )}
                                  >
                                    <div>
                                      {/* Top row: Ca badge + Time range */}
                                      <div className="flex items-center justify-between gap-1">
                                        {shiftNum && !isCancelled ? (
                                          <span
                                            style={{
                                              backgroundColor: darkMode
                                                ? 'rgba(255,255,255,0.16)'
                                                : visual.badgeBgLight,
                                              color: darkMode
                                                ? '#F8FAFC'
                                                : visual.badgeTextLight,
                                            }}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-tight shrink-0"
                                          >
                                            Ca {shiftNum}
                                          </span>
                                        ) : isExtra && !isCancelled ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-600 text-white shrink-0">
                                            {session.makeup_for ? 'Dạy bù' : 'Phát sinh'}
                                          </span>
                                        ) : (
                                          <span />
                                        )}

                                        <span className="text-[11px] font-mono font-extrabold opacity-90 tabular-nums">
                                          {session.start_time}–{session.end_time}
                                        </span>
                                      </div>

                                      {/* Class Name */}
                                      <div
                                        className={cn(
                                          'text-[13px] font-extrabold leading-snug mt-1 break-words',
                                          isCancelled && 'line-through'
                                        )}
                                      >
                                        {session.class_name}
                                      </div>
                                    </div>

                                    {/* Bottom row: Student count & clean location tag */}
                                    {(Boolean(session.student_count) ||
                                      Boolean(cleanLoc) ||
                                      Boolean(session.is_moved) ||
                                      Boolean(session.has_conflict)) && (
                                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold opacity-85 pt-0.5 border-t border-black/5 dark:border-white/10">
                                        {session.student_count !== undefined &&
                                        session.student_count > 0 ? (
                                          <span className="inline-flex items-center gap-0.5">
                                            <Users size={10} />
                                            {session.student_count} HS
                                          </span>
                                        ) : (
                                          <span />
                                        )}

                                        {cleanLoc && (
                                          <span className="px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[9px] font-extrabold">
                                            {cleanLoc}
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {session.is_moved && session.moved_to_date && (
                                      <div className="flex items-center gap-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                                        <ArrowRight size={10} />
                                        <span>Dời {formatDateShort(session.moved_to_date)}</span>
                                      </div>
                                    )}

                                    {session.has_conflict && !isCancelled && (
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                                        <AlertTriangle size={11} />
                                        <span>Trùng giờ</span>
                                      </div>
                                    )}
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
