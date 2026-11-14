import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Moon,
  Sun,
  Bell,
  BellOff,
  Mail,
  Clock,
  Send,
  CheckCircle,
  XCircle,
  Trash2,
  CalendarOff,
  Plus,
  Download,
  Upload,
  Eye,
  EyeOff,
  Sparkles,
  History,
  Cloud,
  RefreshCw,
  GraduationCap,
  Palette,
  Database,
  ShieldCheck,
  Calendar as CalendarIcon,
  Link2,
  Unlink,
  AlertTriangle,
  Copy,
  Check,
  Car,
  LogOut,
  UserCheck,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { TopBar } from '../components/ui/TopBar'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { formatFullDate, formatDate, dateToStr } from '../lib/dateUtils'
import {
  SEASONAL_PERIOD_PRESETS,
  recalculateSchoolPeriods,
} from '../lib/schoolPeriods'
import { computeSessionsForDate } from '../lib/conflictDetector'
import type { SchoolPeriod } from '../types'
import { cn } from '../lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  bootstrapCloudSync,
  fetchHealth,
  pushServerState,
  sendTestEmail,
  connectGoogleCalendar,
  syncGoogleCalendarNow,
  clearGoogleCalendarEvents,
  disconnectGoogleCalendar,
  getGoogleCalendarIcsUrl,
} from '../lib/backendSync'

function buildSchoolPeriodsFromPreset(
  presetKey: 'standard' | 'summer' | 'winter',
  morningCount: number,
  afternoonCount: number,
  validFrom: string,
  validTo: string | null
): Omit<SchoolPeriod, 'id' | 'user_id'>[] {
  const base = SEASONAL_PERIOD_PRESETS[presetKey]?.periods || SEASONAL_PERIOD_PRESETS.standard.periods
  const result: Omit<SchoolPeriod, 'id' | 'user_id'>[] = []

  for (let i = 1; i <= morningCount; i++) {
    const code = `S${i}`
    const match = base.find((p) => p.period_code === code)
    result.push({
      period_code: code,
      session: 'morning',
      start_time: match?.start_time || (i === 6 ? '11:20' : '07:00'),
      end_time: match?.end_time || (i === 6 ? '12:05' : '07:45'),
      schedule_name: SEASONAL_PERIOD_PRESETS[presetKey]?.label || 'Giờ chuẩn',
      valid_from: validFrom,
      valid_to: validTo,
    })
  }

  for (let i = 1; i <= afternoonCount; i++) {
    const code = `C${i}`
    const match = base.find((p) => p.period_code === code)
    result.push({
      period_code: code,
      session: 'afternoon',
      start_time: match?.start_time || (i === 6 ? '17:50' : '13:30'),
      end_time: match?.end_time || (i === 6 ? '18:35' : '14:15'),
      schedule_name: SEASONAL_PERIOD_PRESETS[presetKey]?.label || 'Giờ chuẩn',
      valid_from: validFrom,
      valid_to: validTo,
    })
  }

  return result
}

type SettingsCategory = 'school_periods' | 'gmail' | 'gcal_ai' | 'appearance' | 'backup'

function AccountSummaryBanner() {
  const { profile, logout } = useAuthStore()
  const [confirmLogout, setConfirmLogout] = useState(false)

  if (!profile) return null

  const initials =
    profile.full_name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'GV'

  return (
    <>
      <section className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-blue-200/70 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/70 via-white to-white dark:from-[#1A73E8]/10 dark:via-[#1E1F22] dark:to-[#1E1F22]">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#1A73E8] text-white font-bold text-base flex items-center justify-center shadow-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {profile.full_name}
              </h2>
              {profile.role === 'admin' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950/80 text-[#1A73E8] dark:text-[#8AB4F8]">
                  <ShieldCheck size={12} />
                  Quản trị viên (Admin)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                  <UserCheck size={12} />
                  Giáo viên
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {profile.email}
              {profile.school ? ` · ${profile.school}` : ''}
              {profile.phone ? ` · ${profile.phone}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/70 text-red-600 dark:text-red-400 border border-red-200/70 dark:border-red-800/60 transition-colors"
          >
            <LogOut size={15} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false)
          void logout().then(() => {
            toast.success('Đã đăng xuất khỏi tài khoản.')
          })
        }}
        title="Xác nhận đăng xuất"
        message={`Thầy/cô muốn đăng xuất khỏi tài khoản ${profile.email} trên thiết bị này?`}
        confirmText="Đăng xuất"
        variant="danger"
      />
    </>
  )
}

export function SettingsPage() {
  const {
    darkMode,
    toggleDarkMode,
    settings,
    updateSettings,
    notificationLogs,
    addNotificationLog,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    schoolSchedule,
    schoolPeriods,
    schoolWeekConfigs,
    setSchoolPeriods,
    updateSchoolPeriod,
    holidays,
    addHoliday,
    deleteHoliday,
    students,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    attendance,
    payments,
    paymentTransactions,
    monthLocks,
    changeLogs,
    calendarEventMap,
    calendarSyncLogs,
    sessionNotes,
    userId,
  } = useAppStore()

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('school_periods')
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [syncing, setSyncing] = useState(false)
  const [showEmailPreview, setShowEmailPreview] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // Google Calendar One-Way Sync states (Mục 2.10)
  const [showGCalConnectModal, setShowGCalConnectModal] = useState(false)
  const [gcalAccountInput, setGcalAccountInput] = useState(
    () => settings.gcal_account_email || settings.notify_email || 'giaovien@gmail.com'
  )
  const [gcalAccessTokenInput, setGcalAccessTokenInput] = useState('')
  const [gcalSyncing, setGcalSyncing] = useState(false)
  const [confirmClearGCal, setConfirmClearGCal] = useState(false)
  const [confirmDisconnectGCal, setConfirmDisconnectGCal] = useState(false)
  const [copiedIcs, setCopiedIcs] = useState(false)

  // School Period seasonal preset dates
  const [presetValidFrom, setPresetValidFrom] = useState(
    () => schoolPeriods[0]?.valid_from || '2026-09-01'
  )
  const [presetValidTo, setPresetValidTo] = useState(
    () => schoolPeriods[0]?.valid_to || ''
  )

  // Holidays
  const [newHolidayDate, setNewHolidayDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [newHolidayNote, setNewHolidayNote] = useState('')
  const [deleteHolidayId, setDeleteHolidayId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleNotify = () => updateSettings({ notify_enabled: !settings.notify_enabled })

  // Compute today's actual schedule for email preview using the unified engine (Section 5.8 & 5.9)
  const todayDateStr = dateToStr(new Date())

  const todayComputedSessions = useMemo(() => {
    const all = computeSessionsForDate({
      dateStr: todayDateStr,
      schoolSchedule,
      schoolPeriods,
      schoolWeekConfigs,
      sessionGuests,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      classes,
      holidays,
      settings,
    }).filter((s) => !s.is_cancelled)

    return all.filter((s) => {
      if (s.type === 'duty' && settings.show_duty_in_email === false) return false
      if (settings.notify_content === 'school')
        return s.type === 'school' || s.type === 'duty'
      if (settings.notify_content === 'tutoring')
        return s.type === 'tutoring_fixed' || s.type === 'tutoring_extra'
      return true
    })
  }, [
    todayDateStr,
    schoolSchedule,
    schoolPeriods,
    schoolWeekConfigs,
    sessionGuests,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    classes,
    holidays,
    settings,
  ])

  const todayEmailPayload = useMemo(() => {
    return todayComputedSessions.map((s) => ({
      type:
        s.type === 'school'
          ? 'Trường'
          : s.type === 'duty'
          ? 'Trực'
          : s.type === 'tutoring_extra'
          ? 'Phát sinh'
          : 'Dạy thêm',
      title: s.period_code ? `${s.period_code} · ${s.class_name}` : s.class_name,
      time: `${s.start_time} – ${s.end_time}`,
      location: s.location,
      period_code: s.period_code,
      session_group: s.session_group,
      spans_to_group: s.spans_to_group,
    }))
  }, [todayComputedSessions])

  useEffect(() => {
    void fetchHealth()
      .then(() => setCloudStatus('online'))
      .catch(() => setCloudStatus('offline'))
  }, [])

  const handleSendTestEmail = async () => {
    if (!settings.notify_email) {
      toast.error('Vui lòng nhập email nhận thông báo')
      return
    }

    try {
      const result = await sendTestEmail(settings.notify_email, todayEmailPayload)
      addNotificationLog({
        sent_at: new Date().toISOString(),
        to: settings.notify_email,
        status: 'success',
        error: null,
        subject: `[Kiểm thử Thông báo Lịch dạy] ${formatFullDate(new Date())}`,
      })
      if (result?.result?.simulated) {
        toast.success('Backend đã nhận yêu cầu. SMTP chưa cấu hình nên email được mô phỏng.')
      } else {
        toast.success(`Đã gửi email kiểm thử tới ${settings.notify_email}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gửi email thất bại'
      addNotificationLog({
        sent_at: new Date().toISOString(),
        to: settings.notify_email,
        status: 'error',
        error: message,
        subject: `[Kiểm thử Thông báo Lịch dạy] ${formatFullDate(new Date())}`,
      })
      toast.error(message)
    }
  }

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const result = await bootstrapCloudSync()
      if (result === 'offline') {
        setCloudStatus('offline')
        toast.error('Không kết nối được backend. Hãy chạy Docker PostgreSQL + API.')
        return
      }
      if (result === 'pulled') {
        toast.success('Đã kéo dữ liệu mới nhất từ PostgreSQL')
      } else {
        await pushServerState(userId)
        toast.success('Đã đẩy dữ liệu lên PostgreSQL')
      }
      setCloudStatus('online')
    } catch (err: unknown) {
      setCloudStatus('offline')
      toast.error(err instanceof Error ? err.message : 'Đồng bộ thất bại')
    } finally {
      setSyncing(false)
    }
  }

  // Google Calendar One-Way Sync Handlers (Mục 2.10)
  const handleConnectGCal = async (e: React.FormEvent) => {
    e.preventDefault()
    setGcalSyncing(true)
    try {
      const res = await connectGoogleCalendar({
        accountEmail: gcalAccountInput.trim() || 'giaovien@gmail.com',
        accessToken: gcalAccessTokenInput.trim() || undefined,
      })
      setShowGCalConnectModal(false)
      setGcalAccessTokenInput('')
      toast.success(
        `Đã kết nối lịch riêng "Lịch dạy" và đồng bộ ${res?.initialSync?.created ?? 0} buổi dạy!`
      )
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Kết nối Google Calendar thất bại')
    } finally {
      setGcalSyncing(false)
    }
  }

  const handleSyncGCalNow = async () => {
    setGcalSyncing(true)
    try {
      const res = await syncGoogleCalendarNow()
      toast.success(
        `Đồng bộ thành công: +${res.created} tạo mới, ~${res.updated} cập nhật, -${res.deleted} xóa (${res.unchanged} giữ nguyên)`
      )
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Đồng bộ Google Calendar thất bại')
    } finally {
      setGcalSyncing(false)
    }
  }

  const handleClearGCalEvents = async () => {
    setGcalSyncing(true)
    try {
      const res = await clearGoogleCalendarEvents()
      toast.success(`Đã xóa toàn bộ ${res.deleted} sự kiện đã đồng bộ trên lịch "Lịch dạy".`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Xóa sự kiện thất bại')
    } finally {
      setGcalSyncing(false)
    }
  }

  const handleDisconnectGCal = async () => {
    setGcalSyncing(true)
    try {
      await disconnectGoogleCalendar()
      toast.success('Đã ngắt kết nối Google Calendar.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Ngắt kết nối thất bại')
    } finally {
      setGcalSyncing(false)
    }
  }

  const toggleReminderMinute = (
    target: 'gcal_school_reminders' | 'gcal_extra_reminders',
    minutes: number
  ) => {
    const current = settings[target] || [30]
    const exists = current.includes(minutes)
    const next = exists
      ? current.filter((m) => m !== minutes)
      : [...current, minutes].sort((a, b) => a - b)
    updateSettings({
      [target]: next.length > 0 ? next : [30],
    })
  }

  const handleCopyIcsUrl = () => {
    const url = getGoogleCalendarIcsUrl(userId)
    navigator.clipboard.writeText(url)
    setCopiedIcs(true)
    toast.success('Đã sao chép đường link .ics!')
    setTimeout(() => setCopiedIcs(false), 2000)
  }

  const handleApplySeasonalPreset = (presetKey: 'standard' | 'summer' | 'winter') => {
    const mCount = settings.morning_periods_count ?? 5
    const aCount = settings.afternoon_periods_count ?? 5
    const built = buildSchoolPeriodsFromPreset(
      presetKey,
      mCount,
      aCount,
      presetValidFrom || '2020-01-01',
      presetValidTo || null
    )
    setSchoolPeriods(built)
    toast.success(`Đã áp dụng bộ "${SEASONAL_PERIOD_PRESETS[presetKey].label}" cho bảng tiết!`)
  }

  const handlePeriodCountChange = (session: 'morning' | 'afternoon', newCount: number) => {
    const mCount = session === 'morning' ? newCount : (settings.morning_periods_count ?? 5)
    const aCount = session === 'afternoon' ? newCount : (settings.afternoon_periods_count ?? 5)
    updateSettings(
      session === 'morning'
        ? { morning_periods_count: newCount }
        : { afternoon_periods_count: newCount }
    )
    const built = buildSchoolPeriodsFromPreset(
      'standard',
      mCount,
      aCount,
      presetValidFrom || '2020-01-01',
      presetValidTo || null
    )
    // Preserve custom edited times for existing period codes
    const merged = built.map((b) => {
      const existing = schoolPeriods.find((p) => p.period_code === b.period_code)
      return existing ? { ...b, start_time: existing.start_time, end_time: existing.end_time } : b
    })
    setSchoolPeriods(merged)
    toast.success(`Đã cập nhật số tiết buổi ${session === 'morning' ? 'Sáng' : 'Chiều'} thành ${newCount} tiết`)
  }

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHolidayDate) return
    addHoliday({
      date: newHolidayDate,
      note: newHolidayNote.trim() || 'Nghỉ lễ / Nghỉ chung',
    })
    toast.success(`Đã thêm ngày nghỉ lễ ${formatDate(newHolidayDate)}`)
    setNewHolidayNote('')
  }

  // Group B1: Auto-recalculate school periods based on duration & breaks
  const handleAutoRecalculatePeriods = () => {
    const built = recalculateSchoolPeriods({
      morningStart: settings.morning_start_time || '07:00',
      afternoonStart: settings.afternoon_period_start_time || '13:30',
      periodMinutes: settings.period_duration_minutes || 45,
      shortBreakMinutes: settings.short_break_minutes || 5,
      morningLongBreakMinutes: settings.morning_long_break_minutes ?? 20,
      afternoonLongBreakEnabled: false,
      afternoonLongBreakMinutes: 20,
      morningCount: settings.morning_periods_count ?? 5,
      afternoonCount: settings.afternoon_periods_count ?? 4,
      scheduleName: 'Giờ chuẩn tự tính',
      validFrom: presetValidFrom || '2026-09-01',
    })
    setSchoolPeriods(built)
    toast.success('Đã tự động tính lại toàn bộ khung giờ các tiết Sáng & Chiều!')
  }

  // Backup entire data to JSON
  const handleExportBackup = () => {
    const data = {
      version: '3.1',
      exported_at: new Date().toISOString(),
      classes,
      students,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      schoolSchedule,
      schoolPeriods,
      schoolWeekConfigs,
      holidays,
      sessionNotes,
      attendance,
      payments,
      paymentTransactions,
      monthLocks,
      changeLogs,
      calendarEventMap,
      calendarSyncLogs,
      settings,
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sao-luu-lich-day-${format(new Date(), 'yyyy-MM-dd')}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã xuất file sao lưu dữ liệu thành công!')
  }

  const handleDownloadPreMigrationBackup = () => {
    const raw =
      localStorage.getItem('gv-app-backup-before-v3-migration') ||
      localStorage.getItem('gv-app-backup-before-v2-migration')
    if (!raw) {
      toast('Không có bản sao lưu chuyển đổi cũ trên trình duyệt này.', { icon: 'ℹ️' })
      return
    }
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup-lich-truong-truoc-chuyen-doi.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã tải bản sao lưu tự động trước khi chuyển đổi!')
  }

  // Restore data from JSON
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (!data.classes || !Array.isArray(data.classes)) {
          throw new Error('Định dạng file sao lưu không hợp lệ')
        }

        useAppStore.setState({
          classes: data.classes || [],
          students: data.students || [],
          studentEnrollments: data.studentEnrollments || studentEnrollments,
          studentStatusHistory: data.studentStatusHistory || studentStatusHistory,
          sessionGuests: data.sessionGuests || sessionGuests,
          scheduleRules: data.scheduleRules || [],
          sessionExceptions: data.sessionExceptions || [],
          extraSessions: data.extraSessions || [],
          schoolSchedule: data.schoolSchedule || [],
          schoolPeriods: data.schoolPeriods || schoolPeriods,
          schoolWeekConfigs: data.schoolWeekConfigs || schoolWeekConfigs,
          holidays: data.holidays || [],
          sessionNotes: data.sessionNotes || [],
          attendance: data.attendance || [],
          payments: data.payments || [],
          paymentTransactions: data.paymentTransactions || paymentTransactions,
          monthLocks: data.monthLocks || monthLocks,
          changeLogs: data.changeLogs || changeLogs,
          calendarEventMap: data.calendarEventMap || calendarEventMap,
          calendarSyncLogs: data.calendarSyncLogs || calendarSyncLogs,
        })

        toast.success('Khôi phục dữ liệu từ bản sao lưu thành công!')
      } catch (err: any) {
        toast.error('Lỗi khi khôi phục: ' + (err?.message || 'File không đúng cấu trúc'))
      }
    }
    reader.readAsText(file)
  }

  const CATEGORIES: {
    key: SettingsCategory
    label: string
    subtitle: string
    icon: typeof Clock
  }[] = [
    {
      key: 'school_periods',
      label: 'Lịch trường & Giờ tiết',
      subtitle: 'Giờ các tiết S1–S5, C1–C5, mùa hè/đông, trực',
      icon: GraduationCap,
    },
    {
      key: 'gmail',
      label: 'Thông báo Gmail',
      subtitle: 'Email tự động mỗi sáng & báo cáo tuần',
      icon: Mail,
    },
    {
      key: 'gcal_ai',
      label: 'Google Calendar & AI',
      subtitle: 'Đồng bộ PostgreSQL & Gemini Vision',
      icon: Sparkles,
    },
    {
      key: 'appearance',
      label: 'Giao diện & Khung giờ',
      subtitle: 'Chế độ Sáng/Tối, mốc giờ Sáng/Chiều/Tối',
      icon: Palette,
    },
    {
      key: 'backup',
      label: 'Sao lưu & Ngày nghỉ',
      subtitle: 'Ngày nghỉ lễ chung, xuất/nhập JSON',
      icon: Database,
    },
  ]

  const morningPeriods = schoolPeriods
    .filter((p) => p.session === 'morning')
    .sort((a, b) => a.period_code.localeCompare(b.period_code))
  const afternoonPeriods = schoolPeriods
    .filter((p) => p.session === 'afternoon')
    .sort((a, b) => a.period_code.localeCompare(b.period_code))

  return (
    <div className="min-h-screen pb-24 desktop:pb-10">
      <TopBar
        title="Cài đặt hệ thống"
        subtitle="Tùy chỉnh giờ tiết trường, thông báo Gmail, giao diện và sao lưu"
      />

      {/* Mobile Horizontal Category Pills (< 768px) */}
      <div className="tablet:hidden sticky top-[52px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3 py-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const active = activeCategory === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all',
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                )}
              >
                <Icon size={14} />
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop & Tablet 2-Column Layout (Section 3.5: Nhóm ở cột trái, nội dung nhóm ở cột phải) */}
      <div className="p-4 tablet:p-6 max-w-[1440px] mx-auto space-y-5">
        {/* Account Summary & Logout Card (Section 4.1: Mobile & Desktop Cài đặt > Tài khoản) */}
        <AccountSummaryBanner />

        <div className="grid grid-cols-1 tablet:grid-cols-12 gap-6 items-start">
          {/* Left Column: Category Navigation (4/12 on Tablet, 3/12 on Desktop) */}
          <aside className="hidden tablet:flex tablet:col-span-4 desktop:col-span-3 flex-col gap-1.5 sticky top-[84px]">
            <div className="card p-2 flex flex-col gap-1">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon
                const active = activeCategory === cat.key
                return (
                  <button
                    key={cat.key}
                    onClick={() => setActiveCategory(cat.key)}
                    className={cn(
                      'w-full text-left p-3 rounded-xl transition-all flex items-start gap-3',
                      active
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/60 shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      )}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{cat.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {cat.subtitle}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          {/* Right Column: Active Category Content (8/12 on Tablet, 9/12 on Desktop) */}
          <div className="tablet:col-span-8 desktop:col-span-9 flex flex-col gap-5">
            {/* CATEGORY 1: SCHOOL PERIODS & DUTY SETTINGS (Section 5.8 + Groups A4, B1, B2) */}
            {activeCategory === 'school_periods' && (
              <>
                <section className="card p-5 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <GraduationCap size={20} className="text-blue-600 dark:text-blue-400" />
                        Cấu hình Giờ tiết của trường (Bảng school_periods)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Mỗi tiết chuẩn 45 phút, nghỉ ngắn 5 phút. Buổi sáng bắt đầu 07:00 có ra chơi dài 20 phút sau tiết S2 (08:35–08:55). Buổi chiều bắt đầu 13:30 (mặc định không có ra chơi dài, bật/tắt theo từng tuần).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoRecalculatePeriods}
                      className="btn-primary py-2 px-3.5 text-xs shrink-0"
                    >
                      <RefreshCw size={14} /> Tự động tính lại khung giờ tiết
                    </button>
                  </div>

                  {/* Group B1 & B2 & A4: Duration, Long Break, Duty End Time, and Trial Reminder */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/50">
                    <div>
                      <label className="label text-xs">Thời lượng 1 tiết (phút)</label>
                      <input
                        type="number"
                        min={30}
                        max={60}
                        className="input py-1.5 text-xs font-semibold"
                        value={settings.period_duration_minutes ?? 45}
                        onChange={(e) =>
                          updateSettings({
                            period_duration_minutes: Math.max(30, parseInt(e.target.value, 10) || 45),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Ra chơi dài Sáng sau S2 (phút)</label>
                      <input
                        type="number"
                        min={0}
                        max={45}
                        className="input py-1.5 text-xs font-semibold"
                        value={settings.morning_long_break_minutes ?? 20}
                        onChange={(e) =>
                          updateSettings({
                            morning_long_break_minutes: Math.max(0, parseInt(e.target.value, 10) || 20),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Giờ kết thúc ca "Trực" chiều</label>
                      <input
                        type="time"
                        className="input py-1.5 text-xs font-mono font-semibold"
                        value={settings.duty_end_time || '16:30'}
                        onChange={(e) =>
                          updateSettings({ duty_end_time: e.target.value || '16:30' })
                        }
                      />
                      <span className="text-[10px] text-slate-400">
                        Mặc định: 13:30 – {settings.duty_end_time || '16:30'}
                      </span>
                    </div>
                    <div>
                      <label className="label text-xs">Số buổi học thử mặc định (Mục A4)</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="input py-1.5 text-xs font-semibold"
                        value={settings.default_trial_sessions ?? 2}
                        onChange={(e) =>
                          updateSettings({
                            default_trial_sessions: Math.max(1, parseInt(e.target.value, 10) || 2),
                          })
                        }
                      />
                      <span className="text-[10px] text-slate-400">
                        Nhắc chuyển sang đang học sau {settings.default_trial_sessions ?? 2} buổi
                      </span>
                    </div>
                  </div>

                  {/* Seasonal Presets & Period Counts */}
                  <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                    <div>
                      <label className="label text-xs">Bộ khung giờ mẫu (Áp dụng nhanh)</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(['standard', 'summer', 'winter'] as const).map((presetKey) => (
                          <button
                            key={presetKey}
                            type="button"
                            onClick={() => handleApplySeasonalPreset(presetKey)}
                            className="btn-secondary py-1.5 px-3 text-xs"
                          >
                            <Clock size={13} className="text-blue-600" />
                            {SEASONAL_PERIOD_PRESETS[presetKey].label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div>
                          <label className="text-[11px] font-medium text-slate-500">
                            Áp dụng từ ngày
                          </label>
                          <input
                            type="date"
                            className="input py-1.5 text-xs mt-0.5"
                            value={presetValidFrom}
                            onChange={(e) => setPresetValidFrom(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-500">
                            Đến ngày (tùy chọn)
                          </label>
                          <input
                            type="date"
                            className="input py-1.5 text-xs mt-0.5"
                            value={presetValidTo}
                            onChange={(e) => setPresetValidTo(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label text-xs">Số tiết buổi Sáng</label>
                          <select
                            className="input py-1.5 text-xs font-semibold"
                            value={settings.morning_periods_count ?? morningPeriods.length}
                            onChange={(e) =>
                              handlePeriodCountChange('morning', parseInt(e.target.value, 10))
                            }
                          >
                            <option value={4}>4 tiết (S1–S4)</option>
                            <option value={5}>5 tiết (S1–S5)</option>
                            <option value={6}>6 tiết (S1–S6)</option>
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">Số tiết buổi Chiều</label>
                          <select
                            className="input py-1.5 text-xs font-semibold"
                            value={settings.afternoon_periods_count ?? afternoonPeriods.length}
                            onChange={(e) =>
                              handlePeriodCountChange('afternoon', parseInt(e.target.value, 10))
                            }
                          >
                            <option value={4}>4 tiết (C1–C4)</option>
                            <option value={5}>5 tiết (C1–C5)</option>
                            <option value={6}>6 tiết (C1–C6)</option>
                          </select>
                        </div>
                      </div>

                      {/* Duty ("Trực") visibility options (Section 5.8) */}
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-200/70 dark:border-slate-700 flex flex-col gap-2">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Tùy chọn hiển thị ca "Trực" cả chiều (13:30–{settings.duty_end_time || '16:30'}):
                        </div>
                        <label className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                          <span>Hiện tiết "Trực" trong email thông báo buổi sáng</span>
                          <input
                            type="checkbox"
                            checked={settings.show_duty_in_email !== false}
                            onChange={(e) =>
                              updateSettings({ show_duty_in_email: e.target.checked })
                            }
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </label>
                        <label className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                          <span>Hiện tiết "Trực" khi đồng bộ sang Google Calendar</span>
                          <input
                            type="checkbox"
                            checked={settings.show_duty_in_gcal !== false}
                            onChange={(e) =>
                              updateSettings({ show_duty_in_gcal: e.target.checked })
                            }
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Period Time Tables: Morning & Afternoon side by side */}
                  <div className="grid grid-cols-1 desktop:grid-cols-2 gap-5">
                    {/* Morning Periods */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-amber-50/80 dark:bg-amber-950/30 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                          🌅 BUỔI SÁNG (Mã S1 – S{morningPeriods.length})
                        </span>
                        <span className="text-[11px] text-amber-700 dark:text-amber-400">
                          Bấm vào giờ để sửa
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {morningPeriods.map((p) => (
                          <div
                            key={p.period_code}
                            className="px-4 py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-mono">
                                {p.period_code}
                              </span>
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                Tiết {p.period_code.slice(1)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                className="input py-1 px-2 text-xs w-28 font-mono"
                                value={p.start_time}
                                onChange={(e) =>
                                  updateSchoolPeriod(p.id, {
                                    start_time: e.target.value,
                                  })
                                }
                              />
                              <span className="text-slate-400">–</span>
                              <input
                                type="time"
                                className="input py-1 px-2 text-xs w-28 font-mono"
                                value={p.end_time}
                                onChange={(e) =>
                                  updateSchoolPeriod(p.id, {
                                    end_time: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Afternoon Periods */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-sky-50/80 dark:bg-sky-950/30 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-sky-900 dark:text-sky-300">
                          ☀️ BUỔI CHIỀU (Mã C1 – C{afternoonPeriods.length})
                        </span>
                        <span className="text-[11px] text-sky-700 dark:text-sky-400">
                          Bấm vào giờ để sửa
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {afternoonPeriods.map((p) => (
                          <div
                            key={p.period_code}
                            className="px-4 py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-mono">
                                {p.period_code}
                              </span>
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                Tiết {p.period_code.slice(1)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                className="input py-1 px-2 text-xs w-28 font-mono"
                                value={p.start_time}
                                onChange={(e) =>
                                  updateSchoolPeriod(p.id, {
                                    start_time: e.target.value,
                                  })
                                }
                              />
                              <span className="text-slate-400">–</span>
                              <input
                                type="time"
                                className="input py-1 px-2 text-xs w-28 font-mono"
                                value={p.end_time}
                                onChange={(e) =>
                                  updateSchoolPeriod(p.id, {
                                    end_time: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* CATEGORY 2: GMAIL NOTIFICATIONS */}
            {activeCategory === 'gmail' && (
              <>
                <section className="card p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Mail size={19} className="text-blue-600 dark:text-blue-400" />
                        Thông báo lịch dạy qua Gmail (24/7)
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Tự động gửi lịch thực tế mỗi sáng, chia sẵn 3 nhóm Sáng / Chiều / Tối kèm mã tiết trường.
                      </p>
                    </div>
                    <button
                      onClick={toggleNotify}
                      className={cn(
                        'relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0',
                        settings.notify_enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                          settings.notify_enabled && 'translate-x-6'
                        )}
                      />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                    <div className="tablet:col-span-2">
                      <label className="label text-xs">Email giáo viên nhận thông báo</label>
                      <input
                        className="input text-sm"
                        type="email"
                        value={settings.notify_email}
                        onChange={(e) => updateSettings({ notify_email: e.target.value })}
                        placeholder="giaovien@gmail.com"
                      />
                    </div>

                    <div>
                      <label className="label text-xs">Giờ gửi tự động mỗi sáng</label>
                      <input
                        className="input text-sm"
                        type="time"
                        value={settings.notify_time}
                        onChange={(e) => updateSettings({ notify_time: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="label text-xs">Nội dung lịch gửi</label>
                      <select
                        className="input text-sm"
                        value={settings.notify_content}
                        onChange={(e) =>
                          updateSettings({ notify_content: e.target.value as any })
                        }
                      >
                        <option value="both">Cả lịch trường & dạy thêm</option>
                        <option value="school">Chỉ lịch trường</option>
                        <option value="tutoring">Chỉ lịch dạy thêm</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Báo cáo tổng quan tuần sau vào Chủ nhật
                      </div>
                      <div className="text-xs text-slate-500">
                        Tự động gửi tổng hợp lịch cả tuần kế tiếp vào tối Chủ nhật
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateSettings({ weekly_summary: !settings.weekly_summary })
                      }
                      className={cn(
                        'relative w-11 h-6 rounded-full transition-colors duration-200',
                        settings.weekly_summary ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                          settings.weekly_summary && 'translate-x-5'
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowEmailPreview(true)}
                      className="btn-secondary flex-1"
                    >
                      <Eye size={16} /> Xem trước nội dung email
                    </button>
                    <button onClick={handleSendTestEmail} className="btn-primary flex-1">
                      <Send size={16} /> Gửi email kiểm thử ngay
                    </button>
                  </div>
                </section>

                {/* Notification Logs */}
                <section className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <History size={17} className="text-slate-500" />
                      Lịch sử gửi email thông báo
                    </h3>
                    <span className="text-xs text-slate-400">{notificationLogs.length} bản ghi</span>
                  </div>

                  {notificationLogs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">
                      Chưa có thông báo email nào được ghi nhận.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                      {notificationLogs.slice(0, 20).map((log) => (
                        <div key={log.id} className="py-2.5 flex items-start gap-2.5 text-xs">
                          {log.status === 'success' ? (
                            <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {log.subject || 'Thông báo lịch dạy'}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {format(new Date(log.sent_at), 'HH:mm dd/MM/yyyy')} → {log.to}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* CATEGORY 3: GOOGLE CALENDAR ONE-WAY SYNC (Mục 2.10), POSTGRESQL SYNC & AI */}
            {activeCategory === 'gcal_ai' && (
              <>
                {/* Mục 2.10: Đồng bộ lịch sang Google Calendar (MỘT CHIỀU) */}
                <section className="card p-5 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <CalendarIcon size={19} className="text-blue-600 dark:text-blue-400" />
                        Đồng bộ lịch sang Google Calendar (Một chiều)
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        App là nguồn duy nhất; khi kết nối sẽ tự tạo một lịch riêng tên{' '}
                        <strong className="text-slate-700 dark:text-slate-300">"Lịch dạy"</strong>{' '}
                        trên Google Calendar (quyền tối thiểu, không đọc hay sửa các lịch cá nhân khác) để xem trên điện thoại, đồng hồ thông minh và nhận thông báo nhắc trước giờ dạy.
                      </p>
                    </div>

                    {settings.gcal_connected && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Tự động đồng bộ
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateSettings({ gcal_enabled: !settings.gcal_enabled })
                          }
                          className={cn(
                            'relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0',
                            settings.gcal_enabled
                              ? 'bg-blue-600'
                              : 'bg-slate-300 dark:bg-slate-700'
                          )}
                        >
                          <div
                            className={cn(
                              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                              settings.gcal_enabled && 'translate-x-6'
                            )}
                          />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Yellow Warning Banner when Token Expired (Mục 2.10) */}
                  {settings.gcal_token_expired && (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                        <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                        <div>
                          <div className="font-bold">Cần kết nối lại Google Calendar</div>
                          <div className="mt-0.5">
                            Quyền truy cập đã hết hạn hoặc bị thu hồi. Hãy kết nối lại để tiếp tục đồng bộ lịch dạy.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGCalConnectModal(true)}
                        className="btn-primary py-1.5 px-3 text-xs bg-amber-600 hover:bg-amber-700 shrink-0"
                      >
                        Kết nối lại
                      </button>
                    </div>
                  )}

                  {/* Connection Status & Primary Action Buttons */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                            settings.gcal_connected
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          )}
                        >
                          {settings.gcal_connected ? (
                            <Link2 size={20} />
                          ) : (
                            <Unlink size={20} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {settings.gcal_connected
                                ? 'Đã kết nối lịch riêng "Lịch dạy"'
                                : 'Chưa kết nối Google Calendar'}
                            </span>
                            {settings.gcal_connected && (
                              <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                {calendarEventMap.length} sự kiện đang đồng bộ
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {settings.gcal_connected ? (
                              <>
                                Tài khoản:{' '}
                                <strong>{settings.gcal_account_email || 'giaovien@gmail.com'}</strong>{' '}
                                · Mã lịch:{' '}
                                <code className="font-mono text-[11px]">
                                  {settings.gcal_calendar_id || 'lich-day'}
                                </code>
                              </>
                            ) : (
                              'Bấm "Kết nối Google Calendar" để tự động tạo lịch "Lịch dạy" và đẩy các buổi dạy thực tế lên lịch.'
                            )}
                          </div>
                        </div>
                      </div>

                      {!settings.gcal_connected ? (
                        <button
                          type="button"
                          onClick={() => setShowGCalConnectModal(true)}
                          className="btn-primary py-2 px-4 text-xs shrink-0"
                        >
                          <Link2 size={15} /> Kết nối Google Calendar
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void handleSyncGCalNow()}
                            disabled={gcalSyncing}
                            className="btn-primary py-2 px-3.5 text-xs"
                          >
                            <RefreshCw
                              size={14}
                              className={gcalSyncing ? 'animate-spin' : ''}
                            />
                            Đồng bộ ngay
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmClearGCal(true)}
                            disabled={gcalSyncing}
                            className="btn-secondary py-2 px-3 text-xs text-amber-700 dark:text-amber-300"
                          >
                            <Trash2 size={14} /> Xóa sự kiện đã đồng bộ
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDisconnectGCal(true)}
                            disabled={gcalSyncing}
                            className="btn-ghost py-2 px-3 text-xs text-red-600 dark:text-red-400"
                          >
                            <Unlink size={14} /> Ngắt kết nối
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Last Sync Status Summary */}
                    {calendarSyncLogs.length > 0 && (
                      <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <CheckCircle
                            size={14}
                            className={
                              calendarSyncLogs[0].status === 'success'
                                ? 'text-emerald-600'
                                : calendarSyncLogs[0].status === 'partial'
                                ? 'text-amber-500'
                                : 'text-red-500'
                            }
                          />
                          <span>
                            Lần đồng bộ cuối:{' '}
                            <strong>
                              {format(
                                new Date(calendarSyncLogs[0].synced_at),
                                'HH:mm:ss dd/MM/yyyy'
                              )}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-semibold">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{calendarSyncLogs[0].created} tạo mới
                          </span>
                          <span className="text-blue-600 dark:text-blue-400">
                            ~{calendarSyncLogs[0].updated} cập nhật
                          </span>
                          <span className="text-red-600 dark:text-red-400">
                            -{calendarSyncLogs[0].deleted} đã xóa
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sync Configuration Controls (Scope, Weeks Ahead, Reminders, Travel Warning) */}
                  <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                    <div>
                      <label className="label text-xs">Đồng bộ nội dung gì?</label>
                      <select
                        className="input text-sm"
                        value={settings.gcal_content || 'both'}
                        onChange={(e) =>
                          updateSettings({ gcal_content: e.target.value as any })
                        }
                      >
                        <option value="both">Cả lịch trường & dạy thêm</option>
                        <option value="school">Chỉ lịch trường (gồm tiết dạy & trực)</option>
                        <option value="extra">Chỉ lịch dạy thêm & phát sinh</option>
                      </select>
                    </div>

                    <div>
                      <label className="label text-xs">
                        Số tuần đồng bộ phía trước (Mặc định 8 tuần)
                      </label>
                      <select
                        className="input text-sm"
                        value={settings.gcal_weeks_ahead || 8}
                        onChange={(e) =>
                          updateSettings({
                            gcal_weeks_ahead: parseInt(e.target.value, 10) || 8,
                          })
                        }
                      >
                        <option value={4}>4 tuần phía trước</option>
                        <option value={8}>8 tuần phía trước (Khuyên dùng)</option>
                        <option value={12}>12 tuần phía trước</option>
                        <option value={16}>16 tuần phía trước</option>
                      </select>
                    </div>

                    {/* Multi-select Reminders for School vs Tutoring */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                      <label className="label text-xs mb-1.5">
                        Nhắc trước giờ dạy — Lịch trường (chọn nhiều mốc)
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[10, 15, 30, 45, 60].map((min) => {
                          const active = (
                            settings.gcal_school_reminders ||
                            settings.gcal_reminders || [30]
                          ).includes(min)
                          return (
                            <button
                              key={min}
                              type="button"
                              onClick={() =>
                                toggleReminderMinute('gcal_school_reminders', min)
                              }
                              className={cn(
                                'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                                active
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              )}
                            >
                              {min} phút
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                      <label className="label text-xs mb-1.5">
                        Nhắc trước giờ dạy — Dạy thêm & Phát sinh (chọn nhiều mốc)
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[10, 15, 30, 45, 60].map((min) => {
                          const active = (
                            settings.gcal_extra_reminders ||
                            settings.gcal_reminders || [30]
                          ).includes(min)
                          return (
                            <button
                              key={min}
                              type="button"
                              onClick={() =>
                                toggleReminderMinute('gcal_extra_reminders', min)
                              }
                              className={cn(
                                'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                                active
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              )}
                            >
                              {min} phút
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Travel Reminder Option (< 20 mins between different locations) */}
                  <label className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="flex items-start gap-2.5">
                      <Car size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Tự động thêm nhắc "Đi sớm để kịp di chuyển"
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Khi hai buổi dạy liên tiếp trong ngày khác địa điểm và cách nhau dưới 20 phút, sự kiện sau tự động có thêm nhắc sớm và cảnh báo di chuyển.
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.gcal_travel_reminder !== false}
                      onChange={(e) =>
                        updateSettings({ gcal_travel_reminder: e.target.checked })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                  </label>

                  {/* Secondary .ics Subscription Feed with Explicit Caveat (Mục 2.10) */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Đường link đăng ký lịch chỉ đọc (.ics — Tùy chọn phụ)
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyIcsUrl}
                        className="btn-secondary py-1 px-2.5 text-xs"
                      >
                        {copiedIcs ? <Check size={13} /> : <Copy size={13} />}
                        {copiedIcs ? 'Đã chép link' : 'Sao chép link .ics'}
                      </button>
                    </div>
                    <input
                      readOnly
                      className="input py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-slate-500"
                      value={getGoogleCalendarIcsUrl(userId)}
                    />
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      ⚠️ <strong>Lưu ý quan trọng:</strong> Khi đăng ký bằng đường link <code>.ics</code>, Google tự quyết định chu kỳ tải lại (có thể chậm vài giờ), không phù hợp khi cần cập nhật tức thời hoặc nhắc đúng giờ. Phương án chính luôn là <strong>Kết nối Google Calendar</strong> ở trên.
                    </p>
                  </div>
                </section>

                {/* Sync History Log (calendar_sync_log - Mục 2.10) */}
                <section className="card p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <History size={17} className="text-blue-600 dark:text-blue-400" />
                      Lịch sử đồng bộ Google Calendar
                    </h3>
                    <span className="text-xs text-slate-400">
                      {calendarSyncLogs.length} bản ghi
                    </span>
                  </div>

                  {calendarSyncLogs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-5">
                      Chưa có lượt đồng bộ Google Calendar nào.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                      {calendarSyncLogs.slice(0, 25).map((log) => (
                        <div
                          key={log.id}
                          className="py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            {log.status === 'success' ? (
                              <CheckCircle
                                size={15}
                                className="text-emerald-500 shrink-0 mt-0.5"
                              />
                            ) : log.status === 'partial' ? (
                              <AlertTriangle
                                size={15}
                                className="text-amber-500 shrink-0 mt-0.5"
                              />
                            ) : (
                              <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                Đồng bộ lịch "Lịch dạy": +{log.created} tạo · ~{log.updated} sửa · -{log.deleted} xóa
                              </div>
                              {log.error && (
                                <div className="text-[11px] text-red-600 dark:text-red-400 truncate">
                                  Lỗi: {log.error}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">
                            {format(new Date(log.synced_at), 'HH:mm dd/MM/yyyy')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* PostgreSQL Cloud Sync Section */}
                <section className="card p-5 flex flex-col gap-4">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Cloud size={19} className="text-sky-500" />
                    Đồng bộ cơ sở dữ liệu PostgreSQL 16 (Docker Backend)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Dữ liệu được lưu trữ tức thời trên trình duyệt và tự động đồng bộ hai chiều với máy chủ PostgreSQL 16 (có Row Level Security cô lập dữ liệu từng tài khoản).
                  </p>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span
                          className={cn(
                            'w-2.5 h-2.5 rounded-full',
                            cloudStatus === 'online'
                              ? 'bg-emerald-500'
                              : cloudStatus === 'checking'
                              ? 'bg-amber-400'
                              : 'bg-red-500'
                          )}
                        />
                        {cloudStatus === 'checking' && 'Đang kiểm tra kết nối máy chủ...'}
                        {cloudStatus === 'online' && 'Máy chủ Backend & PostgreSQL đang trực tuyến'}
                        {cloudStatus === 'offline' && 'Đang chạy chế độ Offline trên trình duyệt'}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Mã định danh đồng bộ: <code className="font-mono">{userId}</code>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleManualSync()}
                      disabled={syncing}
                      className="btn-secondary py-2 px-4 text-xs shrink-0"
                    >
                      <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                      Đồng bộ DB
                    </button>
                  </div>
                </section>

                {/* Gemini AI Section */}
                <section className="card p-5 flex flex-col gap-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles size={19} className="text-purple-500" />
                    Trí tuệ nhân tạo (Google Gemini 1.5 Flash Vision)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Dùng để đọc ảnh chụp Thời khóa biểu trường thành bảng tiết S1–C5 và phân tích tin nhắn Zalo của phụ huynh/học sinh. Ứng dụng đã tích hợp sẵn bộ đọc tiếng Việt quy tắc, bạn có thể nhập thêm Gemini API Key để tăng độ chính xác.
                  </p>

                  <div>
                    <label className="label text-xs">Google Gemini API Key</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        className="input pr-10 text-sm font-mono"
                        placeholder="AIzaSy..."
                        value={settings.gemini_api_key || ''}
                        onChange={(e) =>
                          updateSettings({ gemini_api_key: e.target.value.trim() })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* CATEGORY 4: APPEARANCE & TIME-OF-DAY THRESHOLDS (Section 5.9) */}
            {activeCategory === 'appearance' && (
              <section className="card p-5 flex flex-col gap-5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Palette size={19} className="text-blue-600 dark:text-blue-400" />
                  Giao diện & Quy tắc chia buổi Sáng / Chiều / Tối
                </h2>

                {/* Dark mode switch */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {darkMode ? (
                      <Moon size={20} className="text-blue-400" />
                    ) : (
                      <Sun size={20} className="text-amber-500" />
                    )}
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {darkMode ? 'Chế độ tối (Dark Mode)' : 'Chế độ sáng (Light Mode)'}
                      </div>
                      <div className="text-xs text-slate-500">
                        Tông màu dịu mắt, tương phản chuẩn Material Design
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleDarkMode}
                    className={cn(
                      'relative w-12 h-6 rounded-full transition-colors duration-200',
                      darkMode ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                        darkMode && 'translate-x-6'
                      )}
                    />
                  </button>
                </div>

                {/* Time-of-day thresholds for Tutoring & Extra sessions (Section 5.9) */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Mốc giờ chia nhóm Sáng / Chiều / Tối (Dành cho Dạy thêm & Phát sinh)
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Lịch trường luôn phân nhóm theo mã tiết (S1–S5 là Sáng, C1–C5 là Chiều). Các buổi dạy thêm và phát sinh được phân nhóm theo giờ bắt đầu dưới đây:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label text-xs">
                        Mốc bắt đầu buổi Chiều (Mặc định 12:00)
                      </label>
                      <input
                        type="time"
                        className="input text-sm font-mono"
                        value={settings.afternoon_start || '12:00'}
                        onChange={(e) =>
                          updateSettings({ afternoon_start: e.target.value || '12:00' })
                        }
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Trước mốc này được tính là buổi Sáng (🌅)
                      </span>
                    </div>

                    <div>
                      <label className="label text-xs">
                        Mốc bắt đầu buổi Tối (Mặc định 17:00)
                      </label>
                      <input
                        type="time"
                        className="input text-sm font-mono"
                        value={settings.evening_start || '17:00'}
                        onChange={(e) =>
                          updateSettings({ evening_start: e.target.value || '17:00' })
                        }
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Từ mốc này trở đi được tính là buổi Tối (🌙)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Calendar Axis & Noon Collapse */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label text-xs">Giờ bắt đầu trục lịch mặc định</label>
                    <input
                      type="number"
                      min={5}
                      max={9}
                      className="input text-sm"
                      value={settings.day_start_hour ?? 6}
                      onChange={(e) =>
                        updateSettings({
                          day_start_hour: Math.max(5, Math.min(9, Number(e.target.value))),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Giờ kết thúc trục lịch mặc định</label>
                    <input
                      type="number"
                      min={19}
                      max={23}
                      className="input text-sm"
                      value={settings.day_end_hour ?? 22}
                      onChange={(e) =>
                        updateSettings({
                          day_end_hour: Math.max(19, Math.min(23, Number(e.target.value))),
                        })
                      }
                    />
                  </div>
                </div>
              </section>
            )}

            {/* CATEGORY 5: BACKUP & HOLIDAYS */}
            {activeCategory === 'backup' && (
              <>
                {/* Holiday Management */}
                <section className="card p-5 flex flex-col gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <CalendarOff size={19} className="text-orange-500" />
                      Ngày nghỉ lễ / Nghỉ chung toàn trường
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ngày nghỉ lễ hiển thị ở hàng "Cả ngày" đầu lưới lịch và tự động ẩn các ca dạy thường kỳ trong ngày đó.
                    </p>
                  </div>

                  <form
                    onSubmit={handleAddHoliday}
                    className="flex flex-col sm:flex-row gap-2.5"
                  >
                    <input
                      type="date"
                      className="input py-2 text-sm sm:w-44 shrink-0"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                    />
                    <input
                      className="input py-2 text-sm flex-1"
                      placeholder="Tên ngày nghỉ (vd: Giỗ Tổ Hùng Vương, Nghỉ lễ 30/4, 20/11...)"
                      value={newHolidayNote}
                      onChange={(e) => setNewHolidayNote(e.target.value)}
                    />
                    <button type="submit" className="btn-primary py-2 px-4 text-xs shrink-0">
                      <Plus size={15} /> Thêm ngày nghỉ
                    </button>
                  </form>

                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {holidays.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        Chưa có ngày nghỉ lễ nào được thiết lập.
                      </p>
                    ) : (
                      holidays.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-800 text-sm"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatDate(h.date)}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 ml-2">
                              — {h.note}
                            </span>
                          </div>
                          <button
                            onClick={() => setDeleteHolidayId(h.id)}
                            className="btn-icon p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Backup & Restore */}
                <section className="card p-5 flex flex-col gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Database size={19} className="text-emerald-600" />
                      Sao lưu & Khôi phục toàn bộ dữ liệu
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tải toàn bộ dữ liệu lớp học, học sinh, bảng tiết trường, điểm danh và học phí về máy dưới dạng file JSON.
                    </p>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    className="hidden"
                    onChange={handleImportBackup}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={handleExportBackup}
                      className="btn-primary py-2.5 flex items-center justify-center gap-2"
                    >
                      <Download size={16} /> Tải file sao lưu (.json)
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary py-2.5 flex items-center justify-center gap-2"
                    >
                      <Upload size={16} /> Khôi phục từ file JSON
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <ShieldCheck size={16} className="text-blue-500 shrink-0" />
                      <span>
                        Hệ thống tự động tạo bản sao lưu an toàn trước khi nâng cấp cấu trúc thời khóa biểu trường theo tiết.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadPreMigrationBackup}
                      className="btn-ghost text-xs text-blue-600 dark:text-blue-400 shrink-0"
                    >
                      Tải bản gốc trước nâng cấp
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Email Preview Modal Grouped by Sáng / Chiều / Tối (Section 5.8 & 5.9) */}
      <Modal
        open={showEmailPreview}
        onClose={() => setShowEmailPreview(false)}
        title="Xem trước email thông báo lịch dạy hằng ngày"
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40 text-xs">
            <p>
              <strong>Người nhận:</strong> {settings.notify_email || '(Chưa cài đặt email)'}
            </p>
            <p className="mt-0.5">
              <strong>Tiêu đề:</strong> [Lịch Dạy] {formatFullDate(new Date())}
            </p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-sans flex flex-col gap-3">
            <h4 className="font-bold text-sm text-blue-700 dark:text-blue-400">
              Chào Thầy/Cô, đây là lịch dạy thực tế hôm nay:
            </h4>

            {todayComputedSessions.length === 0 ? (
              <p className="text-slate-400 py-4 text-center">
                Hôm nay Thầy/Cô không có lịch dạy nào.
              </p>
            ) : (
              (['morning', 'afternoon', 'evening'] as const).map((groupKey) => {
                const items = todayComputedSessions.filter((s) => s.session_group === groupKey)
                if (items.length === 0) return null
                const groupTitle =
                  groupKey === 'morning'
                    ? '🌅 BUỔI SÁNG'
                    : groupKey === 'afternoon'
                    ? '☀️ BUỔI CHIỀU'
                    : '🌙 BUỔI TỐI'
                return (
                  <div key={groupKey} className="flex flex-col gap-1.5">
                    <div className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                      {groupTitle} ({items.length} buổi)
                    </div>
                    {items.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          'p-2.5 rounded-lg border-l-4 bg-slate-50 dark:bg-slate-800/80',
                          s.type === 'school'
                            ? 'border-l-blue-600'
                            : s.type === 'duty'
                            ? 'border-l-slate-500'
                            : s.type === 'tutoring_extra'
                            ? 'border-l-purple-600'
                            : 'border-l-orange-500'
                        )}
                      >
                        <div className="font-bold text-slate-900 dark:text-white">
                          {s.period_code
                            ? `${s.period_code} · ${s.start_time}–${s.end_time} · ${s.class_name}`
                            : `${s.start_time}–${s.end_time} · ${s.class_name}`}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>
                            Loại:{' '}
                            {s.type === 'school'
                              ? 'Trường'
                              : s.type === 'duty'
                              ? 'Trực'
                              : s.type === 'tutoring_extra'
                              ? 'Phát sinh'
                              : 'Dạy thêm'}
                          </span>
                          {s.location && <span>· 📍 {s.location}</span>}
                          {s.spans_to_group && (
                            <span className="text-amber-600 font-semibold">
                              · ↪ Kéo dài sang{' '}
                              {s.spans_to_group === 'afternoon' ? 'Chiều' : 'Tối'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}

            <p className="text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              * Lịch đã tự động quy đổi giờ tiết trường (S1–C5) và cập nhật các buổi dời/hủy/phát sinh mới nhất.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowEmailPreview(false)}
              className="btn-secondary flex-1 text-xs"
            >
              Đóng
            </button>
            <button onClick={handleSendTestEmail} className="btn-primary flex-1 text-xs">
              Gửi email này ngay
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Holiday Confirm */}
      <ConfirmDialog
        open={!!deleteHolidayId}
        onClose={() => setDeleteHolidayId(null)}
        onConfirm={() => {
          if (deleteHolidayId) deleteHoliday(deleteHolidayId)
          toast.success('Đã xóa ngày nghỉ lễ')
        }}
        title="Xóa ngày nghỉ lễ"
        message="Bạn có chắc muốn xóa ngày nghỉ lễ này? Các buổi học trong ngày sẽ hiển thị trở lại."
        confirmLabel="Xóa"
      />

      {/* Google Calendar Connect Modal (Mục 2.10) */}
      <Modal
        open={showGCalConnectModal}
        onClose={() => setShowGCalConnectModal(false)}
        title="Kết nối Google Calendar (Một chiều)"
        size="md"
      >
        <form onSubmit={handleConnectGCal} className="flex flex-col gap-4">
          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/35 border border-blue-200/70 dark:border-blue-800/60 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <div className="font-bold text-blue-800 dark:text-blue-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck size={15} /> Quyền tối thiểu & Bảo mật phía máy chủ
            </div>
            Ứng dụng chỉ xin quyền tạo và quản lý một lịch phụ riêng tên{' '}
            <strong>"Lịch dạy"</strong> (phạm vi <code>calendar.app.created</code>), không đọc hay chỉnh sửa bất kỳ lịch cá nhân nào của bạn. Mã kết nối được mã hóa AES-256-GCM trên máy chủ.
          </div>

          <div>
            <label className="label text-xs">Email tài khoản Google nhận lịch</label>
            <input
              type="email"
              className="input text-sm"
              value={gcalAccountInput}
              onChange={(e) => setGcalAccountInput(e.target.value)}
              placeholder="giaovien@gmail.com"
              required
            />
          </div>

          <div>
            <label className="label text-xs">
              Google OAuth Access Token (Tùy chọn — để trống để dùng chế độ đồng bộ trực tiếp)
            </label>
            <input
              type="password"
              className="input text-xs font-mono"
              value={gcalAccessTokenInput}
              onChange={(e) => setGcalAccessTokenInput(e.target.value)}
              placeholder="ya29.a0..."
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Khi cấu hình OAuth trên máy chủ hoặc nhập Access Token, sự kiện sẽ được đẩy trực tiếp lên Google Calendar API.
            </span>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowGCalConnectModal(false)}
              className="btn-secondary flex-1"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={gcalSyncing}
              className="btn-primary flex-1"
            >
              <Link2 size={15} />
              {gcalSyncing ? 'Đang tạo lịch "Lịch dạy"...' : 'Kết nối & Tạo lịch "Lịch dạy"'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Clear All Synced Events Confirm */}
      <ConfirmDialog
        open={confirmClearGCal}
        onClose={() => setConfirmClearGCal(false)}
        onConfirm={() => void handleClearGCalEvents()}
        title="Xóa toàn bộ sự kiện đã đồng bộ"
        message={`Bạn có chắc muốn xóa toàn bộ ${calendarEventMap.length} sự kiện đã đồng bộ trên lịch "Lịch dạy" của Google Calendar? Dữ liệu gốc trong ứng dụng vẫn được giữ nguyên.`}
        confirmLabel="Xóa sự kiện trên Google Calendar"
      />

      {/* Disconnect Google Calendar Confirm */}
      <ConfirmDialog
        open={confirmDisconnectGCal}
        onClose={() => setConfirmDisconnectGCal(false)}
        onConfirm={() => void handleDisconnectGCal()}
        title="Ngắt kết nối Google Calendar"
        message="Bạn có chắc muốn ngắt kết nối Google Calendar? Mã kết nối trên máy chủ sẽ bị xóa và ứng dụng sẽ dừng tự động đồng bộ."
        confirmLabel="Ngắt kết nối"
      />
    </div>
  )
}
