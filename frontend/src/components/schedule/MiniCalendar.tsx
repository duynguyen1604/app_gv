import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { VI_WEEKDAYS, dateToStr } from '../../lib/dateUtils'
import { cn } from '../../lib/utils'

interface MiniCalendarProps {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  highlightedWeekStart?: Date
  datesWithSessions?: Set<string>
  className?: string
}

export function MiniCalendar({
  selectedDate,
  onSelectDate,
  highlightedWeekStart,
  datesWithSessions,
  className,
}: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate))

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth)
    const monthEnd = endOfMonth(viewMonth)
    const start = startOfWeek(monthStart, { weekStartsOn: 1 })
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewMonth])

  const monthTitle = `Tháng ${format(viewMonth, 'M, yyyy')}`

  return (
    <div className={cn('select-none', className)}>
      {/* Month Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 tracking-tight">
          {monthTitle}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setViewMonth(prev => subMonths(prev, 1))}
            aria-label="Tháng trước"
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#282A2E] text-gray-600 dark:text-gray-400"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(prev => addMonths(prev, 1))}
            aria-label="Tháng sau"
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#282A2E] text-gray-600 dark:text-gray-400"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 text-center mb-1">
        {VI_WEEKDAYS.map(wd => (
          <div
            key={wd}
            className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 py-1"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {calendarDays.map(day => {
          const dStr = dateToStr(day)
          const inMonth = isSameMonth(day, viewMonth)
          const isT = isToday(day)
          const isSelected = isSameDay(day, selectedDate)
          const hasSessions = datesWithSessions?.has(dStr)

          const inHighlightedWeek =
            highlightedWeekStart &&
            day >= highlightedWeekStart &&
            day <= endOfWeek(highlightedWeekStart, { weekStartsOn: 1 })

          return (
            <button
              key={dStr}
              type="button"
              onClick={() => {
                onSelectDate(day)
                if (!isSameMonth(day, viewMonth)) {
                  setViewMonth(startOfMonth(day))
                }
              }}
              className={cn(
                'relative h-7 w-full flex flex-col items-center justify-center text-[11px] rounded-full transition-colors',
                inHighlightedWeek && !isSelected && !isT && 'bg-blue-50/70 dark:bg-blue-950/25 rounded-none first:rounded-l-full last:rounded-r-full',
                !inMonth && 'text-gray-300 dark:text-gray-600',
                inMonth && !isT && !isSelected && 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#282A2E]',
                isSelected && !isT && 'bg-blue-100 dark:bg-blue-900/50 text-[#1A73E8] dark:text-[#8AB4F8] font-bold',
                isT && 'bg-[#1A73E8] text-white font-bold shadow-xs'
              )}
            >
              <span>{format(day, 'd')}</span>
              {hasSessions && !isT && (
                <span className="w-1 h-1 rounded-full bg-[#1A73E8] dark:bg-[#8AB4F8] absolute bottom-0.5" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

