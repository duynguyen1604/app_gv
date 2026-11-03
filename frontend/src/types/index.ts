// Supabase types - matches our database schema
export type StudentStatus = 'active' | 'trial' | 'left'
export type AttendanceStatus = 'present' | 'absent' | 'excused'
export type SessionAction = 'moved' | 'cancelled'
export type NotifyContent = 'school' | 'tutoring' | 'both'
export type PaymentType = 'per_session' | 'package'

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
  status: StudentStatus
  note: string | null
  created_at: string
  payment_type?: PaymentType
  package_total_sessions?: number
  package_used_sessions?: number
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

export interface SchoolSchedule {
  id: string
  weekday: number
  period: string
  start_time: string
  end_time: string
  class_name: string
  subject: string
  room: string
  valid_from: string
  valid_to: string | null
  user_id: string
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

export interface Payment {
  id: string
  student_id: string
  month: string // YYYY-MM
  paid: boolean
  paid_at: string | null
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
  period: string
  start_time: string
  end_time: string
  class_name: string
  subject: string
  room: string
  confidence?: number
}

// Computed types for Calendar & Fees
export interface CalendarSession {
  id: string
  type: 'school' | 'tutoring_fixed' | 'tutoring_extra' | 'tutoring_moved_away' | 'cancelled'
  date: string
  start_time: string
  end_time: string
  class_id?: string
  class_name: string
  subject?: string
  room?: string
  location?: string
  color?: string
  rule_id?: string
  exception_id?: string
  is_cancelled?: boolean
  is_moved?: boolean
  moved_to_date?: string
  moved_to_start?: string
  needs_makeup?: boolean
  makeup_for?: string
  reason?: string
}

export interface ConflictCheckResult {
  hasConflict: boolean
  severity: 'error' | 'warning' | null
  message: string | null
  conflicts: string[]
}

export interface FeeRow {
  student: Student
  present_count: number
  absent_count: number
  excused_count: number
  price_per_session: number
  total: number
  paid: boolean
  paid_at: string | null
}
