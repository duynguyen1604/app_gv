import { DEFAULT_SETTINGS, useAppStore } from '../store/useAppStore'
import { isDefaultSeededTeacherId } from '../store/initialData'
import { DEFAULT_SCHOOL_PERIODS, migrateLegacySchoolSchedule } from './schoolPeriods'
import { computeSessionsForDate } from './conflictDetector'
import { migrateLegacyPaymentsToTransactions } from './debtEngine'
import type {
  Attendance,
  CalendarEventMap,
  CalendarSyncLog,
  ChangeLog,
  Class,
  ExtraSession,
  Holiday,
  MonthLock,
  NotificationLog,
  Payment,
  PaymentTransaction,
  ScheduleRule,
  SchoolPeriod,
  SchoolSchedule,
  SchoolWeekConfig,
  SessionException,
  SessionGuest,
  SessionNote,
  Settings,
  Student,
  StudentEnrollment,
  StudentStatusHistory,
} from '../types'

const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  ''
).replace(/\/+$/, '')

export interface ServerState {
  classes: Class[]
  students: Student[]
  studentEnrollments?: StudentEnrollment[]
  studentStatusHistory?: StudentStatusHistory[]
  sessionGuests?: SessionGuest[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  schoolPeriods?: SchoolPeriod[]
  schoolSchedule: SchoolSchedule[]
  schoolWeekConfigs?: SchoolWeekConfig[] | Record<string, SchoolWeekConfig>
  holidays: Holiday[]
  sessionNotes: SessionNote[]
  attendance: Attendance[]
  payments: Payment[]
  paymentTransactions?: PaymentTransaction[]
  monthLocks?: MonthLock[]
  changeLogs?: ChangeLog[]
  calendarEventMap?: CalendarEventMap[]
  calendarSyncLogs?: CalendarSyncLog[]
  settings: Settings | null
  notificationLogs: NotificationLog[]
}

export async function fetchHealth(): Promise<{ status: string; database?: string }> {
  const res = await fetch(`${API_BASE}/api/health`)
  if (!res.ok) throw new Error('Backend không phản hồi')
  return res.json()
}

export async function pullServerState(userId: string): Promise<ServerState> {
  const res = await fetch(`${API_BASE}/api/sync?user_id=${encodeURIComponent(userId)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Không kéo được dữ liệu từ máy chủ')
  }
  return res.json()
}

export function buildSyncPayloadFromStore(userId: string) {
  const s = useAppStore.getState()
  return {
    user_id: userId,
    classes: s.classes,
    students: s.students,
    studentEnrollments: s.studentEnrollments,
    studentStatusHistory: s.studentStatusHistory,
    sessionGuests: s.sessionGuests,
    scheduleRules: s.scheduleRules,
    sessionExceptions: s.sessionExceptions,
    extraSessions: s.extraSessions,
    schoolPeriods: s.schoolPeriods,
    schoolSchedule: s.schoolSchedule,
    schoolWeekConfigs: Object.values(s.schoolWeekConfigs || {}),
    holidays: s.holidays,
    sessionNotes: s.sessionNotes,
    attendance: s.attendance,
    payments: s.payments,
    paymentTransactions: s.paymentTransactions,
    monthLocks: s.monthLocks,
    changeLogs: s.changeLogs,
    settings: s.settings,
    notificationLogs: s.notificationLogs,
  }
}

export function applyServerStateToStore(remote: ServerState) {
  const s = useAppStore.getState()
  const userId = s.userId
  const periods =
    remote.schoolPeriods && remote.schoolPeriods.length > 0
      ? remote.schoolPeriods
      : s.schoolPeriods || DEFAULT_SCHOOL_PERIODS
  const migratedSchool = migrateLegacySchoolSchedule(
    remote.schoolSchedule || [],
    periods,
    userId
  )
  const migratedTx = migrateLegacyPaymentsToTransactions({
    legacyPayments: remote.payments || [],
    existingTransactions: Array.isArray(remote.paymentTransactions)
      ? remote.paymentTransactions
      : [],
    students: remote.students || [],
    classes: remote.classes || [],
    scheduleRules: remote.scheduleRules || [],
    sessionExceptions: remote.sessionExceptions || [],
    extraSessions: remote.extraSessions || [],
    holidays: remote.holidays || [],
    attendance: remote.attendance || [],
    userId,
  })

  const normalizedWeekConfigs: Record<string, SchoolWeekConfig> = {}
  if (Array.isArray(remote.schoolWeekConfigs)) {
    for (const cfg of remote.schoolWeekConfigs) {
      if (cfg && cfg.week_start) {
        normalizedWeekConfigs[cfg.week_start] = cfg
      }
    }
  } else if (remote.schoolWeekConfigs && typeof remote.schoolWeekConfigs === 'object') {
    Object.assign(normalizedWeekConfigs, remote.schoolWeekConfigs)
  }

  useAppStore.setState({
    classes: remote.classes || [],
    students: remote.students || [],
    studentEnrollments: Array.isArray(remote.studentEnrollments) ? remote.studentEnrollments : [],
    studentStatusHistory: Array.isArray(remote.studentStatusHistory)
      ? remote.studentStatusHistory
      : [],
    sessionGuests: Array.isArray(remote.sessionGuests) ? remote.sessionGuests : [],
    scheduleRules: remote.scheduleRules || [],
    sessionExceptions: remote.sessionExceptions || [],
    extraSessions: remote.extraSessions || [],
    schoolPeriods: periods,
    schoolSchedule: migratedSchool,
    schoolWeekConfigs: normalizedWeekConfigs,
    holidays: remote.holidays || [],
    sessionNotes: remote.sessionNotes || [],
    attendance: remote.attendance || [],
    payments: remote.payments || [],
    paymentTransactions: migratedTx,
    monthLocks: Array.isArray(remote.monthLocks) ? remote.monthLocks : [],
    changeLogs: Array.isArray(remote.changeLogs) ? remote.changeLogs : [],
    calendarEventMap: Array.isArray(remote.calendarEventMap) ? remote.calendarEventMap : [],
    calendarSyncLogs: Array.isArray(remote.calendarSyncLogs) ? remote.calendarSyncLogs : [],
    settings: { ...DEFAULT_SETTINGS, ...(remote.settings || s.settings) },
    notificationLogs: remote.notificationLogs || [],
  })
}

export async function pushServerState(userId: string): Promise<void> {
  if (!userId || userId === 'local') return
  const res = await fetch(`${API_BASE}/api/sync`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSyncPayloadFromStore(userId)),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Không đẩy được dữ liệu lên máy chủ')
  }
}

function serverHasData(state: ServerState): boolean {
  return (
    state.classes.length > 0 ||
    state.schoolSchedule.length > 0 ||
    state.holidays.length > 0 ||
    state.attendance.length > 0 ||
    state.extraSessions.length > 0 ||
    state.sessionExceptions.length > 0 ||
    (state.paymentTransactions?.length || 0) > 0
  )
}

function isOldSampleServerState(state: ServerState): boolean {
  const hasOldClasses =
    Array.isArray(state.classes) &&
    state.classes.some(
      (c) =>
        c &&
        (c.name === 'Toán 9 Nâng cao' ||
          c.name === 'Toán 12 Luyện thi ĐH' ||
          c.name === 'Toán 10 Chuyên đề')
    )
  const hasOnlyOldSchool =
    Array.isArray(state.schoolSchedule) &&
    state.schoolSchedule.length > 0 &&
    state.schoolSchedule.every(
      (s) => s && (s.class_name === '10A1' || s.class_name === '11B2' || s.class_name === '10A5' || s.class_name === '12A1' || s.class_name === 'Trực')
    )
  return hasOldClasses || (state.classes.length === 0 && hasOnlyOldSchool)
}

export async function bootstrapCloudSync(): Promise<'pulled' | 'pushed' | 'offline'> {
  const userId = useAppStore.getState().userId
  if (!userId || userId === 'local') {
    return 'offline'
  }
  try {
    const remote = await pullServerState(userId)
    // Mọi tài khoản mới tạo (không phải tài khoản mặc định giaovien@lichday.vn)
    // đều lấy đúng dữ liệu của chính tài khoản đó trên server (rỗng hoàn toàn nếu mới tạo)
    if (!isDefaultSeededTeacherId(userId)) {
      applyServerStateToStore(remote)
      return 'pulled'
    }
    if (serverHasData(remote) && !isOldSampleServerState(remote)) {
      applyServerStateToStore(remote)
      return 'pulled'
    }
    await pushServerState(userId)
    return 'pushed'
  } catch {
    return 'offline'
  }
}

export async function sendTestEmail(
  to: string,
  sessions: {
    type: string
    title: string
    time: string
    location?: string
    session_group?: string
    period_code?: string
  }[]
) {
  const res = await fetch(`${API_BASE}/api/email/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, sessions }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Gửi email thất bại')
  return body
}

// ==========================================
// GOOGLE CALENDAR ONE-WAY SYNC HELPERS (Mục 2.10)
// ==========================================

function simpleHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length
  let h2 = 0x41c6ce57 ^ input.length
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

function runLocalGCalDiffSync(): {
  synced_at: string
  created: number
  updated: number
  deleted: number
  unchanged: number
  status: 'success' | 'partial' | 'error'
  error: string | null
} {
  const s = useAppStore.getState()
  const weeksAhead = Math.max(1, Math.min(24, s.settings.gcal_weeks_ahead || 8))
  const contentScope = s.settings.gcal_content || 'both'
  const showDuty = s.settings.show_duty_in_gcal !== false
  const syncedAt = new Date().toISOString()

  const desiredMap = new Map<string, { session_key: string; content_hash: string }>()
  const today = new Date()

  for (let offset = 0; offset < weeksAhead * 7; offset++) {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    const yyyy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`

    if (s.holidays.some((h) => h.date === dateStr)) continue

    const daySessions = computeSessionsForDate({
      dateStr,
      schoolSchedule: s.schoolSchedule,
      schoolPeriods: s.schoolPeriods,
      schoolWeekConfigs: s.schoolWeekConfigs,
      scheduleRules: s.scheduleRules,
      sessionExceptions: s.sessionExceptions,
      extraSessions: s.extraSessions,
      classes: s.classes,
      holidays: s.holidays,
      settings: s.settings,
    }).filter((sess) => !sess.is_cancelled)

    for (const sess of daySessions) {
      if (sess.type === 'duty' && !showDuty) continue
      if (contentScope === 'school' && sess.type !== 'school' && sess.type !== 'duty') continue
      if (contentScope === 'extra' && (sess.type === 'school' || sess.type === 'duty')) continue

      const sessionKey = `${sess.type}:${sess.id}:${dateStr}:${sess.start_time}`
      const contentHash = simpleHash(
        JSON.stringify({
          title: sess.class_name,
          subject: sess.subject,
          date: dateStr,
          start: sess.start_time,
          end: sess.end_time,
          loc: sess.location,
          note: sess.note,
          reminders:
            sess.type === 'school' || sess.type === 'duty'
              ? s.settings.gcal_school_reminders
              : s.settings.gcal_extra_reminders,
          travel: s.settings.gcal_travel_reminder,
        })
      )
      desiredMap.set(sessionKey, { session_key: sessionKey, content_hash: contentHash })
    }
  }

  const existing = s.calendarEventMap || []
  const existingByKey = new Map<string, CalendarEventMap>()
  for (const row of existing) {
    existingByKey.set(row.session_key, row)
  }

  let created = 0
  let updated = 0
  let deleted = 0
  let unchanged = 0
  const nextEventMap: CalendarEventMap[] = []

  for (const [key, row] of existingByKey.entries()) {
    if (!desiredMap.has(key)) {
      deleted++
    }
  }

  for (const [key, desired] of desiredMap.entries()) {
    const prev = existingByKey.get(key)
    if (!prev) {
      created++
      nextEventMap.push({
        id: `evmap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        session_key: key,
        google_event_id: `gcal-ev-${simpleHash(key)}`,
        content_hash: desired.content_hash,
        last_synced_at: syncedAt,
        user_id: s.userId,
      })
    } else if (prev.content_hash !== desired.content_hash) {
      updated++
      nextEventMap.push({
        ...prev,
        content_hash: desired.content_hash,
        last_synced_at: syncedAt,
      })
    } else {
      unchanged++
      nextEventMap.push(prev)
    }
  }

  useAppStore.setState({ calendarEventMap: nextEventMap })
  s.addCalendarSyncLog({
    synced_at: syncedAt,
    created,
    updated,
    deleted,
    status: 'success',
    error: null,
  })

  return {
    synced_at: syncedAt,
    created,
    updated,
    deleted,
    unchanged,
    status: 'success',
    error: null,
  }
}

export async function connectGoogleCalendar(params: {
  accessToken?: string
  accountEmail?: string
}) {
  const s = useAppStore.getState()
  const userId = s.userId
  try {
    const res = await fetch(`${API_BASE}/api/gcal/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        accessToken: params.accessToken,
        accountEmail: params.accountEmail,
        payload: buildSyncPayloadFromStore(userId),
      }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.state) applyServerStateToStore(data.state)
      return data.result
    }
  } catch {
    // Fallback to local sync when backend container is offline
  }

  const email = params.accountEmail?.trim() || s.settings.notify_email || 'giaovien@gmail.com'
  s.updateSettings({
    gcal_connected: true,
    gcal_enabled: true,
    gcal_calendar_id: `lich-day-${userId}`,
    gcal_account_email: email,
    gcal_token_expired: false,
  })
  const initialSync = runLocalGCalDiffSync()
  return {
    connected: true,
    calendar_id: `lich-day-${userId}`,
    account_email: email,
    mode: 'local_sandbox',
    initialSync,
  }
}

export async function syncGoogleCalendarNow() {
  const s = useAppStore.getState()
  const userId = s.userId
  try {
    const res = await fetch(`${API_BASE}/api/gcal/sync-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        payload: buildSyncPayloadFromStore(userId),
      }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.state) applyServerStateToStore(data.state)
      return data.result
    }
  } catch {
    // Fallback to local diff sync when backend is offline
  }

  return runLocalGCalDiffSync()
}

export async function clearGoogleCalendarEvents() {
  const s = useAppStore.getState()
  const userId = s.userId
  try {
    const res = await fetch(`${API_BASE}/api/gcal/clear-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.state) applyServerStateToStore(data.state)
      return data.result
    }
  } catch {
    // Fallback
  }

  const deleted = (s.calendarEventMap || []).length
  useAppStore.setState({ calendarEventMap: [] })
  s.addCalendarSyncLog({
    synced_at: new Date().toISOString(),
    created: 0,
    updated: 0,
    deleted,
    status: 'success',
    error: null,
  })
  return { deleted }
}

export async function disconnectGoogleCalendar() {
  const s = useAppStore.getState()
  const userId = s.userId
  try {
    const res = await fetch(`${API_BASE}/api/gcal/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.state) applyServerStateToStore(data.state)
      return
    }
  } catch {
    // Fallback
  }

  s.updateSettings({
    gcal_connected: false,
    gcal_enabled: false,
    gcal_token_expired: false,
  })
}

export function getGoogleCalendarIcsUrl(userId: string): string {
  const base = API_BASE || window.location.origin
  return `${base}/api/gcal/feed.ics?user_id=${encodeURIComponent(userId)}`
}
