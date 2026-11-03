import { useAppStore } from '../store/useAppStore'
import type {
  Attendance,
  Class,
  ExtraSession,
  Holiday,
  NotificationLog,
  Payment,
  ScheduleRule,
  SchoolSchedule,
  SessionException,
  SessionNote,
  Settings,
  Student,
} from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || ''

export interface ServerState {
  classes: Class[]
  students: Student[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  schoolSchedule: SchoolSchedule[]
  holidays: Holiday[]
  sessionNotes: SessionNote[]
  attendance: Attendance[]
  payments: Payment[]
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

export async function pushServerState(userId: string): Promise<void> {
  const s = useAppStore.getState()
  const res = await fetch(`${API_BASE}/api/sync`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      classes: s.classes,
      students: s.students,
      scheduleRules: s.scheduleRules,
      sessionExceptions: s.sessionExceptions,
      extraSessions: s.extraSessions,
      schoolSchedule: s.schoolSchedule,
      holidays: s.holidays,
      sessionNotes: s.sessionNotes,
      attendance: s.attendance,
      payments: s.payments,
      settings: s.settings,
      notificationLogs: s.notificationLogs,
    }),
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
    state.sessionExceptions.length > 0
  )
}

export async function bootstrapCloudSync(): Promise<'pulled' | 'pushed' | 'offline'> {
  const userId = useAppStore.getState().userId
  try {
    const remote = await pullServerState(userId)
    if (serverHasData(remote)) {
      useAppStore.setState({
        classes: remote.classes || [],
        students: remote.students || [],
        scheduleRules: remote.scheduleRules || [],
        sessionExceptions: remote.sessionExceptions || [],
        extraSessions: remote.extraSessions || [],
        schoolSchedule: remote.schoolSchedule || [],
        holidays: remote.holidays || [],
        sessionNotes: remote.sessionNotes || [],
        attendance: remote.attendance || [],
        payments: remote.payments || [],
        settings: remote.settings || useAppStore.getState().settings,
        notificationLogs: remote.notificationLogs || [],
      })
      return 'pulled'
    }
    await pushServerState(userId)
    return 'pushed'
  } catch {
    return 'offline'
  }
}

export async function sendTestEmail(to: string, sessions: { type: string; title: string; time: string; location?: string }[]) {
  const res = await fetch(`${API_BASE}/api/email/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, sessions }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Gửi email thất bại')
  return body
}
