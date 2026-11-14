import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  format,
  addDays,
  subDays,
  addMonths,
  subMonths,
  parseISO,
  isToday,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Plus,
  AlertTriangle,
  MessageSquare,
  Camera,
  Copy,
  Printer,
  Search,
  X,
  Menu,
  SlidersHorizontal,
  HelpCircle,
  Download,
  Sunrise,
  Sun,
  Moon,
  Settings as SettingsIcon,
  Table2,
  Clock,
  Check,
  Trash2,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { MiniCalendar } from '../components/schedule/MiniCalendar'
import { TimeGridCalendar } from '../components/schedule/TimeGridCalendar'
import { MonthCalendarView } from '../components/schedule/MonthCalendarView'
import { AgendaCalendarView } from '../components/schedule/AgendaCalendarView'
import { SessionMatrixView } from '../components/schedule/SessionMatrixView'
import { SchoolPeriodGridView } from '../components/schedule/SchoolPeriodGridView'
import {
  QuickAddModal,
  SessionDetailSheet,
  ExportWeekModal,
  KeyboardShortcutsModal,
} from '../components/schedule/ScheduleExtraModals'
import { ZaloMessageModal } from '../components/schedule/ZaloMessageModal'
import { SchoolImageModal, ApplySchoolWeeksModal } from '../components/schedule/SchoolImageModal'
import { SessionGuestModal } from '../components/students/StudentLifecycleModals'
import {
  MoveSessionModal,
  CancelSessionModal,
  AddExtraSessionModal,
} from '../components/schedule/SessionActionModals'
import {
  getWeekDays,
  getWeekStart,
  nextWeek,
  prevWeek,
  formatDate,
  dateToStr,
  timeToMinutes,
} from '../lib/dateUtils'
import { getMondayOfDateStr, addDaysToDateStr } from '../lib/schoolPeriods'
import { computeSessionsForDate } from '../lib/conflictDetector'
import { cn } from '../lib/utils'
import type {
  CalendarLayerVisibility,
  CalendarSession,
  CalendarViewMode,
  TimeOfDayFilter,
} from '../types'
import toast from 'react-hot-toast'

const VIEW_MODES: { key: CalendarViewMode; label: string; shortLabel: string; shortcut: string }[] = [
  { key: 'session_matrix', label: 'Bảng ca (Sáng/Chiều/Tối)', shortLabel: 'Bảng ca', shortcut: 'B' },
  { key: 'agenda', label: 'Danh sách (Lịch biểu)', shortLabel: 'Danh sách', shortcut: 'A' },
  { key: 'week', label: 'Lưới giờ (7 ngày)', shortLabel: 'Lưới giờ', shortcut: 'W' },
  { key: 'day', label: 'Theo Ngày', shortLabel: 'Ngày', shortcut: 'D' },
  { key: '3days', label: '3 ngày', shortLabel: '3 ngày', shortcut: 'X' },
  { key: 'month', label: 'Tháng', shortLabel: 'Tháng', shortcut: 'M' },
  { key: 'school_grid', label: 'Bảng tiết của trường', shortLabel: 'Tiết trường', shortcut: 'P' },
]

const QUICK_VIEW_TABS: { key: CalendarViewMode; label: string }[] = [
  { key: 'session_matrix', label: 'Bảng ca' },
  { key: 'agenda', label: 'Lịch biểu' },
  { key: 'week', label: 'Lưới giờ' },
  { key: 'month', label: 'Tháng' },
  { key: 'school_grid', label: 'Tiết trường' },
]

const MOBILE_VIEW_TABS: { key: CalendarViewMode; label: string }[] = [
  { key: 'agenda', label: 'Lịch biểu' },
  { key: 'day', label: 'Ngày' },
  { key: '3days', label: '3 ngày' },
  { key: 'week', label: 'Tuần' },
  { key: 'month', label: 'Tháng' },
  { key: 'session_matrix', label: 'Bảng ca' },
]

export function SchedulePage() {
  const navigate = useNavigate()
  const {
    classes,
    students,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    schoolSchedule,
    schoolPeriods,
    schoolWeekConfigs,
    sessionGuests,
    setSchoolWeekConfig,
    copySchoolScheduleToWeeks,
    holidays,
    settings,
    updateSettings,
    calendarViewMode,
    setCalendarViewMode,
    calendarLayers,
    toggleCalendarLayer,
    deleteExtraSession,
    updateExtraSession,
    updateScheduleRule,
    deleteSessionException,
    addSessionException,
    dismissMakeupException,
    clearAllMakeupExceptions,
    cleanupExpiredMakeupExceptions,
  } = useAppStore()

  // Responsive initial view mode: Desktop defaults to 'session_matrix' (Bảng ca Sáng/Chiều/Tối), Mobile defaults to 'agenda' (Google Calendar style)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [viewMode, setViewModeState] = useState<CalendarViewMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (
        calendarViewMode &&
        calendarViewMode !== 'session_matrix' &&
        calendarViewMode !== 'school_grid'
      ) {
        return calendarViewMode
      }
      return 'agenda'
    }
    return calendarViewMode || 'session_matrix'
  })

  const setViewMode = (mode: CalendarViewMode) => {
    setViewModeState(mode)
    setCalendarViewMode(mode)
  }

  // Automatically switch between Google Calendar Mobile ('agenda') and PC Table ('session_matrix') when crossing the mobile breakpoint
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(max-width: 767px)')
    const handleViewportChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        // Switched to mobile -> use Google Calendar schedule view
        setViewModeState(prev =>
          prev === 'session_matrix' || prev === 'school_grid' ? 'agenda' : prev
        )
      } else {
        // Switched to desktop -> use PC timetable matrix
        setViewModeState(prev => (prev === 'agenda' ? 'session_matrix' : prev))
      }
    }
    mql.addEventListener('change', handleViewportChange)
    return () => mql.removeEventListener('change', handleViewportChange)
  }, [])

  // Left sidebar / drawer & filters state (default collapsed on smaller screens so 7-day table has full width)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 1440
    return false
  })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mobileMonthDropdownOpen, setMobileMonthDropdownOpen] = useState(false)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [mobileFabMenuOpen, setMobileFabMenuOpen] = useState(false)
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false)

  const [timeFilter, setTimeFilter] = useState<TimeOfDayFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Selected session for detail sheet / popover
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null)

  // Modals state
  const [quickAddState, setQuickAddState] = useState<{
    open: boolean
    date: string
    start: string
    end: string
  }>({
    open: false,
    date: dateToStr(new Date()),
    start: '18:00',
    end: '19:30',
  })

  const [showZaloModal, setShowZaloModal] = useState(false)
  const [showSchoolModal, setShowSchoolModal] = useState(false)
  const [showApplyWeeksModal, setShowApplyWeeksModal] = useState(false)
  const [guestModalSession, setGuestModalSession] = useState<CalendarSession | null>(null)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [movePrefill, setMovePrefill] = useState<{
    date?: string
    start?: string
    end?: string
  }>({})
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showAddExtraModal, setShowAddExtraModal] = useState(false)
  const [addExtraDefaults, setAddExtraDefaults] = useState<{
    date?: string
    start?: string
    end?: string
    makeupId?: string | null
  }>({})
  const [showExportModal, setShowExportModal] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  const currentWeekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate])
  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart])
  const currentWeekMonday = useMemo(
    () => getMondayOfDateStr(dateToStr(currentWeekStart)),
    [currentWeekStart]
  )

  // Group B3: Check if this week has school timetable data
  const weekSchoolItems = useMemo(
    () => (schoolSchedule || []).filter((s) => s.week_start === currentWeekMonday),
    [schoolSchedule, currentWeekMonday]
  )
  const hasSchoolScheduleThisWeek = weekSchoolItems.length > 0
  const weekTeachingPeriodCount = useMemo(
    () => weekSchoolItems.filter((s) => s.cell_type === 'class').length,
    [weekSchoolItems]
  )
  const currentWeekConfig = useMemo(
    () => (schoolWeekConfigs && schoolWeekConfigs[currentWeekMonday]) || null,
    [schoolWeekConfigs, currentWeekMonday]
  )
  const isAfternoonLongBreak =
    currentWeekConfig?.afternoon_long_break ??
    weekSchoolItems.some((s) => s.afternoon_long_break)

  const handleCopySchoolFromPreviousWeek = () => {
    const prevMonday = addDaysToDateStr(currentWeekMonday, -7)
    const hasPrev = schoolSchedule.some((s) => s.week_start === prevMonday)
    let sourceMonday = prevMonday
    if (!hasPrev) {
      const availableWeeks = Array.from(
        new Set(schoolSchedule.map((s) => s.week_start).filter(Boolean))
      ).sort((a, b) => b.localeCompare(a))
      if (availableWeeks.length === 0) {
        toast.error('Chưa có thời khóa biểu trường của tuần nào trước đó để sao chép.')
        return
      }
      sourceMonday = availableWeeks[0]
    }
    copySchoolScheduleToWeeks({
      sourceWeekStart: sourceMonday,
      targetWeekStarts: [currentWeekMonday],
      mode: 'overwrite',
    })
    toast.success(
      `Đã sao chép thời khóa biểu trường từ tuần ${formatDate(sourceMonday)} sang tuần ${formatDate(currentWeekMonday)}!`
    )
  }

  // Determine the array of days to display in the current view
  const displayedDays = useMemo(() => {
    if (viewMode === 'day') return [selectedDate]
    if (viewMode === '3days') return [selectedDate, addDays(selectedDate, 1), addDays(selectedDate, 2)]
    if (viewMode === '4days')
      return [
        selectedDate,
        addDays(selectedDate, 1),
        addDays(selectedDate, 2),
        addDays(selectedDate, 3),
      ]
    return weekDays
  }, [viewMode, selectedDate, weekDays])

  // Function to compute filtered sessions for any date string
  const computeFilteredDaySessions = useCallback(
    (dateStr: string): CalendarSession[] => {
      const raw = computeSessionsForDate({
        dateStr,
        classes,
        students,
        scheduleRules,
        sessionExceptions,
        extraSessions,
        schoolSchedule,
        schoolPeriods,
        schoolWeekConfigs,
        sessionGuests,
        holidays,
        settings,
      })

      return raw.filter(s => {
        // 1. Layer visibility filter
        if (s.id.startsWith('holiday-') && !calendarLayers.holiday) return false
        if (s.type === 'school' && !calendarLayers.school) return false
        if (s.type === 'duty' && !calendarLayers.duty) return false
        if (
          (s.type === 'tutoring_fixed' || s.type === 'tutoring_moved_away' || s.type === 'cancelled') &&
          !s.id.startsWith('holiday-') &&
          !calendarLayers.tutoring_fixed
        )
          return false
        if (s.type === 'tutoring_extra' && !calendarLayers.tutoring_extra) return false

        // 2. Time-of-day filter (Sáng / Chiều / Tối)
        if (timeFilter !== 'all' && !(s.start_time === '00:00' && s.end_time === '23:59')) {
          if (s.session_group !== timeFilter) return false
        }

        // 3. Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase()
          const hay = [
            s.class_name,
            s.subject,
            s.location,
            s.period_code,
            s.reason,
            s.note,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!hay.includes(q)) return false
        }

        return true
      })
    },
    [
      classes,
      students,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      schoolSchedule,
      schoolPeriods,
      schoolWeekConfigs,
      sessionGuests,
      holidays,
      settings,
      calendarLayers,
      timeFilter,
      searchQuery,
    ]
  )

  // Precompute sessions map for the current week + displayed days
  const sessionsByDay = useMemo(() => {
    const map: Record<string, CalendarSession[]> = {}
    const allDates = new Set<string>([
      ...weekDays.map(dateToStr),
      ...displayedDays.map(dateToStr),
      dateToStr(new Date()),
    ])
    allDates.forEach(dStr => {
      map[dStr] = computeFilteredDaySessions(dStr)
    })
    return map
  }, [weekDays, displayedDays, computeFilteredDaySessions])

  // Dates with sessions in current month for MiniCalendar dots
  const datesWithSessions = useMemo(() => {
    const set = new Set<string>()
    const mStart = startOfMonth(selectedDate)
    const mEnd = endOfMonth(selectedDate)
    const monthDates = eachDayOfInterval({ start: mStart, end: mEnd })
    for (const d of monthDates) {
      const dStr = dateToStr(d)
      const list = sessionsByDay[dStr] ?? computeFilteredDaySessions(dStr)
      if (list.some(s => !s.is_cancelled)) set.add(dStr)
    }
    Object.entries(sessionsByDay).forEach(([dStr, list]) => {
      if (list.some(s => !s.is_cancelled)) set.add(dStr)
    })
    return set
  }, [selectedDate, sessionsByDay, computeFilteredDaySessions])

  // Today's active sessions & Next upcoming session countdown (Section 5.7)
  const todayStr = dateToStr(new Date())
  const todayActiveSessions = useMemo(
    () =>
      (sessionsByDay[todayStr] || []).filter(
        s => !s.is_cancelled && !(s.start_time === '00:00' && s.end_time === '23:59')
      ),
    [sessionsByDay, todayStr]
  )

  const nextUpcomingInfo = useMemo(() => {
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    for (const s of todayActiveSessions) {
      const sMin = timeToMinutes(s.start_time)
      const eMin = timeToMinutes(s.end_time)
      if (nowMin >= sMin && nowMin <= eMin) {
        return { session: s, statusText: 'Đang diễn ra ngay lúc này', isOngoing: true }
      }
      if (sMin > nowMin) {
        const diff = sMin - nowMin
        const h = Math.floor(diff / 60)
        const m = diff % 60
        const statusText = h > 0 ? `Còn ${h} giờ ${m} phút nữa` : `Còn ${m} phút nữa`
        return { session: s, statusText, isOngoing: false }
      }
    }
    return null
  }, [todayActiveSessions])

  // Makeup sessions needed (auto-clean previous months' unscheduled makeup sessions)
  const currentRealMonthStr = todayStr.slice(0, 7)
  const [confirmDeleteMakeupId, setConfirmDeleteMakeupId] = useState<string | null>(null)
  const [confirmClearAllMakeup, setConfirmClearAllMakeup] = useState(false)

  useEffect(() => {
    cleanupExpiredMakeupExceptions(currentRealMonthStr)
  }, [currentRealMonthStr, cleanupExpiredMakeupExceptions])

  const makeupNeeded = useMemo(() => {
    return (sessionExceptions || []).filter(
      e =>
        e &&
        e.action === 'cancelled' &&
        e.needs_makeup &&
        String(e.original_date || '').slice(0, 7) >= currentRealMonthStr &&
        !(extraSessions || []).some(ex => ex.makeup_for === e.id)
    )
  }, [sessionExceptions, extraSessions, currentRealMonthStr])

  // Conflicts in current week
  const weekConflicts = useMemo(() => {
    const list: CalendarSession[] = []
    weekDays.forEach(d => {
      const dStr = dateToStr(d)
      const daySess = sessionsByDay[dStr] || []
      daySess.forEach(s => {
        if (s.has_conflict && !s.is_cancelled) list.push(s)
      })
    })
    return list
  }, [weekDays, sessionsByDay])

  // Period Navigation (Prev / Next / Today)
  const handlePrevPeriod = useCallback(() => {
    setSelectedDate(prev => {
      if (viewMode === 'day') return subDays(prev, 1)
      if (viewMode === '3days') return subDays(prev, 3)
      if (viewMode === '4days') return subDays(prev, 4)
      if (viewMode === 'month') return subMonths(prev, 1)
      return prevWeek(prev)
    })
  }, [viewMode])

  const handleNextPeriod = useCallback(() => {
    setSelectedDate(prev => {
      if (viewMode === 'day') return addDays(prev, 1)
      if (viewMode === '3days') return addDays(prev, 3)
      if (viewMode === '4days') return addDays(prev, 4)
      if (viewMode === 'month') return addMonths(prev, 1)
      return nextWeek(prev)
    })
  }, [viewMode])

  const handleGoToday = useCallback(() => {
    setSelectedDate(new Date())
  }, [])

  // Keyboard shortcuts (Section 5.4: D/W/M/A/X/P, T, J/K, <-/->, C, /, Esc, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        if (e.key === 'Escape') {
          target.blur()
        }
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault()
          setViewMode('day')
          break
        case 'w':
          e.preventDefault()
          setViewMode('week')
          break
        case 'm':
          e.preventDefault()
          setViewMode('month')
          break
        case 'a':
          e.preventDefault()
          setViewMode('agenda')
          break
        case 'x':
          e.preventDefault()
          setViewMode(window.innerWidth < 768 ? '3days' : '4days')
          break
        case 'p':
          e.preventDefault()
          setViewMode('school_grid')
          break
        case 't':
          e.preventDefault()
          handleGoToday()
          break
        case 'j':
        case 'arrowleft':
          e.preventDefault()
          handlePrevPeriod()
          break
        case 'k':
        case 'arrowright':
          e.preventDefault()
          handleNextPeriod()
          break
        case 'c':
          e.preventDefault()
          setQuickAddState({
            open: true,
            date: dateToStr(selectedDate),
            start: '18:00',
            end: '19:30',
          })
          break
        case '/':
          e.preventDefault()
          searchInputRef.current?.focus()
          break
        case '?':
          e.preventDefault()
          setShowShortcutsModal(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleGoToday, handlePrevPeriod, handleNextPeriod, selectedDate])

  // Mobile horizontal swipe to change period
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      if (dx < 0) handleNextPeriod()
      else handlePrevPeriod()
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  // Copy current week exceptions to next week
  const handleCopyWeekToNext = () => {
    const currentWeekExceptions = sessionExceptions.filter(e =>
      weekDays.some(d => dateToStr(d) === e.original_date)
    )
    if (currentWeekExceptions.length === 0) {
      toast('Tuần này không có buổi dời/hủy nào để sao chép', { icon: 'ℹ️' })
      return
    }
    for (const ex of currentWeekExceptions) {
      const origDate = parseISO(ex.original_date)
      const nextDateStr = dateToStr(addDays(origDate, 7))
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

  // Resize session end_time handler (Section 5.4)
  const handleResizeSession = (session: CalendarSession, newEndTime: string) => {
    if (session.id.startsWith('extra-')) {
      const extraId = session.id.replace('extra-', '')
      updateExtraSession(extraId, { end_time: newEndTime })
      toast.success(`Đã đổi giờ kết thúc thành ${newEndTime}`)
    } else if (session.exception_id) {
      addSessionException({
        rule_id: session.rule_id!,
        original_date: session.moved_from_date || session.date,
        action: 'moved',
        new_date: session.date,
        new_start: session.start_time,
        new_end: newEndTime,
        reason: session.reason || 'Đổi thời lượng buổi học',
        needs_makeup: false,
      })
      toast.success(`Đã đổi giờ kết thúc tuần này thành ${newEndTime}`)
    } else if (session.rule_id) {
      // Create a move exception for this week with updated end_time
      addSessionException({
        rule_id: session.rule_id,
        original_date: session.date,
        action: 'moved',
        new_date: session.date,
        new_start: session.start_time,
        new_end: newEndTime,
        reason: 'Đổi giờ kết thúc (tuần này)',
        needs_makeup: false,
      })
      toast.success(`Đã cập nhật giờ kết thúc buổi này thành ${newEndTime} (Chỉ tuần này)`)
    }
  }

  const periodHeaderTitle = useMemo(() => {
    if (viewMode === 'day') {
      return format(selectedDate, 'dd/MM/yyyy')
    }
    if (viewMode === 'month') {
      return `Tháng ${format(selectedDate, 'M')} năm ${format(selectedDate, 'yyyy')}`
    }
    const m1 = format(displayedDays[0], 'M')
    const m2 = format(displayedDays[displayedDays.length - 1], 'M')
    const y = format(displayedDays[displayedDays.length - 1], 'yyyy')
    if (m1 === m2) {
      return `Tháng ${m1} năm ${y}`
    }
    return `Tháng ${m1} – Tháng ${m2}, ${y}`
  }, [viewMode, selectedDate, displayedDays])

  const LAYER_ITEMS: { key: keyof CalendarLayerVisibility; label: string; colorClass: string }[] = [
    { key: 'school', label: 'Lịch trường (Tiết S/C)', colorClass: 'bg-[#1A73E8] border-[#1A73E8]' },
    { key: 'tutoring_fixed', label: 'Dạy thêm cố định', colorClass: 'bg-[#EA580C] border-[#EA580C]' },
    { key: 'tutoring_extra', label: 'Phát sinh & Dạy bù', colorClass: 'bg-[#7C3AED] border-[#7C3AED]' },
    { key: 'duty', label: 'Ca Trực trường', colorClass: 'bg-slate-500 border-slate-500' },
    { key: 'holiday', label: 'Ngày nghỉ lễ', colorClass: 'bg-rose-500 border-rose-500' },
  ]

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="h-[100dvh] flex flex-col bg-white dark:bg-[#1E1F22] overflow-hidden pb-[60px] tablet:pb-0"
    >
      {/* =====================================================================
          1. GOOGLE CALENDAR TOP TOOLBAR (Desktop & Mobile adaptive)
         ===================================================================== */}
      <header className="relative shrink-0 border-b border-gray-200/80 dark:border-[#2D2F34] bg-white dark:bg-[#1E1F22] px-2 tablet:px-4 py-2 z-30 no-print">
        <div className="flex items-center justify-between gap-1.5 tablet:gap-2">
          {/* Left: Hamburger Menu + Today + < > + Period Title */}
          <div className="flex items-center gap-1 tablet:gap-2.5 min-w-0 flex-1">
            {/* Mobile Hamburger -> Opens Left Drawer */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Mở ngăn kéo menu lịch"
              className="tablet:hidden btn-icon p-1.5 text-gray-700 dark:text-gray-200 shrink-0"
            >
              <Menu size={20} />
            </button>

            {/* Desktop Hamburger -> Collapses/Expands 256px Calendar Sidebar */}
            <button
              type="button"
              onClick={() => setDesktopSidebarOpen(prev => !prev)}
              aria-label="Thu gọn hoặc mở rộng cột bên trái"
              title="Ẩn/hiện cột lịch bên trái"
              className="hidden desktop:inline-flex btn-icon text-gray-600 dark:text-gray-300 shrink-0"
            >
              <Menu size={19} />
            </button>

            {/* App Calendar Icon + Title on Desktop */}
            <div className="hidden tablet:flex items-center gap-2 pr-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-[#E8F0FE] dark:bg-[#1A73E8]/25 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center font-extrabold text-sm">
                {format(new Date(), 'd')}
              </div>
              <span className="font-bold text-base text-gray-800 dark:text-gray-100 hidden desktop:inline">
                Lịch Dạy
              </span>
            </div>

            {/* "Hôm nay" Button */}
            <button
              type="button"
              onClick={handleGoToday}
              title="Về ngày hôm nay (Phím T)"
              className="px-2.5 tablet:px-3 py-1.5 rounded-full border border-gray-300 dark:border-[#37393F] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#282A2E] transition-colors shrink-0"
            >
              Hôm nay
            </button>

             {/* Prev / Next Arrows (Visible on both Mobile & Desktop for effortless navigation) */}
             <div className="flex items-center gap-0.5 shrink-0">
               <button
                 type="button"
                 onClick={handlePrevPeriod}
                 aria-label="Kỳ trước"
                 title="Kỳ trước (Phím J hoặc ←)"
                 className="btn-icon p-1 tablet:p-1.5"
               >
                 <ChevronLeft size={18} />
               </button>
               <button
                 type="button"
                 onClick={handleNextPeriod}
                 aria-label="Kỳ sau"
                 title="Kỳ sau (Phím K hoặc →)"
                 className="btn-icon p-1 tablet:p-1.5"
               >
                 <ChevronRight size={18} />
               </button>
             </div>

             {/* Period Title (Click toggles expandable month calendar popover) */}
             <button
               type="button"
               onClick={() => setMobileMonthDropdownOpen(prev => !prev)}
               className="flex items-center gap-1 px-1.5 tablet:px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-[#282A2E] text-xs tablet:text-sm font-extrabold text-gray-900 dark:text-gray-100 min-w-0 truncate"
             >
               <span className="truncate">{periodHeaderTitle}</span>
               <ChevronDown
                 size={14}
                 className={cn(
                   'text-gray-500 transition-transform duration-150 shrink-0',
                   mobileMonthDropdownOpen && 'rotate-180'
                 )}
               />
             </button>
           </div>

           {/* Center: Segmented Quick View Tabs on Tablet/Desktop + Time Filter */}
           <div className="hidden tablet:flex items-center gap-2">
             {/* Quick View Mode Pill Bar */}
             <div className="flex items-center bg-slate-100 dark:bg-[#282A2E] p-0.5 rounded-xl border border-slate-200/80 dark:border-[#37393F]">
               {QUICK_VIEW_TABS.map(tab => {
                 const active = viewMode === tab.key
                 return (
                   <button
                     key={tab.key}
                     type="button"
                     onClick={() => setViewMode(tab.key)}
                     className={cn(
                       'px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
                       active
                         ? 'bg-[#1A73E8] text-white shadow-xs'
                         : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                     )}
                   >
                     {tab.label}
                   </button>
                 )
               })}
             </div>

             {/* Sáng / Chiều / Tối Filter Pills */}
             <div className="hidden desktop:flex items-center bg-slate-100 dark:bg-[#282A2E] p-0.5 rounded-xl border border-slate-200/80 dark:border-[#37393F]">
               {[
                 { key: 'all', label: 'Tất cả', icon: null },
                 { key: 'morning', label: 'Sáng', icon: Sunrise },
                 { key: 'afternoon', label: 'Chiều', icon: Sun },
                 { key: 'evening', label: 'Tối', icon: Moon },
               ].map(item => {
                 const Icon = item.icon
                 const active = timeFilter === item.key
                 return (
                   <button
                     key={item.key}
                     type="button"
                     onClick={() => setTimeFilter(item.key as TimeOfDayFilter)}
                     className={cn(
                       'px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all',
                       active
                         ? 'bg-white dark:bg-[#1E1F22] text-[#1A73E8] dark:text-[#8AB4F8] shadow-xs'
                         : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                     )}
                   >
                     {Icon && <Icon size={12} />}
                     <span>{item.label}</span>
                   </button>
                 )
               })}
             </div>
           </div>

           {/* Right: Search + Display Settings + Shortcuts "?" */}
           <div className="flex items-center gap-1 tablet:gap-1.5 shrink-0">
             {/* Search Input on Desktop */}
             <div className="hidden desktop:block relative w-44">
               <Search
                 size={14}
                 className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
               />
               <input
                 ref={searchInputRef}
                 type="text"
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 placeholder="Tìm lớp, môn (/)..."
                 className="w-full rounded-xl bg-slate-100 dark:bg-[#282A2E] border border-transparent focus:border-[#1A73E8] focus:bg-white dark:focus:bg-[#1E1F22] pl-8 pr-6 py-1 text-xs text-gray-800 dark:text-gray-200 transition-all"
               />
               {searchQuery && (
                 <button
                   type="button"
                   onClick={() => setSearchQuery('')}
                   className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                 >
                   <X size={13} />
                 </button>
               )}
             </div>

            {/* Display Settings Popover Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDisplayMenuOpen(prev => !prev)}
                aria-label="Cài đặt hiển thị lịch"
                title="Cài đặt hiển thị trục giờ, mật độ, xuất ảnh"
                className="btn-icon text-gray-600 dark:text-gray-300"
              >
                <SlidersHorizontal size={17} />
              </button>

              {displayMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-[#282A2E] shadow-xl border border-gray-200 dark:border-[#37393F] p-4 z-50 text-xs flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#37393F] pb-2">
                    <span className="font-bold text-gray-900 dark:text-white">
                      Cài đặt hiển thị lịch
                    </span>
                    <button
                      type="button"
                      onClick={() => setDisplayMenuOpen(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Mobile Time Filter inside menu */}
                  <div className="desktop:hidden">
                    <label className="text-[11px] font-semibold text-gray-500 block mb-1">
                      Lọc khung giờ
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { key: 'all', label: 'Tất cả' },
                        { key: 'morning', label: 'Sáng' },
                        { key: 'afternoon', label: 'Chiều' },
                        { key: 'evening', label: 'Tối' },
                      ].map(it => (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => setTimeFilter(it.key as TimeOfDayFilter)}
                          className={cn(
                            'py-1 rounded-lg font-semibold border',
                            timeFilter === it.key
                              ? 'border-[#1A73E8] bg-blue-50 dark:bg-blue-950/50 text-[#1A73E8]'
                              : 'border-gray-200 dark:border-[#37393F]'
                          )}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Density */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Mật độ lưới giờ</span>
                    <select
                      value={settings.calendar_density || 'comfortable'}
                      onChange={e =>
                        updateSettings({ calendar_density: e.target.value as any })
                      }
                      className="rounded-lg border border-gray-300 dark:border-[#37393F] bg-white dark:bg-[#1E1F22] px-2 py-1 text-xs"
                    >
                      <option value="comfortable">Thoáng (Chuẩn)</option>
                      <option value="compact">Thu gọn</option>
                    </select>
                  </div>

                  {/* Overlay Sáng/Chiều/Tối */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-700 dark:text-gray-300">
                      Lớp nền phụ Sáng / Chiều / Tối
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.show_session_overlay !== false}
                      onChange={e =>
                        updateSettings({ show_session_overlay: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-[#1A73E8]"
                    />
                  </label>

                  {/* Collapse Noon */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-700 dark:text-gray-300">
                      Thu gọn giờ trưa trống (12h–13h)
                    </span>
                    <input
                      type="checkbox"
                      checked={!!settings.collapse_empty_noon}
                      onChange={e =>
                        updateSettings({ collapse_empty_noon: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-[#1A73E8]"
                    />
                  </label>

                  {/* Axis Start / End Hour */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-gray-500 block mb-0.5">
                        Giờ bắt đầu trục
                      </span>
                      <select
                        value={settings.day_start_hour ?? 6}
                        onChange={e =>
                          updateSettings({ day_start_hour: Number(e.target.value) })
                        }
                        className="w-full rounded-lg border border-gray-300 dark:border-[#37393F] bg-white dark:bg-[#1E1F22] px-2 py-1 text-xs"
                      >
                        {[5, 6, 7, 8].map(h => (
                          <option key={h} value={h}>
                            0{h}:00
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block mb-0.5">
                        Giờ kết thúc trục
                      </span>
                      <select
                        value={settings.day_end_hour ?? 22}
                        onChange={e =>
                          updateSettings({ day_end_hour: Number(e.target.value) })
                        }
                        className="w-full rounded-lg border border-gray-300 dark:border-[#37393F] bg-white dark:bg-[#1E1F22] px-2 py-1 text-xs"
                      >
                        {[20, 21, 22, 23, 24].map(h => (
                          <option key={h} value={h}>
                            {h}:00
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Actions inside Display Menu */}
                  <div className="pt-2 border-t border-gray-100 dark:border-[#37393F] flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDisplayMenuOpen(false)
                        setShowExportModal(true)
                      }}
                      className="btn-secondary w-full py-1.5 text-xs justify-start"
                    >
                      <Download size={14} className="text-[#1A73E8]" />
                      Xuất ảnh tuần (.PNG) & Google Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDisplayMenuOpen(false)
                        handleCopyWeekToNext()
                      }}
                      className="btn-secondary w-full py-1.5 text-xs justify-start"
                    >
                      <Copy size={14} />
                      Sao chép dời/hủy sang tuần sau
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDisplayMenuOpen(false)
                        window.print()
                      }}
                      className="btn-secondary w-full py-1.5 text-xs justify-start"
                    >
                      <Printer size={14} />
                      In lịch dạy tuần
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Keyboard Shortcuts "?" Button (Section 5.4) */}
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              aria-label="Phím tắt bàn phím"
              title="Danh sách phím tắt (Phím ?)"
              className="hidden tablet:inline-flex btn-icon text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <HelpCircle size={18} />
            </button>
          </div>
        </div>

        {/* Expandable Mini Calendar when clicking Month Title (Inline drawer on Mobile like Google Calendar, Popover on Desktop) */}
        {mobileMonthDropdownOpen && (
          <>
            <div
              className="hidden tablet:block fixed inset-0 z-40"
              onClick={() => setMobileMonthDropdownOpen(false)}
            />
            <div className="tablet:hidden mt-2 pt-2 border-t border-slate-100 dark:border-[#2D2F34]">
              <MiniCalendar
                selectedDate={selectedDate}
                highlightedWeekStart={currentWeekStart}
                datesWithSessions={datesWithSessions}
                onSelectDate={d => {
                  setSelectedDate(d)
                  setMobileMonthDropdownOpen(false)
                }}
              />
            </div>
            <div className="hidden tablet:block absolute left-44 top-full mt-1.5 p-3 rounded-2xl bg-white dark:bg-[#282A2E] border border-gray-200 dark:border-[#37393F] w-72 shadow-xl z-50">
              <MiniCalendar
                selectedDate={selectedDate}
                highlightedWeekStart={currentWeekStart}
                datesWithSessions={datesWithSessions}
                onSelectDate={d => {
                  setSelectedDate(d)
                  setMobileMonthDropdownOpen(false)
                }}
              />
            </div>
          </>
        )}

        {/* Mobile Row 2: Google Calendar Style View Switcher Pills */}
        <div className="tablet:hidden mt-2 flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5">
          {MOBILE_VIEW_TABS.map(tab => {
            const active = viewMode === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setViewMode(tab.key)}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all border',
                  active
                    ? 'bg-[#E8F0FE] dark:bg-blue-950/80 text-[#1A73E8] dark:text-[#8AB4F8] border-[#1A73E8]/40 shadow-2xs'
                    : 'bg-transparent text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#37393F]'
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Mobile Compact "Hôm nay" Next Session & Makeup Chips Banner (Section 5.7) */}
        {(nextUpcomingInfo || makeupNeeded.length > 0) && (
          <div className="tablet:hidden mt-2 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {nextUpcomingInfo && (
              <button
                type="button"
                onClick={() => setSelectedSession(nextUpcomingInfo.session)}
                className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs"
              >
                <span className="w-2 h-2 rounded-full bg-[#1A73E8] animate-pulse" />
                <span className="font-bold text-gray-900 dark:text-white">
                  {nextUpcomingInfo.session.class_name} ({nextUpcomingInfo.session.start_time})
                </span>
                <span className="text-[#1A73E8] dark:text-[#8AB4F8] font-semibold">
                  · {nextUpcomingInfo.statusText}
                </span>
              </button>
            )}

            {makeupNeeded.map(ex => {
              const rule = scheduleRules.find(r => r.id === ex.rule_id)
              const cls = classes.find(c => c.id === rule?.class_id)
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => {
                    setAddExtraDefaults({ date: dateToStr(new Date()), makeupId: ex.id })
                    setShowAddExtraModal(true)
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300"
                >
                  <AlertTriangle size={12} className="text-amber-600" />
                  <span>Cần bù: {cls?.name || 'Lớp'} ({formatDate(ex.original_date)})</span>
                </button>
              )
            })}
          </div>
        )}
      </header>

      {/* =====================================================================
          2. MAIN CALENDAR WORKSPACE (Left Sidebar + Active View)
         ===================================================================== */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* DESKTOP LEFT SIDEBAR (~256px, collapsible - Section 5.2) */}
        {desktopSidebarOpen && (
          <aside className="hidden desktop:flex w-64 shrink-0 flex-col border-r border-gray-200/80 dark:border-[#2D2F34] bg-white dark:bg-[#1E1F22] p-3.5 gap-4 overflow-y-auto scrollbar-thin no-print">
            {/* "+ Tạo" Button + "Thêm" Dropdown Menu (Section 5.2) */}
            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setQuickAddState({
                    open: true,
                    date: dateToStr(selectedDate),
                    start: '18:00',
                    end: '19:30',
                  })
                }
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-white dark:bg-[#282A2E] hover:bg-gray-50 dark:hover:bg-[#313338] text-gray-800 dark:text-gray-100 font-bold text-sm shadow-gcal border border-gray-200/80 dark:border-[#37393F] transition-all"
              >
                <Plus size={20} className="text-[#1A73E8]" />
                <span>Tạo buổi học</span>
              </button>

              <button
                type="button"
                onClick={() => setCreateMenuOpen(prev => !prev)}
                aria-label="Menu thêm từ tin nhắn Zalo hoặc ảnh"
                title="Thêm từ tin nhắn Zalo hoặc Ảnh TKB trường"
                className="py-2.5 px-2.5 rounded-2xl bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-sm font-semibold text-xs flex items-center gap-1"
              >
                <span>Thêm</span>
                <ChevronDown size={14} />
              </button>

              {createMenuOpen && (
                <div className="absolute left-0 right-0 top-12 bg-white dark:bg-[#282A2E] rounded-2xl shadow-xl border border-gray-200 dark:border-[#37393F] py-1.5 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setAddExtraDefaults({ date: dateToStr(selectedDate) })
                      setShowAddExtraModal(true)
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-[#313338] flex items-center gap-2.5 font-medium"
                  >
                    <Plus size={15} className="text-purple-600" />
                    <span>Thêm buổi phát sinh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setShowZaloModal(true)
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-[#313338] flex items-center gap-2.5 font-medium"
                  >
                    <MessageSquare size={15} className="text-[#1A73E8]" />
                    <span>Dán tin nhắn Zalo / SMS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setShowSchoolModal(true)
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-[#313338] flex items-center gap-2.5 font-medium"
                  >
                    <Camera size={15} className="text-emerald-600" />
                    <span>Nhập lịch trường từ ảnh</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mini Calendar */}
            <MiniCalendar
              selectedDate={selectedDate}
              highlightedWeekStart={currentWeekStart}
              datesWithSessions={datesWithSessions}
              onSelectDate={d => setSelectedDate(d)}
            />

            {/* "Lịch của tôi" Layer Checkboxes (Section 5.2 & 5.3) */}
            <div className="border-t border-gray-100 dark:border-[#2D2F34] pt-3">
              <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 px-1">
                Lịch của tôi
              </div>
              <div className="flex flex-col gap-1.5">
                {LAYER_ITEMS.map(layer => {
                  const checked = calendarLayers[layer.key]
                  return (
                    <label
                      key={layer.key}
                      className="flex items-center gap-2.5 px-1.5 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-[#282A2E] cursor-pointer text-xs select-none"
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleCalendarLayer(layer.key)}
                        className={cn(
                          'w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0',
                          checked
                            ? `${layer.colorClass} text-white`
                            : 'border-gray-300 dark:border-gray-600 bg-transparent'
                        )}
                      >
                        {checked && <Check size={11} strokeWidth={3} />}
                      </button>
                      <span className="text-gray-700 dark:text-gray-300 font-medium truncate">
                        {layer.label}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* "Buổi cần dạy bù" Panel (Section 5.2) */}
            <div className="border-t border-gray-100 dark:border-[#2D2F34] pt-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Buổi cần dạy bù
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                    {makeupNeeded.length}
                  </span>
                </div>
                {makeupNeeded.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAllMakeup(true)}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                    title="Xóa tất cả buổi chờ dạy bù"
                  >
                    Xóa hết
                  </button>
                )}
              </div>
              {makeupNeeded.length === 0 ? (
                <p className="text-[11px] text-gray-400 px-1">
                  Không có buổi hủy nào đang chờ dạy bù trong tháng này.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {makeupNeeded.map(ex => {
                    const rule = scheduleRules.find(r => r.id === ex.rule_id)
                    const cls = classes.find(c => c.id === rule?.class_id)
                    return (
                      <div
                        key={ex.id}
                        className="p-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-xs flex items-center justify-between gap-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-amber-950 dark:text-amber-200 truncate">
                            {cls?.name || 'Lớp'}
                          </div>
                          <div className="text-[10px] text-amber-700 dark:text-amber-400">
                            Nghỉ {formatDate(ex.original_date)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setAddExtraDefaults({
                                date: dateToStr(selectedDate),
                                makeupId: ex.id,
                              })
                              setShowAddExtraModal(true)
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold"
                          >
                            Xếp bù
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMakeupId(ex.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            title="Xóa lịch cần dạy bù này"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Conflict Warning Summary Panel (Section 5.2) */}
            {weekConflicts.length > 0 && (
              <div className="border-t border-gray-100 dark:border-[#2D2F34] pt-3">
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900/60 text-xs">
                  <div className="font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>Cảnh báo trùng lịch ({weekConflicts.length})</span>
                  </div>
                  <p className="text-[11px] text-red-600 dark:text-red-400 leading-snug">
                    Có buổi học bị trùng giờ trong tuần này (được khoanh viền đỏ trên lưới).
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* MOBILE LEFT DRAWER (Section 5.7: ☰ opens left drawer with MiniCalendar, Layer toggles, Settings shortcut) */}
        {mobileDrawerOpen && (
          <div className="tablet:hidden fixed inset-0 z-50 flex">
            <div
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
            />
            <div className="relative z-10 w-72 max-w-[82vw] bg-white dark:bg-[#1E1F22] h-full shadow-2xl p-4 flex flex-col gap-4 overflow-y-auto pb-safe">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2D2F34] pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays size={20} className="text-[#1A73E8]" />
                  <span className="font-bold text-base text-gray-900 dark:text-white">
                    Lịch Dạy GV
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="btn-icon"
                >
                  <X size={18} />
                </button>
              </div>

              {/* View Mode Switcher in Drawer */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Chế độ hiển thị
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {VIEW_MODES.map(vm => (
                    <button
                      key={vm.key}
                      type="button"
                      onClick={() => {
                        setViewMode(vm.key)
                        setMobileDrawerOpen(false)
                      }}
                      className={cn(
                        'py-2 px-2.5 rounded-xl text-xs font-semibold text-left border transition-colors',
                        viewMode === vm.key
                          ? 'bg-[#E8F0FE] dark:bg-blue-950/60 border-[#1A73E8] text-[#1A73E8] dark:text-[#8AB4F8]'
                          : 'border-gray-200 dark:border-[#37393F] text-gray-700 dark:text-gray-300'
                      )}
                    >
                      {vm.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mini Calendar in Drawer */}
              <div className="border-t border-gray-100 dark:border-[#2D2F34] pt-3">
                <MiniCalendar
                  selectedDate={selectedDate}
                  highlightedWeekStart={currentWeekStart}
                  datesWithSessions={datesWithSessions}
                  onSelectDate={d => {
                    setSelectedDate(d)
                    setMobileDrawerOpen(false)
                  }}
                />
              </div>

              {/* Layer Checkboxes in Drawer */}
              <div className="border-t border-gray-100 dark:border-[#2D2F34] pt-3">
                <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Lịch của tôi (Bật / Tắt)
                </div>
                <div className="flex flex-col gap-2">
                  {LAYER_ITEMS.map(layer => {
                    const checked = calendarLayers[layer.key]
                    return (
                      <label
                        key={layer.key}
                        className="flex items-center gap-2.5 py-1 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCalendarLayer(layer.key)}
                          className="w-4 h-4 rounded text-[#1A73E8]"
                        />
                        <span className="text-gray-800 dark:text-gray-200 font-medium">
                          {layer.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Buổi cần dạy bù in Mobile Drawer */}
              {makeupNeeded.length > 0 && (
                <div className="border-t border-gray-100 dark:border-[#2D2F34] pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Buổi cần dạy bù
                      </span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                        {makeupNeeded.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDrawerOpen(false)
                        setConfirmClearAllMakeup(true)
                      }}
                      className="text-[11px] font-semibold text-rose-600 dark:text-rose-400"
                    >
                      Xóa hết
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {makeupNeeded.map(ex => {
                      const rule = scheduleRules.find(r => r.id === ex.rule_id)
                      const cls = classes.find(c => c.id === rule?.class_id)
                      return (
                        <div
                          key={ex.id}
                          className="p-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-xs flex items-center justify-between gap-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-amber-950 dark:text-amber-200 truncate">
                              {cls?.name || 'Lớp'}
                            </div>
                            <div className="text-[10px] text-amber-700 dark:text-amber-400">
                              Nghỉ {formatDate(ex.original_date)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setMobileDrawerOpen(false)
                                setAddExtraDefaults({
                                  date: dateToStr(selectedDate),
                                  makeupId: ex.id,
                                })
                                setShowAddExtraModal(true)
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-bold"
                            >
                              Xếp bù
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMobileDrawerOpen(false)
                                setConfirmDeleteMakeupId(ex.id)
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600"
                              title="Xóa lịch bù"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Shortcut to Settings & Export */}
              <div className="mt-auto border-t border-gray-100 dark:border-[#2D2F34] pt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false)
                    setShowExportModal(true)
                  }}
                  className="btn-secondary w-full justify-start text-xs"
                >
                  <Download size={15} className="text-[#1A73E8]" />
                  Xuất ảnh tuần & Google Calendar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false)
                    navigate('/settings')
                  }}
                  className="btn-secondary w-full justify-start text-xs"
                >
                  <SettingsIcon size={15} />
                  Cài đặt giờ tiết & hệ thống
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            3. ACTIVE CALENDAR VIEW BODY
           ================================================================= */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Group B3: Per-week School Timetable Status Banner (Only shown when in school_grid or missing school schedule) */}
          {calendarLayers.school && (viewMode === 'school_grid' || !hasSchoolScheduleThisWeek) && (
            <div className="shrink-0 px-3 py-1.5 border-b border-gray-200/80 dark:border-[#2D2F34] bg-slate-50/90 dark:bg-[#232529] no-print">
              {!hasSchoolScheduleThisWeek ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                    <span>
                      Chưa có thời khóa biểu trường cho tuần này (Tuần từ{' '}
                      {formatDate(currentWeekMonday)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSchoolModal(true)}
                      className="px-2.5 py-1 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs"
                    >
                      <Camera size={13} />
                      <span>Nhập từ ảnh</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopySchoolFromPreviousWeek}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#2D2F34] hover:bg-gray-100 dark:hover:bg-[#37393F] text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-[#43464E] font-semibold text-xs inline-flex items-center gap-1.5"
                    >
                      <Copy size={13} />
                      <span>Sao chép từ tuần trước</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-[#1A73E8]" />
                    <span>
                      TKB trường tuần từ <strong>{formatDate(currentWeekMonday)}</strong>:{' '}
                      <strong className="text-[#1A73E8] dark:text-[#8AB4F8]">
                        {weekTeachingPeriodCount} tiết dạy
                      </strong>
                      {currentWeekConfig?.teacher_name
                        ? ` · ${currentWeekConfig.teacher_name}`
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300 font-medium select-none">
                      <input
                        type="checkbox"
                        checked={isAfternoonLongBreak}
                        onChange={(e) =>
                          setSchoolWeekConfig(currentWeekMonday, {
                            afternoon_long_break: e.target.checked,
                            afternoon_break_minutes: 20,
                          })
                        }
                        className="w-3.5 h-3.5 rounded text-[#1A73E8]"
                      />
                      <span>Chiều có ra chơi dài (20p sau C2)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowApplyWeeksModal(true)}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-[#1A73E8] dark:text-[#8AB4F8] border border-blue-200 dark:border-blue-800 font-bold text-xs inline-flex items-center gap-1"
                    >
                      <Copy size={12} />
                      <span>Áp dụng thêm tuần</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSchoolModal(true)}
                      className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-semibold text-xs inline-flex items-center gap-1"
                    >
                      <Camera size={12} />
                      <span>Nhập lại ảnh</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'session_matrix' && (
            <SessionMatrixView
              days={weekDays}
              sessionsByDay={sessionsByDay}
              onSelectSession={s => setSelectedSession(s)}
              onSelectDayHeader={day => {
                setSelectedDate(day)
                setViewMode('day')
              }}
              onQuickCreate={(dateStr, start, end) =>
                setQuickAddState({ open: true, date: dateStr, start, end })
              }
            />
          )}

          {(viewMode === 'week' ||
            viewMode === 'day' ||
            viewMode === '4days' ||
            viewMode === '3days') && (
            <TimeGridCalendar
              days={displayedDays}
              sessionsByDay={sessionsByDay}
              holidays={holidays}
              settings={settings}
              timeFilter={timeFilter}
              onSelectSession={s => setSelectedSession(s)}
              onSelectDayHeader={day => {
                setSelectedDate(day)
                setViewMode('day')
              }}
              onQuickCreate={(dateStr, start, end) =>
                setQuickAddState({ open: true, date: dateStr, start, end })
              }
              onRequestMoveSession={(session, targetDateStr, newStart, newEnd) => {
                setSelectedSession(session)
                setMovePrefill({ date: targetDateStr, start: newStart, end: newEnd })
                setShowMoveModal(true)
              }}
              onResizeSession={handleResizeSession}
            />
          )}

          {viewMode === 'month' && (
            <MonthCalendarView
              currentDate={selectedDate}
              computeDaySessions={computeFilteredDaySessions}
              holidays={holidays}
              onSelectSession={s => setSelectedSession(s)}
              onSwitchToDay={day => {
                setSelectedDate(day)
                setViewMode('day')
              }}
              onQuickCreate={(dateStr, start, end) =>
                setQuickAddState({ open: true, date: dateStr, start, end })
              }
            />
          )}

          {viewMode === 'agenda' && (
            <AgendaCalendarView
              days={weekDays}
              selectedDate={selectedDate}
              onSelectDate={d => setSelectedDate(d)}
              sessionsByDay={sessionsByDay}
              onSelectSession={s => setSelectedSession(s)}
              onQuickCreate={(dateStr, start, end) =>
                setQuickAddState({ open: true, date: dateStr, start, end })
              }
            />
          )}

          {viewMode === 'school_grid' && (
            <SchoolPeriodGridView
              weekDays={weekDays}
              sessionsByDay={sessionsByDay}
              onSelectSession={s => setSelectedSession(s)}
            />
          )}
        </div>
      </div>

      {/* =====================================================================
          4. MOBILE FLOATING "+" BUTTON (FAB) & SPEED DIAL MENU (Section 5.7)
         ===================================================================== */}
      <div className="tablet:hidden fixed right-4 bottom-20 z-40 no-print">
        {mobileFabMenuOpen && (
          <>
            <div
              onClick={() => setMobileFabMenuOpen(false)}
              className="fixed inset-0 bg-black/30 backdrop-blur-[1px] -z-10"
            />
            <div className="flex flex-col items-end gap-2.5 mb-3">
              <button
                type="button"
                onClick={() => {
                  setMobileFabMenuOpen(false)
                  setShowSchoolModal(true)
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white dark:bg-[#282A2E] text-gray-800 dark:text-gray-100 shadow-lg border border-gray-200 dark:border-[#37393F] text-xs font-bold"
              >
                <span>Nhập lịch trường từ ảnh</span>
                <Camera size={16} className="text-emerald-600" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileFabMenuOpen(false)
                  setShowZaloModal(true)
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white dark:bg-[#282A2E] text-gray-800 dark:text-gray-100 shadow-lg border border-gray-200 dark:border-[#37393F] text-xs font-bold"
              >
                <span>Dán tin nhắn Zalo</span>
                <MessageSquare size={16} className="text-[#1A73E8]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileFabMenuOpen(false)
                  setAddExtraDefaults({ date: dateToStr(selectedDate) })
                  setShowAddExtraModal(true)
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white dark:bg-[#282A2E] text-gray-800 dark:text-gray-100 shadow-lg border border-gray-200 dark:border-[#37393F] text-xs font-bold"
              >
                <span>Buổi phát sinh</span>
                <Plus size={16} className="text-purple-600" />
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setMobileFabMenuOpen(prev => !prev)}
          aria-label="Tạo buổi học hoặc nhập lịch"
          className={cn(
            'w-14 h-14 rounded-2xl bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-xl flex items-center justify-center transition-transform duration-150 active:scale-95',
            mobileFabMenuOpen && 'rotate-45 bg-gray-800'
          )}
        >
          <Plus size={26} />
        </button>
      </div>

      {/* =====================================================================
          5. MODALS & POPOVERS
         ===================================================================== */}
      <QuickAddModal
        open={quickAddState.open}
        onClose={() => setQuickAddState(prev => ({ ...prev, open: false }))}
        initialDate={quickAddState.date}
        initialStart={quickAddState.start}
        initialEnd={quickAddState.end}
        onOpenDetailed={(date, start, end) => {
          setAddExtraDefaults({ date, start, end })
          setShowAddExtraModal(true)
        }}
      />

      <SessionDetailSheet
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onAttend={classId =>
          navigate(
            `/classes/${classId}${
              selectedSession ? `?date=${selectedSession.date}&start=${selectedSession.start_time}` : ''
            }`
          )
        }
        onMove={s => {
          setMovePrefill({})
          setShowMoveModal(true)
        }}
        onCancelSession={() => setShowCancelModal(true)}
        onRestoreException={exId => {
          deleteSessionException(exId)
          toast.success('Đã khôi phục buổi học về lịch cố định!')
        }}
        onDeleteExtra={extraId => {
          deleteExtraSession(extraId)
          toast.success('Đã xóa buổi phát sinh')
        }}
        onSwitchToSchoolGrid={() => setViewMode('school_grid')}
        onAddGuestStudent={s => {
          setSelectedSession(null)
          setGuestModalSession(s)
        }}
      />

      <ZaloMessageModal
        open={showZaloModal}
        onClose={() => setShowZaloModal(false)}
        currentWeekStart={currentWeekStart}
      />

      <SchoolImageModal
        open={showSchoolModal}
        onClose={() => setShowSchoolModal(false)}
        initialWeekStart={currentWeekMonday}
        onRequestApplyMoreWeeks={() => setShowApplyWeeksModal(true)}
      />

      <ApplySchoolWeeksModal
        open={showApplyWeeksModal}
        onClose={() => setShowApplyWeeksModal(false)}
        sourceWeekStart={currentWeekMonday}
      />

      {guestModalSession && (
        <SessionGuestModal
          isOpen={!!guestModalSession}
          onClose={() => setGuestModalSession(null)}
          presetHostClassId={guestModalSession.class_id}
          presetDate={guestModalSession.date}
          presetStartTime={guestModalSession.start_time}
        />
      )}

      <MoveSessionModal
        open={showMoveModal}
        onClose={() => {
          setShowMoveModal(false)
          setSelectedSession(null)
          setMovePrefill({})
        }}
        session={selectedSession}
        prefillDate={movePrefill.date}
        prefillStart={movePrefill.start}
        prefillEnd={movePrefill.end}
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
        initialDate={addExtraDefaults.date}
        initialStart={addExtraDefaults.start}
        initialEnd={addExtraDefaults.end}
        makeupForId={addExtraDefaults.makeupId}
      />

      <ExportWeekModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        weekStart={currentWeekStart}
        weekDays={weekDays}
        sessionsByDay={sessionsByDay}
      />

      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Confirm delete single makeup item */}
      <ConfirmDialog
        isOpen={Boolean(confirmDeleteMakeupId)}
        onClose={() => setConfirmDeleteMakeupId(null)}
        onConfirm={() => {
          if (confirmDeleteMakeupId) {
            dismissMakeupException(confirmDeleteMakeupId)
            toast.success('Đã xóa lịch cần dạy bù!')
            setConfirmDeleteMakeupId(null)
          }
        }}
        title="Xóa lịch cần dạy bù?"
        message="Bạn có chắc muốn bỏ buổi cần dạy bù này khỏi danh sách chờ dạy bù không? (Buổi nghỉ gốc vẫn được giữ trong lịch sử)"
        confirmText="Xóa lịch bù"
        variant="danger"
      />

      {/* Confirm clear all makeup items */}
      <ConfirmDialog
        isOpen={confirmClearAllMakeup}
        onClose={() => setConfirmClearAllMakeup(false)}
        onConfirm={() => {
          clearAllMakeupExceptions()
          toast.success('Đã xóa toàn bộ danh sách chờ dạy bù!')
          setConfirmClearAllMakeup(false)
        }}
        title="Xóa toàn bộ buổi cần dạy bù?"
        message={`Bạn có chắc muốn xóa tất cả ${makeupNeeded.length} buổi đang chờ dạy bù khỏi danh sách không?`}
        confirmText="Xóa tất cả"
        variant="danger"
      />
    </div>
  )
}
