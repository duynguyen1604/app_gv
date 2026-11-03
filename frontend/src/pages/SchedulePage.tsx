import { useState, useMemo } from 'react'
import { format, addDays, parseISO, isToday, isSameDay } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays, 
  Plus, 
  AlertTriangle, 
  MessageSquare, 
  Camera, 
  Clock, 
  MapPin, 
  Copy, 
  Printer, 
  CheckCircle,
  ExternalLink,
  ArrowRight,
  Share2
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TopBar } from '../components/ui/TopBar'
import { ZaloMessageModal } from '../components/schedule/ZaloMessageModal'
import { SchoolImageModal } from '../components/schedule/SchoolImageModal'
import { MoveSessionModal, CancelSessionModal, AddExtraSessionModal } from '../components/schedule/SessionActionModals'
import { 
  getWeekDays, 
  getWeekStart, 
  nextWeek, 
  prevWeek, 
  formatWeekHeader, 
  dateToWeekday, 
  VI_WEEKDAYS, 
  VI_WEEKDAYS_FULL,
  formatFullDate, 
  formatDate,
  formatDateShort,
  dateToStr 
} from '../lib/dateUtils'
import { cn } from '../lib/utils'
import type { CalendarSession } from '../types'
import toast from 'react-hot-toast'

export function SchedulePage() {
  const navigate = useNavigate()
  const { 
    classes, 
    scheduleRules, 
    sessionExceptions, 
    extraSessions, 
    schoolSchedule, 
    holidays,
    deleteExtraSession,
    addSessionException
  } = useAppStore()

  // Navigation state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()))
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => {
    const todayNum = dateToWeekday(new Date()) - 1 // 0-6
    return todayNum >= 0 && todayNum < 7 ? todayNum : 0
  })

  // Selected session for bottom sheet
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null)

  // Modals state
  const [showZaloModal, setShowZaloModal] = useState(false)
  const [showSchoolModal, setShowSchoolModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showAddExtraModal, setShowAddExtraModal] = useState(false)
  const [addExtraDate, setAddExtraDate] = useState<string | undefined>()
  const [makeupForId, setMakeupForId] = useState<string | null>(null)

  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart])

  // Compute all sessions for the whole week
  const sessionsByDay = useMemo(() => {
    const map: Record<string, CalendarSession[]> = {}

    for (const day of weekDays) {
      const dateStr = dateToStr(day)
      const weekday = dateToWeekday(day)
      const sessions: CalendarSession[] = []

      // Check Holiday
      const holiday = holidays.find(h => h.date === dateStr)
      if (holiday) {
        sessions.push({
          id: `holiday-${holiday.id}`,
          type: 'cancelled',
          date: dateStr,
          start_time: '00:00',
          end_time: '23:59',
          class_name: `🎌 Nghỉ lễ: ${holiday.note}`,
          is_cancelled: true,
        })
        map[dateStr] = sessions
        continue
      }

      // 1. School Schedule
      schoolSchedule
        .filter(s => s.weekday === weekday && s.valid_from <= dateStr && (!s.valid_to || s.valid_to >= dateStr))
        .forEach(s => {
          sessions.push({
            id: `school-${s.id}`,
            type: 'school',
            date: dateStr,
            start_time: s.start_time,
            end_time: s.end_time,
            class_name: s.class_name,
            subject: s.subject,
            room: s.room,
            location: s.room ? `Phòng ${s.room}` : 'Trường',
          })
        })

      // 2. Tutoring Schedule Rules
      scheduleRules
        .filter(r => r.weekday === weekday && r.valid_from <= dateStr && (!r.valid_to || r.valid_to >= dateStr))
        .forEach(rule => {
          const exception = sessionExceptions.find(e => e.rule_id === rule.id && e.original_date === dateStr)
          const cls = classes.find(c => c.id === rule.class_id)
          const className = cls?.name || 'Lớp dạy thêm'

          if (exception?.action === 'cancelled') {
            sessions.push({
              id: `cancelled-${rule.id}-${dateStr}`,
              type: 'cancelled',
              date: dateStr,
              start_time: rule.start_time,
              end_time: rule.end_time,
              class_id: rule.class_id,
              class_name: className,
              location: cls?.location,
              color: cls?.color,
              rule_id: rule.id,
              exception_id: exception.id,
              is_cancelled: true,
              needs_makeup: exception.needs_makeup,
              reason: exception.reason || undefined,
            })
          } else if (exception?.action === 'moved') {
            // Faded with line-through at original spot + arrow pointing to new date
            sessions.push({
              id: `moved-orig-${rule.id}-${dateStr}`,
              type: 'tutoring_moved_away',
              date: dateStr,
              start_time: rule.start_time,
              end_time: rule.end_time,
              class_id: rule.class_id,
              class_name: className,
              location: cls?.location,
              color: cls?.color,
              rule_id: rule.id,
              exception_id: exception.id,
              is_cancelled: true,
              is_moved: true,
              moved_to_date: exception.new_date || undefined,
              moved_to_start: exception.new_start || undefined,
              reason: exception.reason || undefined,
            })
          } else {
            sessions.push({
              id: `tutoring-${rule.id}-${dateStr}`,
              type: 'tutoring_fixed',
              date: dateStr,
              start_time: rule.start_time,
              end_time: rule.end_time,
              class_id: rule.class_id,
              class_name: className,
              location: cls?.location,
              color: cls?.color,
              rule_id: rule.id,
            })
          }
        })

      // 3. Moved Sessions landing on this date
      sessionExceptions
        .filter(e => e.action === 'moved' && e.new_date === dateStr && e.new_start && e.new_end)
        .forEach(e => {
          const rule = scheduleRules.find(r => r.id === e.rule_id)
          const cls = classes.find(c => c.id === rule?.class_id)
          sessions.push({
            id: `moved-dest-${e.id}`,
            type: 'tutoring_extra',
            date: dateStr,
            start_time: e.new_start!,
            end_time: e.new_end!,
            class_id: rule?.class_id,
            class_name: `${cls?.name || 'Lớp'} (Dời từ ${formatDateShort(e.original_date)})`,
            location: cls?.location,
            color: cls?.color,
            rule_id: rule?.id,
            exception_id: e.id,
            is_moved: true,
            reason: e.reason || undefined,
          })
        })

      // 4. Extra Sessions on this date
      extraSessions
        .filter(e => e.date === dateStr)
        .forEach(e => {
          const cls = classes.find(c => c.id === e.class_id)
          sessions.push({
            id: `extra-${e.id}`,
            type: 'tutoring_extra',
            date: dateStr,
            start_time: e.start_time,
            end_time: e.end_time,
            class_id: e.class_id,
            class_name: cls?.name || 'Buổi phát sinh',
            location: cls?.location,
            color: cls?.color,
            makeup_for: e.makeup_for || undefined,
            reason: e.note || undefined,
          })
        })

      // Sort by start time ascending
      sessions.sort((a, b) => a.start_time.localeCompare(b.start_time))
      map[dateStr] = sessions
    }

    return map
  }, [weekDays, classes, scheduleRules, sessionExceptions, extraSessions, schoolSchedule, holidays])

  // Today sessions
  const todayStr = dateToStr(new Date())
  const todaySessions = sessionsByDay[todayStr] || []
  const activeTodaySessions = todaySessions.filter(s => !s.is_cancelled)

  // Sessions needing makeup (cancelled with needs_makeup=true and no extra session linked yet)
  const makeupNeeded = useMemo(() => {
    return sessionExceptions.filter(e => 
      e.action === 'cancelled' && 
      e.needs_makeup && 
      !extraSessions.some(ex => ex.makeup_for === e.id)
    )
  }, [sessionExceptions, extraSessions])

  const handleOpenAddExtra = (date?: string, makeupId?: string) => {
    setAddExtraDate(date || dateToStr(new Date()))
    setMakeupForId(makeupId || null)
    setShowAddExtraModal(true)
  }

  // Copy current week exceptions to next week
  const handleCopyWeekToNext = () => {
    const currentWeekExceptions = sessionExceptions.filter(e => {
      const exDate = e.original_date
      return weekDays.some(d => dateToStr(d) === exDate)
    })

    if (currentWeekExceptions.length === 0) {
      toast('Tuần này không có buổi dời/hủy nào để sao chép', { icon: 'ℹ️' })
      return
    }

    for (const ex of currentWeekExceptions) {
      const origDate = parseISO(ex.original_date)
      const nextWeekDate = addDays(origDate, 7)
      const nextDateStr = dateToStr(nextWeekDate)

      addSessionException({
        rule_id: ex.rule_id,
        original_date: nextDateStr,
        action: ex.action,
        new_date: ex.new_date ? dateToStr(addDays(parseISO(ex.new_date), 7)) : null,
        new_start: ex.new_start,
        new_end: ex.new_end,
        reason: ex.reason ? `(Sao chép từ tuần trước) ${ex.reason}` : 'Sao chép từ tuần trước',
        needs_makeup: ex.needs_makeup,
      })
    }

    toast.success(`Đã sao chép ${currentWeekExceptions.length} thay đổi sang tuần sau!`)
  }

  // Print schedule
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Top Header */}
      <TopBar
        title="Thời gian biểu"
        rightContent={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode(viewMode === 'week' ? 'day' : 'week')}
              className="btn-secondary py-1 px-2.5 text-xs font-semibold rounded-lg"
            >
              {viewMode === 'week' ? '1 Ngày' : 'Cả tuần'}
            </button>
            <button
              onClick={handlePrint}
              className="btn-icon text-gray-500 hover:text-gray-800"
              title="In lịch"
            >
              <Printer size={18} />
            </button>
          </div>
        }
      />

      {/* Action toolstrip: Zalo AI, School Image AI, Add Extra, Copy Week */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setShowZaloModal(true)}
          className="btn-secondary py-1.5 px-3 text-xs shrink-0 flex items-center gap-1.5 font-medium border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
        >
          <MessageSquare size={14} className="text-blue-500" />
          Dán tin nhắn Zalo
        </button>

        <button
          onClick={() => setShowSchoolModal(true)}
          className="btn-secondary py-1.5 px-3 text-xs shrink-0 flex items-center gap-1.5 font-medium border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
        >
          <Camera size={14} className="text-emerald-500" />
          Nhập TKB trường từ ảnh
        </button>

        <button
          onClick={() => handleOpenAddExtra()}
          className="btn-secondary py-1.5 px-3 text-xs shrink-0 flex items-center gap-1.5 font-medium"
        >
          <Plus size={14} />
          Buổi phát sinh
        </button>

        <button
          onClick={handleCopyWeekToNext}
          className="btn-ghost py-1.5 px-2.5 text-xs shrink-0 text-gray-500 flex items-center gap-1"
          title="Sao chép các buổi dời/hủy của tuần này sang tuần sau"
        >
          <Copy size={13} />
          Chép sang tuần sau
        </button>
      </div>

      {/* TODAY SUMMARY CARD */}
      <div className="mx-4 mt-2 card p-3 bg-gradient-to-r from-blue-50/40 via-white to-orange-50/30 dark:from-blue-950/20 dark:via-gray-900 dark:to-orange-950/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
            <CalendarDays size={14} className="text-blue-600" />
            HÔM NAY ({formatDate(new Date())})
          </span>
          <span className="text-xs text-gray-400">
            {activeTodaySessions.length > 0 ? `${activeTodaySessions.length} buổi` : 'Không có lịch'}
          </span>
        </div>

        {activeTodaySessions.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">Hôm nay không có lịch dạy nào.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeTodaySessions.map(s => (
              <div
                key={s.id}
                onClick={() => setSelectedSession(s)}
                className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full shrink-0',
                    s.type === 'school' ? 'bg-blue-500' : s.type === 'tutoring_extra' ? 'bg-purple-500' : 'bg-orange-500'
                  )} />
                  <div className="truncate">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">
                      {s.class_name}
                    </span>
                    {s.subject && (
                      <span className="text-xs text-gray-500 ml-1.5">({s.subject})</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.location && (
                    <span className="text-[11px] text-gray-400 hidden sm:inline">📍 {s.location}</span>
                  )}
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {s.start_time}–{s.end_time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MAKEUP NEEDED BANNER */}
      {makeupNeeded.length > 0 && (
        <div className="mx-4 mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600" />
              {makeupNeeded.length} buổi bị hủy cần dạy bù:
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {makeupNeeded.map(e => {
              const rule = scheduleRules.find(r => r.id === e.rule_id)
              const cls = classes.find(c => c.id === rule?.class_id)
              return (
                <div key={e.id} className="flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 bg-white/70 dark:bg-gray-800/70 p-2 rounded-lg border border-amber-100 dark:border-amber-900/50">
                  <div>
                    <span className="font-semibold">{cls?.name || 'Lớp'}</span> · {formatDate(e.original_date)}
                    {e.reason && <span className="text-amber-700 dark:text-amber-400 text-[11px] block">{e.reason}</span>}
                  </div>
                  <button
                    onClick={() => handleOpenAddExtra(undefined, e.id)}
                    className="btn-primary py-1 px-2.5 text-xs font-medium shrink-0 bg-amber-600 hover:bg-amber-700"
                  >
                    Xếp bù ngay
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* WEEK NAVIGATION */}
      <div className="flex items-center justify-between px-4 py-2 mt-1">
        <button
          onClick={() => setCurrentWeekStart(prevWeek(currentWeekStart))}
          className="btn-icon p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
            {formatWeekHeader(currentWeekStart)}
          </span>
          <button
            onClick={() => setCurrentWeekStart(getWeekStart(new Date()))}
            className="text-xs text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30"
          >
            Hôm nay
          </button>
        </div>

        <button
          onClick={() => setCurrentWeekStart(nextWeek(currentWeekStart))}
          className="btn-icon p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 1 DAY VIEW (Tab bar selector) */}
      {viewMode === 'day' && (
        <div className="px-4 mb-2">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            {weekDays.map((day, idx) => {
              const isT = isToday(day)
              const isSel = idx === selectedDayIdx
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDayIdx(idx)}
                  className={cn(
                    'flex-1 py-1.5 text-center rounded-lg text-xs font-semibold transition-all',
                    isSel
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800',
                    isT && !isSel && 'text-blue-500 font-bold'
                  )}
                >
                  <div>{VI_WEEKDAYS[idx]}</div>
                  <div className="text-[11px]">{format(day, 'd')}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* SCHEDULE VIEW BODY */}
      {viewMode === 'day' ? (
        /* SINGLE DAY VIEW */
        <div className="mx-4 card p-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-3">
            <div className="font-bold text-base text-gray-900 dark:text-white">
              {formatFullDate(weekDays[selectedDayIdx])}
            </div>
            <button
              onClick={() => handleOpenAddExtra(dateToStr(weekDays[selectedDayIdx]))}
              className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1"
            >
              <Plus size={13} /> Thêm buổi
            </button>
          </div>

          <div className="flex flex-col gap-2 min-h-[200px]">
            {(sessionsByDay[dateToStr(weekDays[selectedDayIdx])] || []).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">Không có buổi học nào vào ngày này.</p>
                <button
                  onClick={() => handleOpenAddExtra(dateToStr(weekDays[selectedDayIdx]))}
                  className="btn-secondary text-xs mt-3"
                >
                  + Thêm buổi phát sinh
                </button>
              </div>
            ) : (
              (sessionsByDay[dateToStr(weekDays[selectedDayIdx])] || []).map(session => (
                <SessionItemRow
                  key={session.id}
                  session={session}
                  onClick={() => setSelectedSession(session)}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        /* FULL WEEK GRID VIEW */
        <div className="mx-2 card overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-800">
            {weekDays.map((day, idx) => {
              const dateStr = dateToStr(day)
              const isT = isToday(day)
              const sessions = sessionsByDay[dateStr] || []

              return (
                <div
                  key={dateStr}
                  className={cn(
                    'min-h-[260px] flex flex-col',
                    isT && 'bg-blue-50/30 dark:bg-blue-950/20'
                  )}
                >
                  {/* Day Header */}
                  <div className={cn(
                    'text-center py-2 border-b border-gray-100 dark:border-gray-800',
                    isT ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'
                  )}>
                    <div className="text-[11px] font-bold">{VI_WEEKDAYS[idx]}</div>
                    <div className="text-xs font-extrabold">{format(day, 'd')}</div>
                  </div>

                  {/* Day Sessions List */}
                  <div className="p-1 flex-1 flex flex-col gap-1">
                    {sessions.map(s => (
                      <SessionGridBlock
                        key={s.id}
                        session={s}
                        onClick={() => setSelectedSession(s)}
                      />
                    ))}

                    {/* Empty cell quick add */}
                    <button
                      onClick={() => handleOpenAddExtra(dateStr)}
                      className="mt-auto w-full py-2 flex items-center justify-center text-gray-300 dark:text-gray-700 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition-colors"
                      title="Bấm để thêm buổi phát sinh"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* COLOR LEGEND */}
      <div className="mx-4 mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>Lịch trường</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-500" />
          <span>Dạy thêm cố định</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span>Phát sinh</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-600" />
          <span>Đã hủy / dời</span>
        </div>
      </div>

      {/* SESSION DETAIL BOTTOM SHEET MODAL */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setSelectedSession(null)}>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          
          <div
            className="relative z-10 w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-4 sm:hidden" />

            {/* Header with color indicator */}
            <div className="flex items-start gap-3 mb-4">
              <div className={cn(
                'w-3.5 h-3.5 rounded-full mt-1 shrink-0',
                selectedSession.type === 'school' ? 'bg-blue-500' :
                selectedSession.type === 'tutoring_extra' ? 'bg-purple-500' :
                selectedSession.is_cancelled ? 'bg-gray-400' : 'bg-orange-500'
              )} />
              <div className="flex-1 min-w-0">
                <h3 className={cn(
                  'text-base font-bold',
                  selectedSession.is_cancelled ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'
                )}>
                  {selectedSession.class_name}
                </h3>
                {selectedSession.subject && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Môn: {selectedSession.subject}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 dark:text-gray-300">
                  <Clock size={13} className="text-gray-400" />
                  <span>{formatFullDate(selectedSession.date)} ({selectedSession.start_time}–{selectedSession.end_time})</span>
                </div>
                {selectedSession.location && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin size={13} className="text-gray-400" />
                    <span>{selectedSession.location}</span>
                  </div>
                )}
                {selectedSession.reason && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                    Ghi chú: {selectedSession.reason}
                  </p>
                )}
                {selectedSession.is_moved && selectedSession.moved_to_date && (
                  <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 font-semibold mt-1.5">
                    <ArrowRight size={13} />
                    <span>Đã dời sang ngày {formatDate(selectedSession.moved_to_date)} lúc {selectedSession.moved_to_start}</span>
                  </div>
                )}
                {selectedSession.needs_makeup && (
                  <p className="text-xs text-red-500 font-medium mt-1">
                    ⚠️ Buổi này đã bị hủy và đang chờ dạy bù.
                  </p>
                )}
              </div>
            </div>

            {/* Actions for this session */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              {/* Go to attendance if it's a tutoring class and not cancelled */}
              {selectedSession.class_id && !selectedSession.is_cancelled && (
                <button
                  onClick={() => {
                    const cid = selectedSession.class_id
                    setSelectedSession(null)
                    navigate(`/classes/${cid}`)
                  }}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm"
                >
                  <CheckCircle size={16} />
                  Vào điểm danh buổi này
                </button>
              )}

              {/* Move session action (only for fixed rules) */}
              {selectedSession.rule_id && !selectedSession.is_cancelled && (
                <button
                  onClick={() => {
                    setShowMoveModal(true)
                  }}
                  className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2 text-sm"
                >
                  🔄 Dời sang ngày/giờ khác (tuần này)
                </button>
              )}

              {/* Cancel session action (only for active tutoring sessions) */}
              {selectedSession.rule_id && !selectedSession.is_cancelled && (
                <button
                  onClick={() => {
                    setShowCancelModal(true)
                  }}
                  className="btn-danger w-full py-2.5 flex items-center justify-center gap-2 text-sm"
                >
                  ❌ Hủy buổi này
                </button>
              )}

              {/* Delete if extra session */}
              {selectedSession.id.startsWith('extra-') && (
                <button
                  onClick={() => {
                    const extraId = selectedSession.id.replace('extra-', '')
                    deleteExtraSession(extraId)
                    toast.success('Đã xóa buổi phát sinh')
                    setSelectedSession(null)
                  }}
                  className="btn-danger w-full py-2.5 flex items-center justify-center gap-2 text-sm"
                >
                  🗑️ Xóa buổi phát sinh này
                </button>
              )}

              <button
                onClick={() => setSelectedSession(null)}
                className="btn-ghost w-full py-2 text-sm text-gray-500 mt-1"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ZaloMessageModal
        open={showZaloModal}
        onClose={() => setShowZaloModal(false)}
        currentWeekStart={currentWeekStart}
      />

      <SchoolImageModal
        open={showSchoolModal}
        onClose={() => setShowSchoolModal(false)}
      />

      <MoveSessionModal
        open={showMoveModal}
        onClose={() => {
          setShowMoveModal(false)
          setSelectedSession(null)
        }}
        session={selectedSession}
      />

      <CancelSessionModal
        open={showCancelModal}
        onClose={() => {
          setShowCancelModal(false)
          setSelectedSession(null)
        }}
        session={selectedSession}
      />

      <AddExtraSessionModal
        open={showAddExtraModal}
        onClose={() => setShowAddExtraModal(false)}
        initialDate={addExtraDate}
        makeupForId={makeupForId}
      />
    </div>
  )
}

// Subcomponent: Grid block in 7-column view
function SessionGridBlock({ session, onClick }: { session: CalendarSession, onClick: () => void }) {
  const isSchool = session.type === 'school'
  const isExtra = session.type === 'tutoring_extra'
  const isCancelled = session.is_cancelled
  const isMoved = session.is_moved

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-all active:scale-95 border-l-2 shadow-xs select-none',
        isCancelled
          ? 'bg-gray-100 dark:bg-gray-800/60 border-gray-400 opacity-60 text-gray-400 line-through'
          : isSchool
            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200'
            : isExtra
              ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200'
              : 'bg-orange-50 dark:bg-orange-950/40 border-orange-500 text-orange-900 dark:text-orange-200'
      )}
    >
      <div className="font-bold truncate leading-tight">
        {session.class_name}
      </div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">
        {session.start_time}
      </div>
      {isExtra && !isCancelled && (
        <span className="text-[9px] bg-purple-200 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 px-1 py-0.2 rounded font-semibold inline-block mt-0.5">
          Phát sinh
        </span>
      )}
      {isMoved && session.moved_to_date && (
        <span className="text-[9px] text-purple-700 dark:text-purple-400 block truncate">
          ➔ Dời {formatDateShort(session.moved_to_date)}
        </span>
      )}
      {session.needs_makeup && (
        <span className="text-[9px] text-red-600 block">⚠️ Bù</span>
      )}
    </div>
  )
}

// Subcomponent: Item row in 1-day view
function SessionItemRow({ session, onClick }: { session: CalendarSession, onClick: () => void }) {
  const isSchool = session.type === 'school'
  const isExtra = session.type === 'tutoring_extra'
  const isCancelled = session.is_cancelled

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl border flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-gray-800 transition-colors',
        isCancelled
          ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 opacity-60'
          : isSchool
            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
            : isExtra
              ? 'bg-purple-50/40 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900'
              : 'bg-orange-50/40 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-3 h-3 rounded-full shrink-0',
          isSchool ? 'bg-blue-500' : isExtra ? 'bg-purple-500' : isCancelled ? 'bg-gray-400' : 'bg-orange-500'
        )} />
        <div>
          <div className="flex items-center gap-2">
            <h4 className={cn('font-semibold text-sm', isCancelled && 'line-through text-gray-400')}>
              {session.class_name}
            </h4>
            {isExtra && !isCancelled && (
              <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                Phát sinh
              </span>
            )}
            {session.needs_makeup && (
              <span className="badge bg-amber-100 text-amber-700 text-[10px]">
                Cần bù
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            <span>⏰ {session.start_time} – {session.end_time}</span>
            {session.location && <span>📍 {session.location}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
