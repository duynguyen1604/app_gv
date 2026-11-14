// ============================================================================
// SHARED TYPES FOR CLOUDFLARE PAGES FUNCTIONS & EDGE API
// ============================================================================

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run(): Promise<{ success: boolean }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<unknown>
}

export interface Env {
  DB?: D1Database
  ADMIN_EMAIL?: string
  DEFAULT_ADMIN_EMAIL?: string
  DEFAULT_ADMIN_PASSWORD?: string
  DEFAULT_ADMIN_NAME?: string
  DEFAULT_TEACHER_EMAIL?: string
  DEFAULT_TEACHER_PASSWORD?: string
  DEFAULT_TEACHER_NAME?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_AUTH_REDIRECT_URI?: string
  GEMINI_API_KEY?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  CRON_SECRET?: string
  FRONTEND_ORIGIN?: string
}

export interface PagesContext {
  request: Request
  env: Env
  params: Record<string, string | string[]>
  waitUntil: (promise: Promise<unknown>) => void
}

export type AccountRole = 'admin' | 'teacher'
export type AccountStatus = 'pending' | 'active' | 'locked'
export type RegistrationMode = 'pending_approval' | 'open' | 'invite_only'

export interface UserProfile {
  id: string
  full_name: string
  email: string
  phone: string | null
  school: string | null
  avatar_url?: string | null
  role: AccountRole
  status: AccountStatus
  email_verified: boolean
  auth_provider?: 'email' | 'google' | 'both'
  onboarding_completed?: boolean
  created_at: string
  approved_by: string | null
  approved_at: string | null
  last_login_at: string | null
  locked_reason: string | null
}

export interface StoredUser extends UserProfile {
  password_hash?: string
  google_sub?: string
  token_version?: number
}

export interface AuthSessionRecord {
  token_hash: string
  user_id: string
  remember_me: boolean
  created_at: string
  expires_at: number
  user_agent?: string
}

export interface OneTimeTokenRecord {
  id: string
  token_hash: string
  user_id: string
  email: string
  purpose: 'verify_email' | 'reset_password'
  created_at: string
  expires_at: number
  used_at?: string | null
}

export interface InviteRecord {
  id: string
  email: string | null
  code: string
  max_uses: number
  used_count: number
  expires_at: string | null
  created_by: string | null
  created_at: string
  revoked: boolean
}

export interface AuditLogRecord {
  id: string
  actor_id: string | null
  target_id: string | null
  actor_name?: string | null
  actor_email?: string | null
  target_name?: string | null
  target_email?: string | null
  action: string
  detail: Record<string, unknown>
  ip_masked: string
  created_at: string
}

export interface AppSettingsRecord {
  id: string
  registration_mode: RegistrationMode
  google_login_enabled: boolean
  password_login_enabled: boolean
  notify_admin_email: boolean
  max_accounts: number | null
  updated_at: string
}

export interface AuthStoreData {
  version: number
  users: StoredUser[]
  sessions: AuthSessionRecord[]
  tokens: OneTimeTokenRecord[]
  invites: InviteRecord[]
  auditLogs: AuditLogRecord[]
  appSettings: AppSettingsRecord
}

export interface SupportTicketMessage {
  id: string
  sender_role: 'user' | 'admin'
  sender_name: string
  text: string
  created_at: string
}

export interface SupportTicketRecord {
  id: string
  user_id: string
  user_email: string
  user_name: string
  category: 'support' | 'complaint' | 'bug' | 'account'
  subject: string
  status: 'open' | 'replied' | 'resolved'
  messages: SupportTicketMessage[]
  created_at: string
  updated_at: string
}

export interface ServerState {
  classes: unknown[]
  students: unknown[]
  studentEnrollments: unknown[]
  studentStatusHistory: unknown[]
  sessionGuests: unknown[]
  scheduleRules: unknown[]
  sessionExceptions: unknown[]
  extraSessions: unknown[]
  schoolPeriods: unknown[]
  schoolSchedule: unknown[]
  schoolWeekConfigs: unknown[]
  holidays: unknown[]
  sessionNotes: unknown[]
  attendance: unknown[]
  payments: unknown[]
  paymentTransactions: unknown[]
  monthLocks: unknown[]
  changeLogs: unknown[]
  calendarEventMap: unknown[]
  calendarSyncLogs: unknown[]
  settings: Record<string, unknown> | null
  notificationLogs: unknown[]
}

