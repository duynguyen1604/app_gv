import React, { useState, useEffect, useRef, useMemo } from 'react'
import { format, isToday } from 'date-fns'
import {
  Sunrise,
  Sun,
  Moon,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  Users,
  GripHorizontal,
} from 'lucide-react'
import {
  VI_WEEKDAYS,
  dateToWeekday,
  dateToStr,
  timeToMinutes,
  formatDateShort,
} from '../../lib/dateUtils'
import { timeGroupLabel } from '../../lib/schoolPeriods'
import { getSessionInlineStyle, getSessionVisualStyle } from '../../lib/sessionStyles'
import { useAppStore } from '../../store/useAppStore'
import { cn } from '../../lib/utils'
import type {
  CalendarSession,
  Holiday,
  Settings,
  TimeOfDayFilter,
} from '../../types'
import toast from 'react-hot-toast'

interface TimeGridCalendarProps {
  days: Date[]
  sessionsByDay: Record<string, CalendarSession[]>
  holidays: Holiday[]
  settings: Settings
  timeFilter: TimeOfDayFilter
  onSelectSession: (session: CalendarSession, anchorRect?: DOMRect) => void
  onSelectDayHeader?: (day: Date) => void
  onQuickCreate: (dateStr: string, startTime: string, endTime: string, anchorRect?: DOMRect) => void
  onRequestMoveSession: (
    session: CalendarSession,
    targetDateStr: string,
    newStartTime: string,
    newEndTime: string
  ) => void
  onResizeSession: (session: CalendarSession, newEndTime: string) => void
}

interface PositionedSession {
  session: CalendarSession
  colIndex: number
  colCount: number
}

function minutesToHHmm(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 45, Math.round(totalMinutes / 15) * 15))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Compute side-by-side column positions for overlapping sessions within a day (Google Calendar style)
 */
function layoutOverlappingSessions(sessions: CalendarSession[]): PositionedSession[] {
  const timed = sessions.filter(s => !(s.start_time === '00:00' && s.end_time === '23:59'))
  if (timed.length === 0) return []

  const sorted = [...timed].sort((a, b) => {
    const diff = timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
    if (diff !== 0) return diff
    return timeToMinutes(b.end_time) - timeToMinutes(a.end_time)
  })

  // Group into connected overlap clusters
  const clusters: CalendarSession[][] = []
  let currentCluster: CalendarSession[] = []
  let clusterMaxEnd = -1

  for (const s of sorted) {
    const start = timeToMinutes(s.start_time)
    const end = Math.max(start + 30, timeToMinutes(s.end_time))
    if (currentCluster.length === 0 || start < clusterMaxEnd) {
      currentCluster.push(s)
      clusterMaxEnd = Math.max(clusterMaxEnd, end)
    } else {
      clusters.push(currentCluster)
      currentCluster = [s]
      clusterMaxEnd = end
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster)

  const result: PositionedSession[] = []

  for (const cluster of clusters) {
    const columns: CalendarSession[][] = []
    const itemColMap = new Map<string, number>()

    for (const s of cluster) {
      const sStart = timeToMinutes(s.start_time)
      let placedCol = -1
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1]
        const lastEnd = Math.max(
          timeToMinutes(lastInCol.start_time) + 25,
          timeToMinutes(lastInCol.end_time)
        )
        if (sStart >= lastEnd) {
          columns[c].push(s)
          placedCol = c
          break
        }
      }
      if (placedCol === -1) {
        columns.push([s])
        placedCol = columns.length - 1
      }
      itemColMap.set(s.id, placedCol)
    }

    const totalCols = columns.length
    for (const s of cluster) {
      result.push({
        session: s,
        colIndex: itemColMap.get(s.id) ?? 0,
        colCount: totalCols,
      })
    }
  }

  return result
}

export function TimeGridCalendar({
  days,
  sessionsByDay,
  holidays,
  settings,
  timeFilter,
  onSelectSession,
  onSelectDayHeader,
  onQuickCreate,
  onRequestMoveSession,
  onResizeSession,
}: TimeGridCalendarProps) {
  const darkMode = useAppStore(s => s.darkMode)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const dayColumnsRef = useRef<(HTMLDivElement | null)[]>([])

  const [allDayExpanded, setAllDayExpanded] = useState(true)
  const [noonCollapsed, setNoonCollapsed] = useState(() => !!settings.collapse_empty_noon)
  const [now, setNow] = useState(() => new Date())

  // Update current time red line every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Determine hour range based on settings, timeFilter, and actual sessions
  const afternoonHour = Math.floor(timeToMinutes(settings.afternoon_start || '12:00') / 60)
  const eveningHour = Math.floor(timeToMinutes(settings.evening_start || '17:00') / 60)

  const { startHour, endHour, pxPerHour } = useMemo(() => {
    let baseStart = settings.day_start_hour ?? 6
    let baseEnd = settings.day_end_hour ?? 22
    const basePx = settings.calendar_density === 'compact' ? 50 : 62

    if (timeFilter === 'morning') {
      baseStart = 6
      baseEnd = afternoonHour
    } else if (timeFilter === 'afternoon') {
      baseStart = afternoonHour
      baseEnd = eveningHour
    } else if (timeFilter === 'evening') {
      baseStart = eveningHour
      baseEnd = 23
    }

    // Auto-expand if any visible session falls outside [baseStart, baseEnd]
    for (const d of days) {
      const list = sessionsByDay[dateToStr(d)] || []
      for (const s of list) {
        if (s.start_time === '00:00' && s.end_time === '23:59') continue
        const sH = Math.floor(timeToMinutes(s.start_time) / 60)
        const eH = Math.ceil(timeToMinutes(s.end_time) / 60)
        if (timeFilter === 'all') {
          if (sH < baseStart) baseStart = Math.max(0, sH)
          if (eH > baseEnd) baseEnd = Math.min(24, eH)
        }
      }
    }

    return {
      startHour: baseStart,
      endHour: Math.max(baseStart + 4, baseEnd),
      // Zoom in when a specific time-of-day filter is active
      pxPerHour: timeFilter !== 'all' ? Math.round(basePx * 1.25) : basePx,
    }
  }, [days, sessionsByDay, settings, timeFilter, afternoonHour, eveningHour])

  // Check if noon (11:30 - 13:30) is completely empty across displayed days
  const isNoonEmpty = useMemo(() => {
    for (const d of days) {
      const list = sessionsByDay[dateToStr(d)] || []
      for (const s of list) {
        if (s.start_time === '00:00') continue
        const sm = timeToMinutes(s.start_time)
        const em = timeToMinutes(s.end_time)
        if (sm < 13 * 60 + 30 && em > 11 * 60 + 30) return false
      }
    }
    return true
  }, [days, sessionsByDay])

  const effectiveNoonCollapse = noonCollapsed && isNoonEmpty && timeFilter === 'all' && startHour <= 11 && endHour >= 14

  const hours = useMemo(() => {
    const arr: number[] = []
    for (let h = startHour; h < endHour; h++) {
      arr.push(h)
    }
    return arr
  }, [startHour, endHour])

  // Helper to convert minutes-from-midnight to Y pixel position
  const minutesToY = (mins: number): number => {
    const clamped = Math.max(startHour * 60, Math.min(endHour * 60, mins))
    let offsetMin = clamped - startHour * 60
    if (effectiveNoonCollapse) {
      // Compress 12:00 - 13:00 (60 mins) into 20 mins height
      if (clamped >= 13 * 60) {
        offsetMin -= 40
      } else if (clamped > 12 * 60) {
        offsetMin = 12 * 60 - startHour * 60 + (clamped - 12 * 60) * (20 / 60)
      }
    }
    return (offsetMin / 60) * pxPerHour
  }

  // Helper to convert Y pixel position inside column to minutes-from-midnight
  const yToMinutes = (y: number): number => {
    const rawMin = (y / pxPerHour) * 60
    let mins = startHour * 60 + rawMin
    if (effectiveNoonCollapse) {
      const noonStartY = ((12 * 60 - startHour * 60) / 60) * pxPerHour
      const noonEndY = noonStartY + (20 / 60) * pxPerHour
      if (y >= noonEndY) {
        mins += 40
      } else if (y > noonStartY) {
        mins = 12 * 60 + ((y - noonStartY) / (noonEndY - noonStartY)) * 60
      }
    }
    return Math.max(startHour * 60, Math.min(endHour * 60, Math.round(mins / 15) * 15))
  }

  const totalGridHeight = minutesToY(endHour * 60)

  // Auto-scroll to current time or 07:00 on mount
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const targetMin = nowMin >= startHour * 60 && nowMin <= endHour * 60 ? Math.max(startHour * 60, nowMin - 75) : 7 * 60
    const y = Math.max(0, minutesToY(targetMin))
    el.scrollTop = y
  }, [startHour, timeFilter])

  // --- Drag Selection State (create extra session by dragging empty space) ---
  const [dragCreate, setDragCreate] = useState<{
    dayIdx: number
    dateStr: string
    startMin: number
    endMin: number
  } | null>(null)

  // --- Drag Move / Resize State ---
  const [dragMove, setDragMove] = useState<{
    session: CalendarSession
    targetDayIdx: number
    targetDateStr: string
    startMin: number
    endMin: number
    mode: 'move' | 'resize'
  } | null>(null)

  // Mouse handlers for Drag Create, Drag Move, and Resize
  useEffect(() => {
    if (!dragCreate && !dragMove) return

    const handleMouseMove = (e: MouseEvent) => {
      if (dragCreate) {
        const colEl = dayColumnsRef.current[dragCreate.dayIdx]
        if (!colEl) return
        const rect = colEl.getBoundingClientRect()
        const relY = e.clientY - rect.top
        const curMin = yToMinutes(relY)
        setDragCreate(prev => (prev ? { ...prev, endMin: curMin } : null))
      } else if (dragMove) {
        const duration = timeToMinutes(dragMove.session.end_time) - timeToMinutes(dragMove.session.start_time)
        if (dragMove.mode === 'resize') {
          const colEl = dayColumnsRef.current[dragMove.targetDayIdx]
          if (!colEl) return
          const rect = colEl.getBoundingClientRect()
          const relY = e.clientY - rect.top
          const newEnd = Math.max(dragMove.startMin + 30, yToMinutes(relY))
          setDragMove(prev => (prev ? { ...prev, endMin: newEnd } : null))
        } else {
          // Find which day column the cursor is over
          let hoveredIdx = dragMove.targetDayIdx
          dayColumnsRef.current.forEach((colEl, idx) => {
            if (!colEl) return
            const r = colEl.getBoundingClientRect()
            if (e.clientX >= r.left && e.clientX <= r.right) {
              hoveredIdx = idx
            }
          })
          const colEl = dayColumnsRef.current[hoveredIdx]
          if (!colEl) return
          const rect = colEl.getBoundingClientRect()
          const relY = e.clientY - rect.top
          const newStart = Math.min(endHour * 60 - duration, Math.max(startHour * 60, yToMinutes(relY) - 30))
          setDragMove(prev =>
            prev
              ? {
                  ...prev,
                  targetDayIdx: hoveredIdx,
                  targetDateStr: dateToStr(days[hoveredIdx]),
                  startMin: newStart,
                  endMin: newStart + duration,
                }
              : null
          )
        }
      }
    }

    const handleMouseUp = () => {
      if (dragCreate) {
        const sMin = Math.min(dragCreate.startMin, dragCreate.endMin)
        const eMin = Math.max(dragCreate.startMin, dragCreate.endMin)
        const finalEnd = eMin - sMin < 30 ? sMin + 90 : eMin
        onQuickCreate(
          dragCreate.dateStr,
          minutesToHHmm(sMin),
          minutesToHHmm(finalEnd)
        )
        setDragCreate(null)
      } else if (dragMove) {
        const origStart = timeToMinutes(dragMove.session.start_time)
        const origEnd = timeToMinutes(dragMove.session.end_time)
        const changed =
          dragMove.targetDateStr !== dragMove.session.date ||
          dragMove.startMin !== origStart ||
          dragMove.endMin !== origEnd

        if (changed) {
          if (dragMove.mode === 'resize') {
            onResizeSession(dragMove.session, minutesToHHmm(dragMove.endMin))
          } else {
            onRequestMoveSession(
              dragMove.session,
              dragMove.targetDateStr,
              minutesToHHmm(dragMove.startMin),
              minutesToHHmm(dragMove.endMin)
            )
          }
        }
        setDragMove(null)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragCreate, dragMove, days, startHour, endHour, pxPerHour, effectiveNoonCollapse])

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showNowLine = nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
  const nowLineY = showNowLine ? minutesToY(nowMinutes) : 0

  const showOverlay = settings.show_session_overlay !== false
  const afternoonStartMin = timeToMinutes(settings.afternoon_start || '12:00')
  const eveningStartMin = timeToMinutes(settings.evening_start || '17:00')

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-[#1E1F22] border-t border-gray-200/80 dark:border-[#2D2F34] select-none overflow-hidden">
      {/* Scrollable Container (Vertical + Horizontal on narrow mobile multi-day views) */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto relative scrollbar-thin"
      >
        <div className="flex flex-col min-w-full">
          {/* Sticky Day Column Headers + All-Day Row */}
          <div className="sticky top-0 shrink-0 border-b border-gray-200 dark:border-[#2D2F34] bg-white dark:bg-[#1E1F22] z-30">
            {/* Row 1: Weekday + Date Number */}
            <div className="flex">
              {/* Left gutter above hour labels */}
              <div className="sticky left-0 z-40 bg-white dark:bg-[#1E1F22] w-11 tablet:w-16 shrink-0 border-r border-gray-200/70 dark:border-[#2D2F34] flex flex-col items-center justify-end pb-1.5 text-[9px] tablet:text-[10px] text-gray-400 font-medium">
                <span>GMT+7</span>
              </div>

              {/* Day Header Cells */}
              <div
                className="flex-1 grid divide-x divide-gray-200/70 dark:divide-[#2D2F34]"
                style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
              >
                {days.map(day => {
                  const dStr = dateToStr(day)
                  const wdIdx = dateToWeekday(day) - 1
                  const isT = isToday(day)
                  const holiday = holidays.find(h => h.date === dStr)

                  return (
                    <div
                      key={dStr}
                      className={cn(
                        'py-1.5 tablet:py-2 px-0.5 tablet:px-1 flex flex-col items-center justify-center transition-colors',
                        holiday && 'bg-gray-100/70 dark:bg-[#282A2E]/60'
                      )}
                    >
                      <span
                        className={cn(
                          'text-[10px] tablet:text-[11px] font-bold uppercase tracking-tight',
                          isT
                            ? 'text-[#1A73E8] dark:text-[#8AB4F8]'
                            : 'text-gray-500 dark:text-gray-400'
                        )}
                      >
                        {VI_WEEKDAYS[wdIdx]}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectDayHeader?.(day)}
                        title={`Xem chi tiết ngày ${format(day, 'dd/MM/yyyy')}`}
                        className={cn(
                          'mt-0.5 w-7 h-7 tablet:w-9 tablet:h-9 rounded-full flex items-center justify-center text-xs tablet:text-lg font-extrabold transition-all',
                          isT
                            ? 'bg-[#1A73E8] text-white shadow-xs hover:bg-[#1557B0]'
                            : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#282A2E]'
                        )}
                      >
                        {format(day, 'd')}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Row 2: All-Day Row ("Cả ngày" - Holidays & All-day notes) */}
            <div className="flex border-t border-gray-100 dark:border-[#282A2E]">
              <div className="sticky left-0 z-40 bg-white dark:bg-[#1E1F22] w-11 tablet:w-16 shrink-0 border-r border-gray-200/70 dark:border-[#2D2F34] px-1 py-1 flex items-center justify-between text-[9px] tablet:text-[10px] text-gray-400">
                <span className="truncate">Cả ngày</span>
                <button
                  type="button"
                  onClick={() => setAllDayExpanded(!allDayExpanded)}
                  aria-label="Thu gọn hoặc mở rộng hàng cả ngày"
                  className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {allDayExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              </div>

              {allDayExpanded && (
                <div
                  className="flex-1 grid divide-x divide-gray-200/70 dark:divide-[#2D2F34] min-h-[26px]"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  {days.map(day => {
                    const dStr = dateToStr(day)
                    const holiday = holidays.find(h => h.date === dStr)
                    return (
                      <div
                        key={dStr}
                        className={cn(
                          'p-1 flex flex-col gap-0.5',
                          holiday && 'bg-gray-100/70 dark:bg-[#282A2E]/60'
                        )}
                      >
                        {holiday && (
                          <div className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-[10px] font-semibold truncate border-l-2 border-rose-500">
                            🎌 {holiday.note}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Continuous Time Axis + Columns */}
          <div className="flex relative" style={{ height: `${totalGridHeight}px` }}>
            {/* Left Hour Column */}
            <div className="sticky left-0 w-11 tablet:w-16 shrink-0 border-r border-gray-200/70 dark:border-[#2D2F34] relative bg-white dark:bg-[#1E1F22] z-20">
            {hours.map(hour => {
              const y = minutesToY(hour * 60)
              const hourMin = hour * 60
              const isMorningStart = hour === startHour && hourMin < afternoonStartMin
              const isAfternoonStart =
                hourMin === afternoonStartMin || (hour === startHour && hourMin >= afternoonStartMin && hourMin < eveningStartMin)
              const isEveningStart =
                hourMin === eveningStartMin || (hour === startHour && hourMin >= eveningStartMin)

              if (effectiveNoonCollapse && hour === 12) {
                return (
                  <div
                    key={hour}
                    style={{ top: `${y}px` }}
                    className="absolute inset-x-0 flex items-center justify-center"
                  >
                    <button
                      type="button"
                      onClick={() => setNoonCollapsed(false)}
                      title="Mở rộng khung giờ nghỉ trưa 12:00–13:00"
                      className="text-[9px] bg-gray-100 dark:bg-[#282A2E] text-gray-500 px-1.5 py-0.5 rounded-full hover:bg-blue-50 hover:text-blue-600 border border-gray-200 dark:border-[#37393F]"
                    >
                      12h ↕
                    </button>
                  </div>
                )
              }

              return (
                <div
                  key={hour}
                  style={{ top: `${y}px` }}
                  className="absolute inset-x-0 pr-1 tablet:pr-1.5 text-right pointer-events-none"
                >
                  <span className="text-[10px] tablet:text-[11px] font-mono text-gray-400 dark:text-gray-500 -top-2 relative">
                    {hour > startHour ? `${String(hour).padStart(2, '0')}:00` : ''}
                  </span>

                  {/* Sáng / Chiều / Tối Secondary Layer Label (Section 5.6) */}
                  {showOverlay && isMorningStart && (
                    <div className="hidden tablet:inline-flex mt-0.5 items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/40">
                      <Sunrise size={10} /> Sáng
                    </div>
                  )}
                  {showOverlay && isAfternoonStart && (
                    <div className="hidden tablet:inline-flex mt-0.5 items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-semibold text-orange-700 dark:text-orange-400 bg-orange-50/80 dark:bg-orange-950/40">
                      <Sun size={10} /> Chiều
                    </div>
                  )}
                  {showOverlay && isEveningStart && (
                    <div className="hidden tablet:inline-flex mt-0.5 items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/40">
                      <Moon size={10} /> Tối
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Day Columns Container */}
          <div
            className="flex-1 grid divide-x divide-slate-200/80 dark:divide-[#2D2F34] relative bg-white dark:bg-[#1E1F22]"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {/* Horizontal Hour Grid Lines */}
            <div className="absolute inset-0 pointer-events-none z-0">
              {hours.map(hour => {
                const y = minutesToY(hour * 60)
                const halfY = minutesToY(hour * 60 + 30)
                const isBoundaryHour =
                  hour * 60 === afternoonStartMin || hour * 60 === eveningStartMin
                return (
                  <React.Fragment key={hour}>
                    <div
                      style={{ top: `${y}px` }}
                      className={cn(
                        'absolute inset-x-0 border-t',
                        isBoundaryHour
                          ? 'border-slate-300 dark:border-slate-700'
                          : 'border-slate-200/75 dark:border-[#2D2F34]'
                      )}
                    />
                    {!effectiveNoonCollapse || hour !== 12 ? (
                      <div
                        style={{ top: `${halfY}px` }}
                        className="absolute inset-x-0 border-t border-dashed border-slate-100 dark:border-[#25272C]"
                      />
                    ) : null}
                  </React.Fragment>
                )
              })}
            </div>

            {/* Individual Day Columns */}
            {days.map((day, dayIdx) => {
              const dStr = dateToStr(day)
              const isT = isToday(day)
              const holiday = holidays.find(h => h.date === dStr)
              const daySessions = sessionsByDay[dStr] || []
              const positioned = layoutOverlappingSessions(daySessions)

              return (
                <div
                  key={dStr}
                  ref={el => {
                    dayColumnsRef.current[dayIdx] = el
                  }}
                  onMouseDown={e => {
                    // Only start drag-create when clicking directly on the empty column background
                    if (e.button !== 0) return
                    if ((e.target as HTMLElement).closest('[data-session-block="true"]')) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const relY = e.clientY - rect.top
                    const clickedMin = yToMinutes(relY)
                    setDragCreate({
                      dayIdx,
                      dateStr: dStr,
                      startMin: clickedMin,
                      endMin: clickedMin + 60,
                    })
                  }}
                  className={cn(
                    'relative h-full z-10 cursor-Crosshair',
                    holiday && 'bg-gray-100/60 dark:bg-[#282A2E]/45',
                    isT && !holiday && 'bg-blue-50/15 dark:bg-blue-950/10'
                  )}
                >
                  {/* Current Time Red Line on Today's column (Section 5.3) */}
                  {isT && showNowLine && (
                    <div
                      style={{ top: `${nowLineY}px` }}
                      className="absolute inset-x-0 z-30 pointer-events-none flex items-center"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600 -ml-1.5 shadow-sm" />
                      <div className="flex-1 h-[2px] bg-red-600 shadow-xs" />
                    </div>
                  )}

                  {/* Drag-to-Create Selection Preview */}
                  {dragCreate && dragCreate.dayIdx === dayIdx && (
                    <div
                      style={{
                        top: `${minutesToY(Math.min(dragCreate.startMin, dragCreate.endMin))}px`,
                        height: `${Math.max(
                          24,
                          minutesToY(Math.max(dragCreate.startMin, dragCreate.endMin)) -
                            minutesToY(Math.min(dragCreate.startMin, dragCreate.endMin))
                        )}px`,
                      }}
                      className="absolute inset-x-1 z-30 rounded-lg bg-purple-600/25 border-2 border-purple-600 px-2 py-1 text-xs font-bold text-purple-900 dark:text-purple-100 pointer-events-none shadow-md"
                    >
                      + Buổi phát sinh ({minutesToHHmm(Math.min(dragCreate.startMin, dragCreate.endMin))} –{' '}
                      {minutesToHHmm(Math.max(dragCreate.startMin + 30, dragCreate.endMin))})
                    </div>
                  )}

                  {/* Drag-to-Move Ghost Preview */}
                  {dragMove && dragMove.targetDayIdx === dayIdx && (
                    <div
                      style={{
                        top: `${minutesToY(dragMove.startMin)}px`,
                        height: `${Math.max(24, minutesToY(dragMove.endMin) - minutesToY(dragMove.startMin))}px`,
                      }}
                      className="absolute inset-x-1 z-30 rounded-lg bg-orange-500/30 border-2 border-dashed border-orange-600 px-2 py-1 text-xs font-bold text-orange-950 dark:text-orange-100 pointer-events-none shadow-lg"
                    >
                      <div>{dragMove.session.class_name}</div>
                      <div className="font-mono text-[10px]">
                        {minutesToHHmm(dragMove.startMin)} – {minutesToHHmm(dragMove.endMin)}
                      </div>
                    </div>
                  )}

                  {/* Subtle Morning Long Break Band (08:40 - 09:10) when day has unmerged morning school periods (Group B1) */}
                  {daySessions.some(s => s.type === 'school' && s.session_group === 'morning') &&
                    !daySessions.some(s => s.type === 'school' && s.start_time <= '08:40' && s.end_time >= '09:10') &&
                    startHour * 60 <= 8 * 60 + 40 &&
                    endHour * 60 >= 9 * 60 + 10 && (
                      <div
                        style={{
                          top: `${minutesToY(8 * 60 + 40)}px`,
                          height: `${Math.max(14, minutesToY(9 * 60 + 10) - minutesToY(8 * 60 + 40))}px`,
                        }}
                        className="absolute inset-x-1 z-5 rounded bg-amber-50/70 dark:bg-amber-950/25 border border-dashed border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-[9px] font-medium text-amber-700 dark:text-amber-300 pointer-events-none overflow-hidden px-1"
                      >
                        <span className="truncate block text-center w-full">
                          {days.length > 4 ? 'Ra chơi 08:40' : 'Ra chơi dài (08:40–09:10)'}
                        </span>
                      </div>
                    )}

                  {/* Positioned Event Blocks */}
                  {positioned.map(({ session, colIndex, colCount }) => {
                    const sMin = timeToMinutes(session.start_time)
                    const eMin = Math.max(sMin + 30, timeToMinutes(session.end_time))
                    const top = minutesToY(sMin)
                    const height = Math.max(22, minutesToY(eMin) - top - 1)
                    const isShort = height < 42
                    const isCompact = height < 62

                    const widthPct = 100 / colCount
                    const leftPct = colIndex * widthPct

                    const isSchool = session.type === 'school'
                    const isDuty = session.type === 'duty'
                    const isExtra = session.type === 'tutoring_extra'
                    const isCancelled = !!session.is_cancelled
                    const isMovedOrigin = session.type === 'tutoring_moved_away'
                    const canDragMove =
                      !isCancelled && (session.type === 'tutoring_fixed' || session.type === 'tutoring_extra')

                    // Tooltip summary for desktop hover
                    const tooltipText = [
                      `${session.period_code ? `[${session.period_code}] ` : ''}${session.class_name}`,
                      `Giờ: ${session.start_time} – ${session.end_time}`,
                      session.subject ? `Môn: ${session.subject}` : '',
                      session.location ? `Địa điểm: ${session.location}` : '',
                      session.student_count !== undefined ? `Sĩ số: ${session.student_count} học sinh` : '',
                      session.has_conflict && session.conflict_details
                        ? `⚠️ CẢNH BÁO TRÙNG: ${session.conflict_details.join(', ')}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join('\n')

                    return (
                      <div
                        key={session.id}
                        data-session-block="true"
                        title={tooltipText}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          ...getSessionInlineStyle(session, darkMode),
                        }}
                        onClick={e => {
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          onSelectSession(session, rect)
                        }}
                        onMouseDown={e => {
                          if (e.button !== 0) return
                          e.stopPropagation()
                          if (isSchool || isDuty) {
                            return
                          }
                          if (!canDragMove) return
                          // Start move on drag if moved more than 5px
                          const startX = e.clientX
                          const startY = e.clientY
                          const handleInitialMove = (moveEv: MouseEvent) => {
                            if (
                              Math.abs(moveEv.clientX - startX) > 6 ||
                              Math.abs(moveEv.clientY - startY) > 6
                            ) {
                              window.removeEventListener('mousemove', handleInitialMove)
                              window.removeEventListener('mouseup', cancelInitialMove)
                              setDragMove({
                                session,
                                targetDayIdx: dayIdx,
                                targetDateStr: dStr,
                                startMin: sMin,
                                endMin: eMin,
                                mode: 'move',
                              })
                            }
                          }
                          const cancelInitialMove = () => {
                            window.removeEventListener('mousemove', handleInitialMove)
                            window.removeEventListener('mouseup', cancelInitialMove)
                          }
                          window.addEventListener('mousemove', handleInitialMove)
                          window.addEventListener('mouseup', cancelInitialMove)
                        }}
                        onDoubleClick={e => {
                          e.stopPropagation()
                          if (isSchool || isDuty) {
                            toast('Lịch trường cố định: sửa trong chế độ "Bảng tiết của trường" hoặc Cài đặt', {
                              icon: '🏫',
                            })
                          }
                        }}
                        className={cn(
                          'absolute rounded-lg px-2 py-1.5 text-left overflow-hidden transition-shadow duration-150 cursor-pointer select-none group border border-black/5 dark:border-white/10 border-l-4 shadow-xs hover:shadow-md',
                          isCancelled && 'opacity-70',
                          // Conflict Red Warning Border (Section 5.1 & 5.3)
                          session.has_conflict && !isCancelled && 'ring-2 ring-red-600 dark:ring-red-500 z-20'
                        )}
                      >
                        {/* Short Block (< 42px): Single-line compact layout */}
                        {isShort ? (
                          <div className="flex items-center justify-between gap-1 text-[11px] leading-none truncate">
                            <span className={cn('font-extrabold truncate', isCancelled && 'line-through')}>
                              {isSchool ? '🏫 ' : ''}
                              {session.class_name}
                            </span>
                            <span className="text-[10px] font-mono font-bold opacity-85 shrink-0">
                              {session.start_time}
                            </span>
                          </div>
                        ) : (
                          /* Standard / Tall Block */
                          <div className="flex flex-col h-full justify-between">
                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <span
                                  className={cn(
                                    'text-xs font-extrabold leading-snug break-words line-clamp-2',
                                    isCancelled && 'line-through'
                                  )}
                                >
                                  {isSchool ? '🏫 ' : ''}
                                  {session.class_name}
                                </span>
                                {session.has_conflict && !isCancelled && (
                                  <AlertTriangle
                                    size={12}
                                    className="text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                                  />
                                )}
                              </div>

                              {/* Time + Badges */}
                              <div className="flex items-center flex-wrap gap-1 mt-0.5">
                                <span className="text-[10px] font-mono font-bold opacity-90">
                                  {session.start_time}–{session.end_time}
                                </span>

                                {isDuty && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                    Trực
                                  </span>
                                )}
                                {isExtra && !isCancelled && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-purple-600 text-white">
                                    {session.makeup_for ? 'Bù' : session.is_moved ? 'Dời đến' : 'Phát sinh'}
                                  </span>
                                )}
                                {isCancelled && !isMovedOrigin && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 no-underline">
                                    Đã hủy
                                  </span>
                                )}
                                {session.guest_count !== undefined && session.guest_count > 0 && (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-900/70 text-purple-800 dark:text-purple-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600 inline-block" />
                                    +{session.guest_count} ghép
                                  </span>
                                )}
                              </div>

                              {/* Moved away arrow (Section 5.3) */}
                              {isMovedOrigin && session.moved_to_date && (
                                <div className="flex items-center gap-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300 mt-0.5 truncate">
                                  <ArrowRight size={10} className="shrink-0" />
                                  <span className="truncate">
                                    Dời {formatDateShort(session.moved_to_date)} {session.moved_to_start}
                                  </span>
                                </div>
                              )}

                              {/* Location & Student count if tall enough */}
                              {!isCompact && !isSchool && (
                                <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-semibold opacity-85">
                                  {session.student_count !== undefined && session.student_count > 0 && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Users size={9} className="shrink-0" />
                                      {session.student_count} HS
                                    </span>
                                  )}
                                  {session.location && (
                                    <span className="inline-flex items-center gap-0.5 truncate">
                                      <MapPin size={9} className="shrink-0" />
                                      <span className="truncate">{session.location}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Bottom Resize Handle for Tutoring/Extra blocks (Section 5.4) */}
                            {canDragMove && (
                              <div
                                onMouseDown={e => {
                                  e.stopPropagation()
                                  setDragMove({
                                    session,
                                    targetDayIdx: dayIdx,
                                    targetDateStr: dStr,
                                    startMin: sMin,
                                    endMin: eMin,
                                    mode: 'resize',
                                  })
                                }}
                                title="Kéo cạnh dưới để đổi giờ kết thúc"
                                className="h-2 -mx-1.5 -mb-1 cursor-ns-resize opacity-0 group-hover:opacity-100 flex items-center justify-center bg-black/5 dark:bg-white/10 transition-opacity"
                              >
                                <GripHorizontal size={10} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

