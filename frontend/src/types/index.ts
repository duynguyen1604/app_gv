// Supabase & PostgreSQL types - matches our database schema
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
  role: AccountRole // Set strictly on server via ADMIN_EMAIL
  status: AccountStatus // 'pending' | 'active' | 'locked'
  email_verified: boolean
  auth_provider?: 'email' | 'google' | 'both'
  created_at: string
  approved_by: string | null
  approved_at: string | null
  last_login_at: string | null
  locked_reason: string | null
}

export interface PublicAuthConfig {
  registration_mode: RegistrationMode
  google_login_enabled: boolean
  password_login_enabled: boolean
  supabase_configured: boolean
  google_oauth_configured: boolean
  turnstile_site_key: string | null
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

export interface AccountSecuritySummary {
  hasPassword: boolean
  tokenVersion: number
  isFixedServerAdmin: boolean
  adminEmailConfigured: string
}

export interface AdminOverviewData {
  adminEmail: string
  currentAdmin: UserProfile
  stats: {
    totalAccounts: number
    totalTeachers: number
    pendingCount: number
    activeCount: number
    lockedCount: number
    unverifiedCount: number
    activeLast7Days: number
  }
  profiles: UserProfile[]
  appSettings: AppSettingsRecord
  invites: InviteRecord[]
  auditLogs: AuditLogRecord[]
}

export type StudentStatus = 'active' | 'trial' | 'left'
export type AttendanceStatus = 'present' | 'absent' | 'excused'
export type SessionAction = 'moved' | 'cancelled'
export type NotifyContent = 'school' | 'tutoring' | 'both'
export type GCalContentScope = 'school' | 'extra' | 'both'
export type PaymentType = 'per_session' | 'package'
export type PaymentMethod = 'cash' | 'transfer' | 'other'
export type MonthFeeStatus = 'Đủ' | 'Còn thiếu' | 'Chưa đóng' | 'Đóng dư'
export type SchoolSessionType = 'morning' | 'afternoon'
export type SchoolCellType = 'class' | 'duty' | 'other'
export type CalendarViewMode = 'day' | 'week' | 'session_matrix' | 'month' | '4days' | '3days' | 'agenda' | 'school_grid'
export type TimeOfDayGroup = 'morning' | 'afternoon' | 'evening'
export type TimeOfDayFilter = 'all' | 'morning' | 'afternoon' | 'evening'
export type GuestBillingMode = 'home_price' | 'host_price' | 'free' | 'custom'
export type GuestReason = 'conflict' | 'review' | 'other'

export interface CalendarLayerVisibility {
  school: boolean
  tutoring_fixed: boolean
  tutoring_extra: boolean
  duty: boolean
  holiday: boolean
}

export interface Class {
  id: string
  name: string
  location: string
  price: number
  color: string
  created_at: string
  user_id: string
}

export interface Student {
  id: string
  class_id: string
  name: string
  parent_name: string | null
  parent_phone: string | null
  custom_price: number | null
  trial_price?: number | null // Mức học phí học thử / buổi (null/undefined = bằng học phí đi học chính thức)
  status: StudentStatus
  note: string | null
  created_at: string
  start_date?: string // YYYY-MM-DD (E1/E2: Ngày bắt đầu học)
  left_date?: string | null // YYYY-MM-DD (A1/E1: Ngày nghỉ học)
  payment_type?: PaymentType
  package_total_sessions?: number
  package_used_sessions?: number
}

// Group D & E: Student Enrollment (primary class + mid-month class transfers + long-term extra classes)
export interface StudentEnrollment {
  id: string
  student_id: string
  class_id: string
  kind: 'primary' | 'extra'
  schedule_rule_ids: string[] | null // null = all schedule rules of class_id
  price_override: number | null // null = use student.custom_price ?? class.price
  from_date: string // YYYY-MM-DD
  to_date: string | null // YYYY-MM-DD or null
  note: string | null
  created_at: string
  user_id: string
}

// Group A1: Student Status History over time
export interface StudentStatusHistory {
  id: string
  student_id: string
  enrollment_id?: string | null
  status: StudentStatus // 'trial' | 'active' | 'left'
  effective_from: string // YYYY-MM-DD
  note: string | null
  created_at: string
  user_id: string
}

// Group D2: Short-term session guest / swap ("Học ghép 1-2 buổi / học thêm ngắn hạn")
export interface SessionGuest {
  id: string
  host_class_id: string
  date: string // YYYY-MM-DD
  start_time: string // HH:mm
  student_id: string
  kind: 'swap' | 'extra' // 'swap' = chuyển buổi từ lớp gốc, 'extra' = học thêm buổi lẻ
  home_class_id: string | null
  home_session_key: string | null // `${home_class_id}|${home_date}|${home_start}`
  home_date?: string | null
  home_start_time?: string | null
  billing_mode: GuestBillingMode // 'home_price' | 'host_price' | 'free' | 'custom'
  custom_amount: number | null
  billed_class_id: string
  reason: GuestReason // 'conflict' | 'review' | 'other'
  note: string | null
  created_at: string
  user_id: string
}

export interface ScheduleRule {
  id: string
  class_id: string
  weekday: number // 1=Mon ... 7=Sun
  start_time: string // HH:mm
  end_time: string   // HH:mm
  valid_from: string // YYYY-MM-DD
  valid_to: string | null
  user_id: string
}

export interface SessionException {
  id: string
  rule_id: string
  original_date: string
  action: SessionAction
  new_date: string | null
  new_start: string | null
  new_end: string | null
  reason: string | null
  needs_makeup: boolean
  user_id: string
}

export interface ExtraSession {
  id: string
  class_id: string
  date: string
  start_time: string
  end_time: string
  note: string | null
  makeup_for: string | null // SessionException id
  user_id: string
}

export interface SchoolPeriod {
  id: string
  period_code: string // 'S1'..'S5' | 'C1'..'C5' | 'SB1' | 'CB1'
  session: SchoolSessionType // 'morning' | 'afternoon'
  kind?: 'class' | 'break' // B1: 'class' or 'break' (ra chơi dài)
  start_time: string // HH:mm
  end_time: string   // HH:mm
  schedule_name?: string // e.g., 'Mặc định', 'Mùa hè', 'Mùa đông'
  valid_from: string // YYYY-MM-DD
  valid_to: string | null
  user_id: string
}

// Group B1 & B3: Per-week school timetable config (afternoon long break toggle per week)
export interface SchoolWeekConfig {
  week_start: string // Monday YYYY-MM-DD
  afternoon_long_break: boolean // default false
  afternoon_break_minutes: number // default 20
  afternoon_break_days?: number[] | null // optional per-weekday override (1=T2..6=T7)
  declared_period_count?: number | null
  teacher_name?: string | null
}

export interface SchoolSchedule {
  id: string
  week_start: string // B3: Monday YYYY-MM-DD (stored per week, no automatic weekly repeat)
  weekday: number // 1=T2 ... 7=CN
  period_code: string // 'S1'..'S5' | 'C1'..'C5'
  session: SchoolSessionType // 'morning' | 'afternoon'
  cell_type: SchoolCellType // 'class' | 'duty' | 'other'
  class_name: string
  subject: string
  room: string
  note: string
  valid_from: string // kept equal to week_start for backward compatibility
  valid_to: string | null
  afternoon_long_break?: boolean
  afternoon_break_minutes?: number
  user_id: string
  // Backward compatibility fields (optional, auto-populated/resolved)
  period?: string
  start_time?: string
  end_time?: string
}

export interface Holiday {
  id: string
  date: string
  note: string
  user_id: string
}

export interface SessionNote {
  id: string
  class_id: string
  date: string
  start_time: string
  content: string
  user_id: string
}

export interface Attendance {
  id: string
  class_id: string
  date: string
  start_time: string
  student_id: string
  status: AttendanceStatus
  user_id: string
}

// Legacy Payment table (kept for backward-compatibility auto-migration)
export interface Payment {
  id: string
  student_id: string
  month: string // YYYY-MM
  paid: boolean
  paid_at: string | null
  user_id: string
}

// Section 2.9 & Section 3: Payment Transaction (Replaces hardcoded paid checkbox)
export interface PaymentTransaction {
  id: string
  student_id: string
  amount: number // integer VND > 0
  paid_at: string // YYYY-MM-DD
  method: PaymentMethod // 'cash' | 'transfer' | 'other'
  note: string | null
  group_id: string | null // nullable, links sibling split transactions
  created_at: string
  user_id: string
}

export interface MonthLockStudentSnapshot {
  present_count: number
  absent_count: number
  excused_count: number
  trial_count?: number
  guest_count?: number
  price_per_session: number
  due_amount: number
}

// Section 2.9 & Section 3: Month Lock ("Chốt tháng")
export interface MonthLock {
  id: string
  class_id: string
  month: string // YYYY-MM
  locked_at: string
  snapshot: Record<string, MonthLockStudentSnapshot>
  user_id: string
}

// Section 2.9 & Section 3 & Groups A/D/E: Change Log
export interface ChangeLog {
  id: string
  entity:
    | 'payment_transaction'
    | 'attendance'
    | 'month_lock'
    | 'student_status'
    | 'student_enrollment'
    | 'session_guest'
    | 'school_schedule'
  entity_id: string
  action: 'create' | 'update' | 'delete' | 'lock' | 'unlock'
  before: any | null
  after: any | null
  created_at: string
  user_id: string
}

// Section 2.10 & Section 3: Google Calendar Event Map
export interface CalendarEventMap {
  id: string
  session_key: string
  google_event_id: string
  content_hash: string
  last_synced_at: string
  user_id: string
}

// Section 2.10 & Section 3: Google Calendar Sync Log
export interface CalendarSyncLog {
  id: string
  synced_at: string
  created: number
  updated: number
  deleted: number
  status: 'success' | 'partial' | 'error'
  error: string | null
  user_id: string
}

export interface Settings {
  id: string
  user_id: string
  notify_enabled: boolean
  notify_time: string // HH:mm
  notify_email: string
  notify_content: NotifyContent
  weekly_summary: boolean
  gemini_api_key?: string
  // UI & Schedule Display Settings (Section 5 & Group A/B)
  afternoon_start?: string // default '12:00'
  evening_start?: string   // default '17:00'
  show_session_overlay?: boolean // Sáng/Chiều/Tối background tint & labels
  show_duty_in_email?: boolean   // Toggle "Trực" in email
  show_duty_in_gcal?: boolean    // Toggle "Trực" in Google Calendar export
  default_mobile_view?: CalendarViewMode // default 'agenda' or '3days'
  default_desktop_view?: CalendarViewMode // default 'week'
  calendar_density?: 'comfortable' | 'compact'
  day_start_hour?: number // default 6
  day_end_hour?: number   // default 22
  collapse_empty_noon?: boolean
  morning_periods_count?: number // default 5
  afternoon_periods_count?: number // default 4
  // Group A4 & B1/B2 Settings
  default_trial_sessions?: number // default 2 ("Số buổi học thử mặc định")
  duty_end_time?: string // default '16:30' ("Trực kết thúc lúc")
  morning_start_time?: string // default '07:00'
  afternoon_period_start_time?: string // default '13:30'
  period_duration_minutes?: number // default 45
  short_break_minutes?: number // default 5
  morning_long_break_minutes?: number // default 20
  afternoon_long_break_minutes?: number // default 20
  // Google Calendar One-Way Sync Settings (Section 2.10 & Section 3)
  gcal_enabled?: boolean
  gcal_calendar_id?: string | null
  gcal_connected?: boolean
  gcal_account_email?: string | null
  gcal_token_expired?: boolean
  gcal_content?: GCalContentScope // 'school' | 'extra' | 'both'
  gcal_reminders?: number[] // default [30]
  gcal_school_reminders?: number[] // default [30]
  gcal_extra_reminders?: number[] // default [30]
  gcal_weeks_ahead?: number // default 8
  gcal_travel_reminder?: boolean // default true
}

export interface NotificationLog {
  id: string
  sent_at: string
  to: string
  status: 'success' | 'error'
  error: string | null
  subject: string | null
  user_id: string
}

// AI Message & Schedule Parsing types
export interface ParsedScheduleItem {
  id?: string
  action: 'add' | 'move' | 'cancel'
  date: string // YYYY-MM-DD
  start_time: string | null // HH:mm
  end_time: string | null   // HH:mm
  class_match: string | null // class id
  class_text: string
  move_from_date: string | null
  confidence: number // 0-1
  ambiguity: string | null
  source_text: string
  conflict_warning?: string | null
}

export interface ParsedSchoolScheduleItem {
  id: string
  weekday: number
  period_code: string // 'S1'..'S5' | 'C1'..'C5'
  session: SchoolSessionType // 'morning' | 'afternoon'
  cell_type: SchoolCellType // 'class' | 'duty' | 'other'
  class_name: string
  subject: string
  room: string
  note?: string
  confidence?: number
  // Legacy optional fields
  period?: string
  start_time?: string
  end_time?: string
}

export interface ParsedSchoolTimetableResult {
  teacher_name: string
  week_start: string // Monday YYYY-MM-DD
  declared_period_count: number
  cells: ParsedSchoolScheduleItem[]
}

// Computed types for Calendar & Fees
export interface CalendarSession {
  id: string
  type: 'school' | 'duty' | 'tutoring_fixed' | 'tutoring_extra' | 'tutoring_moved_away' | 'cancelled'
  date: string
  start_time: string
  end_time: string
  period_code?: string // e.g. 'S1', 'S1-S2', 'C2', 'SB1', 'CB1'
  session_group?: TimeOfDayGroup // 'morning' | 'afternoon' | 'evening'
  spans_to_group?: TimeOfDayGroup | null // e.g. 'evening' if 16:30-18:30
  cell_type?: SchoolCellType
  is_break?: boolean
  class_id?: string
  class_name: string
  subject?: string
  room?: string
  location?: string
  color?: string
  rule_id?: string
  exception_id?: string
  school_item_ids?: string[]
  is_cancelled?: boolean
  is_moved?: boolean
  moved_to_date?: string
  moved_to_start?: string
  moved_from_date?: string
  needs_makeup?: boolean
  makeup_for?: string
  reason?: string
  note?: string
  student_count?: number
  guest_count?: number
  has_conflict?: boolean
  conflict_details?: string[]
}

export interface ConflictCheckResult {
  hasConflict: boolean
  severity: 'error' | 'warning' | null
  message: string | null
  conflicts: string[]
}

export interface StudentClassFeeBreakdown {
  class_id: string
  class_name: string
  class_color?: string
  kind: 'primary' | 'extra' | 'guest'
  present_count: number
  trial_count: number
  absent_count: number
  excused_count: number
  guest_count: number
  unmarked_count: number
  price_per_session: number
  due_amount: number
  from_date?: string
  to_date?: string | null
}

export interface FeeRow {
  student: Student
  class_id?: string
  class_name?: string
  class_color?: string
  present_count: number
  absent_count: number
  excused_count: number
  trial_count?: number
  guest_count?: number
  unmarked_count?: number
  status_note?: string | null
  class_breakdowns?: StudentClassFeeBreakdown[]
  price_per_session: number
  total: number
  paid_amount: number
  remaining_amount: number
  cumulative_balance: number
  status: MonthFeeStatus
  is_locked?: boolean
  paid: boolean
  paid_at: string | null
}
