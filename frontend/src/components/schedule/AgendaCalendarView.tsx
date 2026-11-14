import React, { useRef, useState, useEffect } from 'react'
import { format, isToday, isSameDay } from 'date-fns'
import {
  Sunrise,
  Sun,
  Moon,
  Users,
  AlertTriangle,
  ArrowRight,
  Car,
  CalendarPlus,
  School,
  Plus,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import {
  VI_WEEKDAYS,
  dateToWeekday,
  dateToStr,
  formatDateShort,
  timeToMinutes,
} from '../../lib/dateUtils'
import { getSessionInlineStyle, getSessionVisualStyle } from '../../lib/sessionStyles'
import { EmptyState } from '../ui/EmptyState'
import { cn } from '../../lib/utils'
import type { CalendarSession, TimeOfDayGroup } from '../../types'

interface AgendaCalendarViewProps {
  days: Date[]
  selectedDate?: Date
  onSelectDate?: (day: Date) => void
  sessionsByDay: Record<string, CalendarSession[]>
  onSelectSession: (session: CalendarSession, anchorRect?: DOMRect) => void
  onQuickCreate: (dateStr: string, startTime: string, endTime: string) => void
}

const GROUP_SHORT_META: Record<
  TimeOfDayGroup,
  { label: string; icon: typeof Sunrise }
> = {
  morning: { label: 'Sáng', icon: Sunrise },
  afternoon: { label: 'Chiều', icon: Sun },
  evening: { label: 'Tối', icon: Moon },
}

function getCleanLocationText(session: CalendarSession): string | null {
  const loc = (session.location || '').trim()
  if (!loc) return null
  const lower = loc.toLowerCase()
  if (lower === 'online' || lower.includes('online')) return 'Online'
  if (lower.includes('offline') || lower.includes('trực tiếp')) return 'Offline'
  if (
    lower.startsWith('phòng học') ||
    lower.startsWith('kèm ') ||
    lower.startsWith('ca ghép')
  ) {
    return null
  }
  return loc
}

export function AgendaCalendarView({
  days,
  selectedDate,
  onSelectDate,
  sessionsByDay,
  onSelectSession,
  onQuickCreate,
}: AgendaCalendarViewProps) {
  const darkMode = useAppStore((s) => s.darkMode)
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [activeDayStr, setActiveDayStr] = useState<string>(() =>
    dateToStr(selectedDate || new Date())
  )
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (selectedDate) {
      setActiveDayStr(dateToStr(selectedDate))
    }
  }, [selectedDate])

  const scrollToDay = (day: Date) => {
    const dStr = dateToStr(day)
    setActiveDayStr(dStr)
    onSelectDate?.(day)
    const el = dayRefs.current[dStr]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const totalSessionsInWeek = days.reduce(
    (sum, d) => sum + (sessionsByDay[dateToStr(d)] || []).length,
    0
  )

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTimeStr = format(now, 'HH:mm')

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#1E1F22] overflow-hidden">
      {/* =====================================================================
          GOOGLE CALENDAR STICKY 7-DAY WEEK STRIP (T2 - CN with circular dates & dots)
         ===================================================================== */}
      <div className="shrink-0 bg-white dark:bg-[#1E1F22] border-b border-slate-200/80 dark:border-[#2D2F34] px-2 py-2 z-20 shadow-2xs">
        <div className="max-w-3xl mx-auto grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const dStr = dateToStr(day)
            const wdIdx = dateToWeekday(day) - 1
            const isT = isToday(day)
            const isSelected =
              activeDayStr === dStr || (selectedDate ? isSameDay(day, selectedDate) : false)
            const daySessions = (sessionsByDay[dStr] || []).filter(
              (s) => !s.is_cancelled && !(s.start_time === '00:00' && s.end_time === '23:59')
            )
            // Prioritize tutoring dots for colorful visual indicator
            const tutoringSessions = daySessions.filter(
              (s) => s.type !== 'school' && s.type !== 'duty'
            )
            const dotSessions =
              tutoringSessions.length > 0 ? tutoringSessions.slice(0, 4) : daySessions.slice(0, 2)

            return (
              <button
                key={dStr}
                type="button"
                onClick={() => scrollToDay(day)}
                className="py-1 flex flex-col items-center justify-center rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-[#282A2E]"
              >
                <span
                  className={cn(
                    'text-[11px] font-bold uppercase tracking-tight',
                    isT
                      ? 'text-[#1A73E8] dark:text-[#8AB4F8]'
                      : isSelected
                        ? 'text-[#1A73E8] dark:text-[#8AB4F8]'
                        : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {VI_WEEKDAYS[wdIdx]}
                </span>

                <div
                  className={cn(
                    'mt-1 w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold transition-all',
                    isT
                      ? 'bg-[#1A73E8] text-white shadow-xs'
                      : isSelected
                        ? 'bg-[#E8F0FE] dark:bg-blue-950/70 text-[#1A73E8] dark:text-[#8AB4F8]'
                        : 'text-slate-800 dark:text-slate-200'
                  )}
                >
                  {format(day, 'd')}
                </div>

                {/* Colored Event Dots underneath date circle (Google Calendar style) */}
                <div className="mt-1 h-1.5 flex items-center justify-center gap-1">
                  {dotSessions.map((s) => {
                    const st = getSessionVisualStyle(s)
                    return (
                      <span
                        key={s.id}
                        style={{ backgroundColor: st.dotColor }}
                        className="w-1.5 h-1.5 rounded-full"
                      />
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* =====================================================================
          GOOGLE CALENDAR SCHEDULE STREAM (Left Date Circle + Right Event Cards)
         ===================================================================== */}
      {totalSessionsInWeek === 0 ? (
        <div className="p-6 max-w-2xl mx-auto w-full">
          <EmptyState
            icon={<CalendarPlus size={28} />}
            title="Chưa có lịch dạy trong tuần này"
            description="Bạn có thể thêm buổi phát sinh hoặc dán tin nhắn Zalo để lên lịch."
            action={
              <button
                type="button"
                onClick={() => onQuickCreate(dateToStr(days[0] || new Date()), '18:00', '19:30')}
                className="btn-primary text-xs"
              >
                + Thêm buổi phát sinh
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#282A2E] max-w-3xl mx-auto w-full">
          {days.map((day) => {
            const dStr = dateToStr(day)
            const isT = isToday(day)
            const wdIdx = dateToWeekday(day) - 1
            const weekdayShort = VI_WEEKDAYS[wdIdx]
            const daySessions = sessionsByDay[dStr] || []

            // Number tutoring shifts (Ca 1, Ca 2...) within the day
            const shiftMap = new Map<string, number>()
            daySessions
              .filter(
                (s) =>
                  s.type !== 'school' &&
                  s.type !== 'duty' &&
                  !(s.start_time === '00:00' && s.end_time === '23:59')
              )
              .forEach((s, idx) => {
                shiftMap.set(s.id, idx + 1)
              })

            const allDayHolidays = daySessions.filter(
              (s) => s.start_time === '00:00' && s.end_time === '23:59'
            )
            const timedSessions = daySessions.filter(
              (s) => !(s.start_time === '00:00' && s.end_time === '23:59')
            )

            // Compute travel buffer between consecutive sessions at different locations
            const activeOrdered = timedSessions.filter((s) => !s.is_cancelled)
            const travelNoticeAfterId = new Map<
              string,
              { gapMinutes: number; fromLoc: string; toLoc: string; isTight: boolean }
            >()

            for (let i = 0; i < activeOrdered.length - 1; i++) {
              const curr = activeOrdered[i]
              const next = activeOrdered[i + 1]
              const loc1 = (curr.location || '').trim()
              const loc2 = (next.location || '').trim()
              if (loc1 && loc2 && loc1.toLowerCase() !== loc2.toLowerCase()) {
                const gap = timeToMinutes(next.start_time) - timeToMinutes(curr.end_time)
                if (gap >= 0 && gap <= 90) {
                  travelNoticeAfterId.set(curr.id, {
                    gapMinutes: gap,
                    fromLoc: loc1,
                    toLoc: loc2,
                    isTight: gap < 20,
                  })
                }
              }
            }

            return (
              <div
                key={dStr}
                ref={(el) => {
                  dayRefs.current[dStr] = el
                }}
                className={cn(
                  'flex items-start gap-3 px-3 tablet:px-5 py-3.5 transition-colors',
                  isT && 'bg-blue-50/25 dark:bg-blue-950/10'
                )}
              >
                {/* Left Column: Google Calendar Weekday + Circular Date Number */}
                <div className="w-12 shrink-0 flex flex-col items-center pt-0.5 select-none sticky top-2">
                  <span
                    className={cn(
                      'text-[11px] font-bold uppercase',
                      isT
                        ? 'text-[#1A73E8] dark:text-[#8AB4F8]'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {weekdayShort}
                  </span>
                  <div
                    className={cn(
                      'mt-0.5 w-9 h-9 rounded-full flex items-center justify-center text-base font-extrabold',
                      isT
                        ? 'bg-[#1A73E8] text-white shadow-xs'
                        : 'text-slate-800 dark:text-slate-100'
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                </div>

                {/* Right Column: Chronological Google Calendar Event Blocks */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  {allDayHolidays.map((h) => (
                    <div
                      key={h.id}
                      className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border-l-4 border-l-rose-500 text-xs font-bold text-rose-700 dark:text-rose-300"
                    >
                      🎌 {h.class_name}
                    </div>
                  ))}

                  {timedSessions.length === 0 && allDayHolidays.length === 0 ? (
                    <div className="py-2 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                      <span>Không có lịch dạy</span>
                      <button
                        type="button"
                        onClick={() => onQuickCreate(dStr, '18:00', '19:30')}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#1A73E8] dark:text-[#8AB4F8] hover:bg-blue-50 dark:hover:bg-blue-950/40 inline-flex items-center gap-1"
                      >
                        <Plus size={12} />
                        <span>Thêm ca</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {timedSessions.map((session, idx) => {
                        const isSchool = session.type === 'school'
                        const isDuty = session.type === 'duty'
                        const isExtra = session.type === 'tutoring_extra'
                        const isCancelled = !!session.is_cancelled
                        const travel = travelNoticeAfterId.get(session.id)
                        const shiftNum = shiftMap.get(session.id)
                        const inlineStyle = getSessionInlineStyle(session, darkMode)
                        const visual = getSessionVisualStyle(session)
                        const cleanLoc = getCleanLocationText(session)
                        const grpKey = (session.session_group || 'morning') as TimeOfDayGroup
                        const grpMeta = GROUP_SHORT_META[grpKey]
                        const GrpIcon = grpMeta.icon

                        const prevSession = idx > 0 ? timedSessions[idx - 1] : null
                        const sMin = timeToMinutes(session.start_time)
                        const prevEndMin = prevSession ? timeToMinutes(prevSession.end_time) : -1
                        const showRedLineBefore =
                          isT &&
                          ((idx === 0 && nowMinutes < sMin) ||
                            (prevSession && nowMinutes >= prevEndMin && nowMinutes < sMin))

                        return (
                          <React.Fragment key={session.id}>
                            {/* Google Calendar Red Current-Time Line */}
                            {showRedLineBefore && (
                              <div className="flex items-center gap-1.5 py-0.5">
                                <span className="text-[10px] font-mono font-bold text-red-600 dark:text-red-400">
                                  {nowTimeStr}
                                </span>
                                <div className="w-2 h-2 rounded-full bg-red-600" />
                                <div className="flex-1 h-[1.5px] bg-red-600" />
                              </div>
                            )}

                            {/* 1. Compact School / Duty Pill */}
                            {isSchool || isDuty ? (
                              <div
                                onClick={(e) =>
                                  onSelectSession(session, e.currentTarget.getBoundingClientRect())
                                }
                                className="px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 border-l-4 border-l-slate-500 bg-slate-100/80 dark:bg-slate-800/50 cursor-pointer hover:shadow-xs transition-all flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-extrabold shrink-0">
                                    <School size={11} />
                                    {grpMeta.label}
                                  </span>
                                  <span className="text-xs tablet:text-sm font-extrabold text-slate-700 dark:text-slate-200 truncate">
                                    {session.class_name}
                                  </span>
                                </div>

                                <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                                  {session.start_time} – {session.end_time}
                                </span>
                              </div>
                            ) : (
                              /* 2. Google Calendar Tutoring Event Block */
                              <div
                                onClick={(e) =>
                                  onSelectSession(session, e.currentTarget.getBoundingClientRect())
                                }
                                style={inlineStyle}
                                className={cn(
                                  'px-3.5 py-2.5 rounded-xl border border-black/5 dark:border-white/10 border-l-4 transition-all cursor-pointer hover:shadow-md flex flex-col gap-1',
                                  isCancelled && 'opacity-65',
                                  session.has_conflict && !isCancelled && 'ring-2 ring-red-500'
                                )}
                              >
                                {/* Row 1: Shift Badge + Class Title + Time Range */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                                    {shiftNum && !isCancelled && (
                                      <span
                                        style={{
                                          backgroundColor: darkMode
                                            ? 'rgba(255,255,255,0.16)'
                                            : visual.badgeBgLight,
                                          color: darkMode ? '#FFFFFF' : visual.badgeTextLight,
                                        }}
                                        className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                                      >
                                        Ca {shiftNum}
                                      </span>
                                    )}
                                    {isExtra && !isCancelled && (
                                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-600 text-white shrink-0">
                                        {session.makeup_for
                                          ? 'Dạy bù'
                                          : session.is_moved
                                            ? 'Dời đến'
                                            : 'Phát sinh'}
                                      </span>
                                    )}
                                    {isCancelled && (
                                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 shrink-0">
                                        {session.is_moved ? 'Đã dời đi' : 'Đã hủy'}
                                      </span>
                                    )}

                                    <span
                                      className={cn(
                                        'text-sm font-extrabold leading-snug',
                                        isCancelled && 'line-through opacity-75'
                                      )}
                                    >
                                      {session.class_name}
                                    </span>
                                  </div>

                                  <span className="text-xs font-mono font-extrabold opacity-90 tabular-nums shrink-0 pt-0.5">
                                    {session.start_time} – {session.end_time}
                                  </span>
                                </div>

                                {/* Row 2: Time-of-day + Students + Clean Location */}
                                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11px] font-semibold opacity-85">
                                  <span className="inline-flex items-center gap-1">
                                    <GrpIcon size={11} />
                                    Buổi {grpMeta.label.toLowerCase()}
                                  </span>

                                  {session.student_count !== undefined &&
                                    session.student_count > 0 && (
                                      <span className="inline-flex items-center gap-1">
                                        <Users size={11} />
                                        {session.student_count} học sinh
                                      </span>
                                    )}

                                  {cleanLoc && (
                                    <span className="px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[10px] font-bold">
                                      {cleanLoc}
                                    </span>
                                  )}
                                </div>

                                {session.is_moved && session.moved_to_date && (
                                  <div className="flex items-center gap-1 text-xs font-bold text-purple-700 dark:text-purple-300 mt-0.5">
                                    <ArrowRight size={12} />
                                    <span>
                                      Dời sang {formatDateShort(session.moved_to_date)} lúc{' '}
                                      {session.moved_to_start}
                                    </span>
                                  </div>
                                )}

                                {session.has_conflict &&
                                  !isCancelled &&
                                  session.conflict_details && (
                                    <div className="flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400 mt-0.5">
                                      <AlertTriangle size={12} className="shrink-0" />
                                      <span>{session.conflict_details[0]}</span>
                                    </div>
                                  )}
                              </div>
                            )}

                            {travel && (
                              <div
                                className={cn(
                                  'mx-1 px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1.5 border border-dashed',
                                  travel.isTight
                                    ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold'
                                    : 'bg-slate-50 dark:bg-[#282A2E]/60 border-slate-200 dark:border-[#37393F] text-slate-600 dark:text-slate-400'
                                )}
                              >
                                <Car
                                  size={12}
                                  className={travel.isTight ? 'text-red-500' : 'text-slate-400'}
                                />
                                <span>
                                  Nghỉ chuyển ca: <strong>{travel.gapMinutes} phút</strong>
                                </span>
                              </div>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
