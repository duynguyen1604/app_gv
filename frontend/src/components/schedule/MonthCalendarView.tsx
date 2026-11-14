import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from 'date-fns'
import { VI_WEEKDAYS, dateToStr, formatFullDate } from '../../lib/dateUtils'
import { getSessionVisualStyle } from '../../lib/sessionStyles'
import { cn } from '../../lib/utils'
import { Modal } from '../ui/Modal'
import type { CalendarSession, Holiday } from '../../types'

interface MonthCalendarViewProps {
  currentDate: Date
  computeDaySessions: (dateStr: string) => CalendarSession[]
  holidays: Holiday[]
  onSelectSession: (session: CalendarSession, anchorRect?: DOMRect) => void
  onSwitchToDay: (day: Date) => void
  onQuickCreate: (dateStr: string, startTime: string, endTime: string) => void
}

export function MonthCalendarView({
  currentDate,
  computeDaySessions,
  holidays,
  onSelectSession,
  onSwitchToDay,
  onQuickCreate,
}: MonthCalendarViewProps) {
  const [expandedDay, setExpandedDay] = useState<Date | null>(null)

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const expandedDateStr = expandedDay ? dateToStr(expandedDay) : ''
  const expandedSessions = useMemo(
    () => (expandedDateStr ? computeDaySessions(expandedDateStr) : []),
    [expandedDateStr, computeDaySessions]
  )

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#1E1F22] border-t border-gray-200 dark:border-[#2D2F34] select-none overflow-hidden">
      {/* Weekday Header */}
      <div className="grid grid-cols-7 divide-x divide-gray-200/70 dark:divide-[#2D2F34] border-b border-gray-200/80 dark:border-[#2D2F34] bg-gray-50/50 dark:bg-[#282A2E]/40 shrink-0">
        {VI_WEEKDAYS.map(wd => (
          <div
            key={wd}
            className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Month Grid Cells */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr divide-x divide-y divide-gray-200/70 dark:divide-[#2D2F34] overflow-y-auto">
        {monthDays.map(day => {
          const dStr = dateToStr(day)
          const inMonth = isSameMonth(day, currentDate)
          const isT = isToday(day)
          const holiday = holidays.find(h => h.date === dStr)
          const allSessions = computeDaySessions(dStr).filter(
            s => !(s.start_time === '00:00' && s.end_time === '23:59')
          )
          const visibleChips = allSessions.slice(0, 3)
          const extraCount = allSessions.length - visibleChips.length

          return (
            <div
              key={dStr}
              onClick={() => onQuickCreate(dStr, '18:00', '19:30')}
              className={cn(
                'min-h-[96px] tablet:min-h-[116px] p-1.5 flex flex-col transition-colors cursor-pointer hover:bg-gray-50/70 dark:hover:bg-[#282A2E]/40',
                !inMonth && 'bg-gray-50/50 dark:bg-[#131314]/40 text-gray-400',
                holiday && 'bg-gray-100/70 dark:bg-[#282A2E]/60'
              )}
            >
              {/* Top Row: Day number (click switches to Day View) */}
              <div className="flex items-center justify-between mb-1">
                {holiday ? (
                  <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 truncate max-w-[70%]">
                    🎌 {holiday.note}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onSwitchToDay(day)
                  }}
                  title={`Chuyển sang chế độ xem Ngày ${format(day, 'dd/MM/yyyy')}`}
                  className={cn(
                    'w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors',
                    isT
                      ? 'bg-[#1A73E8] text-white shadow-xs'
                      : inMonth
                        ? 'text-gray-800 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-[#313338]'
                        : 'text-gray-400 dark:text-gray-600 hover:bg-gray-200/50'
                  )}
                >
                  {format(day, 'd')}
                </button>
              </div>

              {/* Session Chips (Max 3) */}
              <div className="flex flex-col gap-1 flex-1">
                {visibleChips.map(s => {
                  const isCancelled = !!s.is_cancelled
                  const visual = getSessionVisualStyle(s)

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        onSelectSession(s, e.currentTarget.getBoundingClientRect())
                      }}
                      className={cn(
                        'w-full px-1.5 py-0.5 rounded text-left text-[11px] flex items-center gap-1.5 truncate transition-colors',
                        isCancelled
                          ? 'text-gray-400 line-through bg-gray-100/70 dark:bg-gray-800/50'
                          : 'hover:bg-slate-100 dark:hover:bg-[#313338] text-slate-800 dark:text-slate-100',
                        s.has_conflict && !isCancelled && 'ring-1 ring-red-500 bg-red-50/60 dark:bg-red-950/30'
                      )}
                    >
                      <span
                        style={{ backgroundColor: isCancelled ? '#9CA3AF' : visual.dotColor }}
                        className="w-2 h-2 rounded-full shrink-0"
                      />
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0 font-semibold">
                        {s.start_time}
                      </span>
                      <span className="font-bold truncate">{s.class_name}</span>
                    </button>
                  )
                })}

                {extraCount > 0 && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      setExpandedDay(day)
                    }}
                    className="text-[11px] font-bold text-[#1A73E8] dark:text-[#8AB4F8] hover:underline text-left px-1.5 py-0.5"
                  >
                    +{extraCount} nữa
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal for "+X nữa" Day Sessions List */}
      <Modal
        open={!!expandedDay}
        onClose={() => setExpandedDay(null)}
        title={expandedDay ? formatFullDate(expandedDay) : 'Danh sách buổi học'}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          {expandedSessions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setExpandedDay(null)
                onSelectSession(s)
              }}
              className="p-3 rounded-xl border border-gray-200 dark:border-[#37393F] text-left hover:bg-gray-50 dark:hover:bg-[#282A2E] flex items-center justify-between gap-2"
            >
              <div>
                <div className={cn('font-bold text-sm', s.is_cancelled && 'line-through text-gray-400')}>
                  {s.period_code ? `[${s.period_code}] ` : ''}
                  {s.class_name}
                </div>
                {s.location && <div className="text-xs text-gray-500 mt-0.5">📍 {s.location}</div>}
              </div>
              <div className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                {s.start_time}–{s.end_time}
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

