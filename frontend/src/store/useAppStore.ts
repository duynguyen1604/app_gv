import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Class,
  Student,
  StudentStatus,
  StudentEnrollment,
  StudentStatusHistory,
  SessionGuest,
  ScheduleRule,
  SessionException,
  ExtraSession,
  Attendance,
  Payment,
  PaymentTransaction,
  MonthLock,
  ChangeLog,
  CalendarEventMap,
  CalendarSyncLog,
  SessionNote,
  SchoolSchedule,
  SchoolPeriod,
  SchoolCellType,
  SchoolWeekConfig,
  Holiday,
  Settings,
  NotificationLog,
  CalendarLayerVisibility,
  CalendarViewMode,
  PaymentMethod,
} from '../types'
import { generateId } from '../lib/utils'
import {
  DATA_SEED_VERSION,
  INITIAL_CLASSES,
  INITIAL_STUDENTS,
  INITIAL_STUDENT_ENROLLMENTS,
  INITIAL_STUDENT_STATUS_HISTORY,
  INITIAL_SCHEDULE_RULES,
  INITIAL_SCHOOL_SCHEDULE,
  INITIAL_SCHOOL_PERIODS,
  INITIAL_HOLIDAYS,
  isDefaultSeededTeacherId,
} from './initialData'
import {
  addDaysToDateStr,
  DEFAULT_SCHOOL_PERIODS,
  ensureDataBackupBeforeMigration,
  getMondayOfDateStr,
  migrateLegacySchoolSchedule,
  resolveSchoolScheduleTime,
} from '../lib/schoolPeriods'
import {
  buildClassMonthLockSnapshot,
  getStudentCurrentStatus,
  migrateLegacyPaymentsToTransactions,
} from '../lib/debtEngine'

interface AppState {
  // Theme
  darkMode: boolean
  toggleDarkMode: () => void

  // Auth
  userId: string
  setUserId: (id: string) => void

  // UI state (persisted preferences)
  calendarViewMode: CalendarViewMode | null
  setCalendarViewMode: (mode: CalendarViewMode) => void
  calendarLayers: CalendarLayerVisibility
  toggleCalendarLayer: (key: keyof CalendarLayerVisibility) => void
  globalSearchQuery: string
  setGlobalSearchQuery: (q: string) => void

  // Classes
  classes: Class[]
  addClass: (data: Omit<Class, 'id' | 'created_at' | 'user_id'>) => Class
  updateClass: (id: string, data: Partial<Class>) => void
  deleteClass: (id: string) => void

  // Students
  students: Student[]
  addStudent: (data: Omit<Student, 'id' | 'created_at'>) => Student
  addStudentsBulk: (
    class_id: string,
    names: string[],
    options?: { start_date?: string; status?: StudentStatus }
  ) => Student[]
  updateStudent: (id: string, data: Partial<Student>) => void
  deleteStudent: (id: string) => void
  getStudentsByClass: (class_id: string) => Student[]

  // Group A, D, E: Student Enrollments, Status History & Session Guests
  studentEnrollments: StudentEnrollment[]
  studentStatusHistory: StudentStatusHistory[]
  sessionGuests: SessionGuest[]

  changeStudentStatus: (params: {
    studentId: string
    enrollmentId?: string | null
    newStatus: StudentStatus
    effectiveFrom: string
    trialPrice?: number | null
    note?: string | null
  }) => StudentStatusHistory

  transferStudentClass: (params: {
    studentId: string
    toClassId: string
    transferDate: string
    customPrice: number | null
    statusInNewClass: StudentStatus
    note?: string | null
  }) => StudentEnrollment

  addLongTermExtraEnrollment: (params: {
    studentId: string
    classId: string
    scheduleRuleIds: string[] | null
    priceOverride: number | null
    fromDate: string
    toDate: string | null
    initialStatus?: StudentStatus
    note?: string | null
  }) => StudentEnrollment

  updateStudentEnrollment: (id: string, data: Partial<StudentEnrollment>) => void
  endStudentEnrollment: (id: string, toDate: string) => void
  deleteStudentEnrollment: (id: string) => void

  addSessionGuest: (
    data: Omit<SessionGuest, 'id' | 'created_at' | 'user_id'>
  ) => SessionGuest
  updateSessionGuest: (id: string, data: Partial<SessionGuest>) => void
  deleteSessionGuest: (id: string) => void

  // Schedule Rules
  scheduleRules: ScheduleRule[]
  addScheduleRule: (data: Omit<ScheduleRule, 'id' | 'user_id'>) => ScheduleRule
  updateScheduleRule: (id: string, data: Partial<ScheduleRule>) => void
  deleteScheduleRule: (id: string) => void

  // Session Exceptions
  sessionExceptions: SessionException[]
  addSessionException: (data: Omit<SessionException, 'id' | 'user_id'>) => SessionException
  updateSessionException: (id: string, data: Partial<SessionException>) => void
  deleteSessionException: (id: string) => void
  dismissMakeupException: (id: string) => void
  clearAllMakeupExceptions: () => void
  cleanupExpiredMakeupExceptions: (currentMonthStr?: string) => number

  // Extra Sessions
  extraSessions: ExtraSession[]
  addExtraSession: (data: Omit<ExtraSession, 'id' | 'user_id'>) => ExtraSession
  updateExtraSession: (id: string, data: Partial<ExtraSession>) => void
  deleteExtraSession: (id: string) => void

  // School Periods (S1-S5, C1-C5)
  schoolPeriods: SchoolPeriod[]
  setSchoolPeriods: (periods: Omit<SchoolPeriod, 'id' | 'user_id'>[]) => void
  updateSchoolPeriod: (id: string, data: Partial<SchoolPeriod>) => void
  addSchoolPeriod: (data: Omit<SchoolPeriod, 'id' | 'user_id'>) => SchoolPeriod
  deleteSchoolPeriod: (id: string) => void

  // School Schedule & Per-Week Config (Group B)
  schoolSchedule: SchoolSchedule[]
  schoolWeekConfigs: Record<string, SchoolWeekConfig>
  setSchoolWeekConfig: (weekStart: string, config: Partial<SchoolWeekConfig>) => void
  addSchoolScheduleItem: (data: Omit<SchoolSchedule, 'id' | 'user_id'>) => SchoolSchedule
  setSchoolSchedule: (
    items: Partial<SchoolSchedule>[],
    validFrom: string,
    validTo: string | null
  ) => void
  setSchoolScheduleForWeek: (
    weekStart: string,
    items: Partial<SchoolSchedule>[],
    weekConfig?: Partial<SchoolWeekConfig>
  ) => void
  copySchoolScheduleToWeeks: (params: {
    sourceWeekStart: string
    targetWeekStarts: string[]
    mode: 'overwrite' | 'skip'
  }) => { copiedWeeks: string[]; skippedWeeks: string[] }
  clearSchoolScheduleForWeek: (weekStart: string) => void
  updateSchoolScheduleItem: (id: string, data: Partial<SchoolSchedule>) => void
  deleteSchoolScheduleItem: (id: string) => void
  upsertSchoolCell: (cell: {
    week_start?: string
    weekday: number
    period_code: string
    cell_type: SchoolCellType | 'empty'
    class_name?: string
    subject?: string
    room?: string
    note?: string
    valid_from?: string
    valid_to?: string | null
  }) => void

  // Holidays
  holidays: Holiday[]
  addHoliday: (data: Omit<Holiday, 'id' | 'user_id'>) => Holiday
  deleteHoliday: (id: string) => void

  // Session Notes
  sessionNotes: SessionNote[]
  setSessionNote: (class_id: string, date: string, start_time: string, content: string) => void
  getSessionNote: (class_id: string, date: string, start_time: string) => string

  // Attendance
  attendance: Attendance[]
  setAttendance: (
    class_id: string,
    date: string,
    start_time: string,
    student_id: string,
    status: 'present' | 'absent' | 'excused'
  ) => void
  removeAttendance: (class_id: string, date: string, start_time: string, student_id: string) => void
  getAttendance: (class_id: string, date: string, start_time: string) => Attendance[]
  getStudentAttendance: (student_id: string, class_id: string, month: string) => Attendance[]

  // Legacy Payments (kept for backward compatibility migration)
  payments: Payment[]

  // Section 2.9: Payment Transactions (Replaces hardcoded paid checkbox)
  paymentTransactions: PaymentTransaction[]
  addPaymentTransaction: (data: {
    student_id: string
    amount: number
    paid_at: string
    method: PaymentMethod
    note?: string | null
    group_id?: string | null
  }) => PaymentTransaction
  addBulkPaymentTransactions: (
    items: {
      student_id: string
      amount: number
      paid_at: string
      method: PaymentMethod
      note?: string | null
    }[]
  ) => PaymentTransaction[]
  updatePaymentTransaction: (
    id: string,
    data: Partial<Pick<PaymentTransaction, 'amount' | 'paid_at' | 'method' | 'note'>>
  ) => void
  deletePaymentTransaction: (id: string) => void

  // Section 2.9: Month Locks ("Chốt tháng")
  monthLocks: MonthLock[]
  lockMonth: (class_id: string, month: string) => MonthLock
  unlockMonth: (class_id: string, month: string) => void
  isMonthLocked: (class_id: string, month: string) => boolean

  // Section 2.9 & Section 3: Change Log
  changeLogs: ChangeLog[]

  // Section 2.10 & Section 3: Google Calendar Sync State
  calendarEventMap: CalendarEventMap[]
  calendarSyncLogs: CalendarSyncLog[]
  addCalendarSyncLog: (data: Omit<CalendarSyncLog, 'id' | 'user_id'>) => void

  // Settings
  settings: Settings
  updateSettings: (data: Partial<Settings>) => void

  // Notification Log
  notificationLogs: NotificationLog[]
  addNotificationLog: (data: Omit<NotificationLog, 'id' | 'user_id'>) => void
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'default',
  user_id: 'local',
  notify_enabled: false,
  notify_time: '06:00',
  notify_email: '',
  notify_content: 'both',
  weekly_summary: false,
  afternoon_start: '12:00',
  evening_start: '18:00',
  show_session_overlay: true,
  show_duty_in_email: true,
  show_duty_in_gcal: true,
  default_mobile_view: 'agenda',
  default_desktop_view: 'week',
  calendar_density: 'comfortable',
  day_start_hour: 6,
  day_end_hour: 22,
  collapse_empty_noon: false,
  morning_periods_count: 5,
  afternoon_periods_count: 3,
  // Group A4 & B1/B2 defaults
  default_trial_sessions: 2,
  duty_end_time: '16:30',
  morning_start_time: '07:00',
  afternoon_period_start_time: '14:00',
  period_duration_minutes: 45,
  short_break_minutes: 10,
  morning_long_break_minutes: 30,
  afternoon_long_break_minutes: 20,
  // Google Calendar One-Way Sync Defaults (Section 2.10)
  gcal_enabled: false,
  gcal_calendar_id: null,
  gcal_connected: false,
  gcal_account_email: null,
  gcal_token_expired: false,
  gcal_content: 'both',
  gcal_reminders: [30],
  gcal_school_reminders: [30],
  gcal_extra_reminders: [30],
  gcal_weeks_ahead: 8,
  gcal_travel_reminder: true,
}

const DEFAULT_LAYERS: CalendarLayerVisibility = {
  school: true,
  tutoring_fixed: true,
  tutoring_extra: true,
  duty: true,
  holiday: true,
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      darkMode: false,
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

      userId: 'local',
      setUserId: (id) => {
        const nextId = id || 'local'
        const prevId = get().userId
        if (prevId === nextId) return
        const isSeeded = isDefaultSeededTeacherId(nextId)
        set({
          userId: nextId,
          classes: isSeeded ? INITIAL_CLASSES : [],
          students: isSeeded ? INITIAL_STUDENTS : [],
          studentEnrollments: isSeeded ? INITIAL_STUDENT_ENROLLMENTS : [],
          studentStatusHistory: isSeeded ? INITIAL_STUDENT_STATUS_HISTORY : [],
          sessionGuests: [],
          scheduleRules: isSeeded ? INITIAL_SCHEDULE_RULES : [],
          sessionExceptions: [],
          extraSessions: [],
          schoolPeriods: INITIAL_SCHOOL_PERIODS,
          schoolSchedule: isSeeded ? INITIAL_SCHOOL_SCHEDULE : [],
          schoolWeekConfigs: {},
          holidays: INITIAL_HOLIDAYS,
          sessionNotes: [],
          attendance: [],
          payments: [],
          paymentTransactions: [],
          monthLocks: [],
          changeLogs: [],
          calendarEventMap: [],
          calendarSyncLogs: [],
          notificationLogs: [],
        })
      },

      calendarViewMode: null,
      setCalendarViewMode: (mode) => set({ calendarViewMode: mode }),

      calendarLayers: DEFAULT_LAYERS,
      toggleCalendarLayer: (key) =>
        set((s) => ({
          calendarLayers: { ...s.calendarLayers, [key]: !s.calendarLayers[key] },
        })),

      globalSearchQuery: '',
      setGlobalSearchQuery: (q) => set({ globalSearchQuery: q }),

      // Classes (Tài khoản mới khởi tạo trống hoàn toàn; chỉ tài khoản mặc định giaovien@lichday.vn mới nạp sẵn 14 lớp)
      classes: [],
      addClass: (data) => {
        const newClass: Class = {
          ...data,
          id: generateId(),
          created_at: new Date().toISOString(),
          user_id: get().userId,
        }
        set((s) => ({ classes: [...s.classes, newClass] }))
        return newClass
      },
      updateClass: (id, data) =>
        set((s) => ({
          classes: s.classes.map((c) => (c.id === id ? { ...c, ...data } : c)),
        })),
      deleteClass: (id) =>
        set((s) => ({
          classes: s.classes.filter((c) => c.id !== id),
          students: s.students.filter((st) => st.class_id !== id),
          studentEnrollments: s.studentEnrollments.filter((e) => e.class_id !== id),
          sessionGuests: s.sessionGuests.filter(
            (g) => g.host_class_id !== id && g.home_class_id !== id
          ),
          scheduleRules: s.scheduleRules.filter((r) => r.class_id !== id),
          extraSessions: s.extraSessions.filter((e) => e.class_id !== id),
          monthLocks: s.monthLocks.filter((l) => l.class_id !== id),
        })),

      // Students
      students: [],
      studentEnrollments: [],
      studentStatusHistory: [],
      sessionGuests: [],

      addStudent: (data) => {
        const now = new Date().toISOString()
        const todayStr = now.slice(0, 10)
        const startDate = data.start_date || todayStr
        const studentId = generateId()
        const enrollId = generateId()
        const uid = get().userId

        const student: Student = {
          ...data,
          id: studentId,
          start_date: startDate,
          created_at: now,
        }

        const primaryEnrollment: StudentEnrollment = {
          id: enrollId,
          student_id: studentId,
          class_id: student.class_id,
          kind: 'primary',
          schedule_rule_ids: null,
          price_override: student.custom_price,
          from_date: startDate,
          to_date: null,
          note: student.note,
          created_at: now,
          user_id: uid,
        }

        const statusRow: StudentStatusHistory = {
          id: generateId(),
          student_id: studentId,
          enrollment_id: enrollId,
          status: student.status || 'active',
          effective_from: startDate,
          note: 'Thêm học sinh mới',
          created_at: now,
          user_id: uid,
        }

        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'student_status',
          entity_id: statusRow.id,
          action: 'create',
          before: null,
          after: statusRow,
          created_at: now,
          user_id: uid,
        }

        set((s) => ({
          students: [...s.students, student],
          studentEnrollments: [...s.studentEnrollments, primaryEnrollment],
          studentStatusHistory: [...s.studentStatusHistory, statusRow],
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
        return student
      },

      addStudentsBulk: (class_id, names, options) => {
        const now = new Date().toISOString()
        const todayStr = now.slice(0, 10)
        const startDate = options?.start_date || todayStr
        const initStatus: StudentStatus = options?.status || 'active'
        const uid = get().userId

        const newStudents: Student[] = []
        const newEnrollments: StudentEnrollment[] = []
        const newHistories: StudentStatusHistory[] = []

        names
          .map((n) => n.trim())
          .filter((n) => n.length > 0)
          .forEach((name) => {
            const studentId = generateId()
            const enrollId = generateId()
            newStudents.push({
              id: studentId,
              class_id,
              name,
              parent_name: null,
              parent_phone: null,
              custom_price: null,
              status: initStatus,
              note: null,
              start_date: startDate,
              created_at: now,
            })
            newEnrollments.push({
              id: enrollId,
              student_id: studentId,
              class_id,
              kind: 'primary',
              schedule_rule_ids: null,
              price_override: null,
              from_date: startDate,
              to_date: null,
              note: null,
              created_at: now,
              user_id: uid,
            })
            newHistories.push({
              id: generateId(),
              student_id: studentId,
              enrollment_id: enrollId,
              status: initStatus,
              effective_from: startDate,
              note: 'Thêm hàng loạt',
              created_at: now,
              user_id: uid,
            })
          })

        set((s) => ({
          students: [...s.students, ...newStudents],
          studentEnrollments: [...s.studentEnrollments, ...newEnrollments],
          studentStatusHistory: [...s.studentStatusHistory, ...newHistories],
        }))
        return newStudents
      },

      updateStudent: (id, data) =>
        set((s) => {
          const existing = s.students.find((st) => st.id === id)
          if (!existing) return s

          const now = new Date().toISOString()
          const todayStr = now.slice(0, 10)
          const nextStudents = s.students.map((st) =>
            st.id === id ? { ...st, ...data } : st
          )

          // Sync primary enrollment if start_date or custom_price changed
          let nextEnrollments = s.studentEnrollments
          if (data.start_date !== undefined || data.custom_price !== undefined) {
            const primaryEnrolls = s.studentEnrollments
              .filter((e) => e.student_id === id && e.kind === 'primary')
              .sort((a, b) => a.from_date.localeCompare(b.from_date))
            const latestPrimary = primaryEnrolls[primaryEnrolls.length - 1]
            if (latestPrimary) {
              nextEnrollments = s.studentEnrollments.map((e) =>
                e.id === latestPrimary.id
                  ? {
                      ...e,
                      from_date:
                        data.start_date !== undefined && primaryEnrolls.length === 1
                          ? data.start_date
                          : e.from_date,
                      price_override:
                        data.custom_price !== undefined ? data.custom_price : e.price_override,
                    }
                  : e
              )
            }
          }

          // Also sync studentStatusHistory if status changed in StudentForm
          let nextStatusHistory = s.studentStatusHistory
          if (data.status !== undefined) {
            const curStatus = getStudentCurrentStatus(existing, s.studentStatusHistory, todayStr)
            if (data.status !== curStatus) {
              const effFrom = data.start_date || existing.start_date || todayStr
              const newRow: StudentStatusHistory = {
                id: generateId(),
                student_id: id,
                enrollment_id: null,
                status: data.status,
                effective_from: effFrom,
                note: 'Cập nhật trạng thái từ hồ sơ học sinh',
                created_at: now,
                user_id: s.userId,
              }
              nextStatusHistory = [
                ...s.studentStatusHistory.filter(
                  (h) => !(h.student_id === id && h.effective_from >= effFrom)
                ),
                newRow,
              ]
            }
          }

          return {
            students: nextStudents,
            studentEnrollments: nextEnrollments,
            studentStatusHistory: nextStatusHistory,
          }
        }),

      deleteStudent: (id) =>
        set((s) => ({
          students: s.students.filter((st) => st.id !== id),
          studentEnrollments: s.studentEnrollments.filter((e) => e.student_id !== id),
          studentStatusHistory: s.studentStatusHistory.filter((h) => h.student_id !== id),
          sessionGuests: s.sessionGuests.filter((g) => g.student_id !== id),
          attendance: s.attendance.filter((a) => a.student_id !== id),
          paymentTransactions: s.paymentTransactions.filter((t) => t.student_id !== id),
        })),

      getStudentsByClass: (class_id) => {
        const state = get()
        return state.students.filter(
          (s) =>
            s.class_id === class_id ||
            state.studentEnrollments.some(
              (e) =>
                e.student_id === s.id &&
                e.class_id === class_id &&
                (!e.to_date || e.to_date >= new Date().toISOString().slice(0, 10))
            )
        )
      },

      // Group A1 & A3: Change Student Status with effective_from history
      changeStudentStatus: ({
        studentId,
        enrollmentId = null,
        newStatus,
        effectiveFrom,
        trialPrice,
        note = null,
      }) => {
        const state = get()
        const now = new Date().toISOString()
        const todayStr = now.slice(0, 10)
        const student = state.students.find((s) => s.id === studentId)

        const newRow: StudentStatusHistory = {
          id: generateId(),
          student_id: studentId,
          enrollment_id: enrollmentId,
          status: newStatus,
          effective_from: effectiveFrom,
          note,
          created_at: now,
          user_id: state.userId,
        }

        // Remove any duplicate entry on the exact same effective_from for this student/enrollment
        const nextHistory = [
          ...state.studentStatusHistory.filter(
            (h) =>
              !(
                h.student_id === studentId &&
                (h.enrollment_id || null) === (enrollmentId || null) &&
                h.effective_from === effectiveFrom
              )
          ),
          newRow,
        ]

        // Recompute current mirror status as of today
        const currentMirror = student
          ? getStudentCurrentStatus(student, nextHistory, todayStr)
          : newStatus

        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'student_status',
          entity_id: newRow.id,
          action: 'create',
          before: student ? { status: student.status, trial_price: student.trial_price } : null,
          after: { ...newRow, trial_price: trialPrice },
          created_at: now,
          user_id: state.userId,
        }

        set((s) => ({
          studentStatusHistory: nextHistory,
          students: s.students.map((st) =>
            st.id === studentId
              ? {
                  ...st,
                  status: effectiveFrom <= todayStr ? newStatus : currentMirror,
                  left_date: newStatus === 'left' ? effectiveFrom : null,
                  ...(trialPrice !== undefined ? { trial_price: trialPrice } : {}),
                }
              : st
          ),
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))

        return newRow
      },

      // Group E3: Mid-month Class Transfer ("Chuyển lớp")
      transferStudentClass: ({
        studentId,
        toClassId,
        transferDate,
        customPrice,
        statusInNewClass,
        note = null,
      }) => {
        const state = get()
        const now = new Date().toISOString()
        const uid = state.userId
        const student = state.students.find((s) => s.id === studentId)
        const dayBeforeTransfer = addDaysToDateStr(transferDate, -1)

        // Close active primary enrollment(s) for this student
        const updatedEnrollments = state.studentEnrollments.map((e) => {
          if (
            e.student_id === studentId &&
            e.kind === 'primary' &&
            (!e.to_date || e.to_date >= transferDate)
          ) {
            return {
              ...e,
              to_date: dayBeforeTransfer >= e.from_date ? dayBeforeTransfer : e.from_date,
            }
          }
          return e
        })

        const newEnroll: StudentEnrollment = {
          id: generateId(),
          student_id: studentId,
          class_id: toClassId,
          kind: 'primary',
          schedule_rule_ids: null,
          price_override: customPrice,
          from_date: transferDate,
          to_date: null,
          note: note || `Chuyển lớp từ ngày ${transferDate.split('-').reverse().join('/')}`,
          created_at: now,
          user_id: uid,
        }

        const newStatusRow: StudentStatusHistory = {
          id: generateId(),
          student_id: studentId,
          enrollment_id: newEnroll.id,
          status: statusInNewClass,
          effective_from: transferDate,
          note: `Chuyển sang lớp mới (${note || ''})`.trim(),
          created_at: now,
          user_id: uid,
        }

        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'student_enrollment',
          entity_id: newEnroll.id,
          action: 'create',
          before: student ? { class_id: student.class_id, custom_price: student.custom_price } : null,
          after: newEnroll,
          created_at: now,
          user_id: uid,
        }

        set((s) => ({
          students: s.students.map((st) =>
            st.id === studentId
              ? {
                  ...st,
                  class_id: toClassId,
                  custom_price: customPrice,
                  status: statusInNewClass,
                }
              : st
          ),
          studentEnrollments: [...updatedEnrollments, newEnroll],
          studentStatusHistory: [...s.studentStatusHistory, newStatusRow],
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))

        return newEnroll
      },

      // Group D4: Long-term Extra Enrollment ("Đăng ký học thêm dài hạn ở lớp khác")
      addLongTermExtraEnrollment: ({
        studentId,
        classId,
        scheduleRuleIds,
        priceOverride,
        fromDate,
        toDate,
        initialStatus = 'active',
        note = null,
      }) => {
        const now = new Date().toISOString()
        const uid = get().userId
        const enroll: StudentEnrollment = {
          id: generateId(),
          student_id: studentId,
          class_id: classId,
          kind: 'extra',
          schedule_rule_ids: scheduleRuleIds,
          price_override: priceOverride,
          from_date: fromDate,
          to_date: toDate,
          note,
          created_at: now,
          user_id: uid,
        }

        const statusRow: StudentStatusHistory = {
          id: generateId(),
          student_id: studentId,
          enrollment_id: enroll.id,
          status: initialStatus,
          effective_from: fromDate,
          note: 'Đăng ký học thêm dài hạn',
          created_at: now,
          user_id: uid,
        }

        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'student_enrollment',
          entity_id: enroll.id,
          action: 'create',
          before: null,
          after: enroll,
          created_at: now,
          user_id: uid,
        }

        set((s) => ({
          studentEnrollments: [...s.studentEnrollments, enroll],
          studentStatusHistory: [...s.studentStatusHistory, statusRow],
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))

        return enroll
      },

      updateStudentEnrollment: (id, data) =>
        set((s) => ({
          studentEnrollments: s.studentEnrollments.map((e) =>
            e.id === id ? { ...e, ...data } : e
          ),
        })),

      endStudentEnrollment: (id, toDate) => {
        const existing = get().studentEnrollments.find((e) => e.id === id)
        if (!existing) return
        const now = new Date().toISOString()
        const updated = { ...existing, to_date: toDate }
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'student_enrollment',
          entity_id: id,
          action: 'update',
          before: existing,
          after: updated,
          created_at: now,
          user_id: get().userId,
        }
        set((s) => ({
          studentEnrollments: s.studentEnrollments.map((e) =>
            e.id === id ? updated : e
          ),
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
      },

      deleteStudentEnrollment: (id) =>
        set((s) => ({
          studentEnrollments: s.studentEnrollments.filter((e) => e.id !== id),
          studentStatusHistory: s.studentStatusHistory.filter((h) => h.enrollment_id !== id),
        })),

      // Group D2 & D4: Short-term Guest / Swap Sessions
      addSessionGuest: (data) => {
        const now = new Date().toISOString()
        const uid = get().userId
        const guest: SessionGuest = {
          ...data,
          id: generateId(),
          created_at: now,
          user_id: uid,
        }
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'session_guest',
          entity_id: guest.id,
          action: 'create',
          before: null,
          after: guest,
          created_at: now,
          user_id: uid,
        }
        set((s) => ({
          sessionGuests: [...s.sessionGuests, guest],
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
        return guest
      },

      updateSessionGuest: (id, data) =>
        set((s) => ({
          sessionGuests: s.sessionGuests.map((g) => (g.id === id ? { ...g, ...data } : g)),
        })),

      deleteSessionGuest: (id) => {
        const existing = get().sessionGuests.find((g) => g.id === id)
        if (!existing) return
        const now = new Date().toISOString()
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'session_guest',
          entity_id: id,
          action: 'delete',
          before: existing,
          after: null,
          created_at: now,
          user_id: get().userId,
        }
        set((s) => ({
          sessionGuests: s.sessionGuests.filter((g) => g.id !== id),
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
      },

      // Schedule Rules
      scheduleRules: [],
      addScheduleRule: (data) => {
        const rule: ScheduleRule = { ...data, id: generateId(), user_id: get().userId }
        set((s) => ({ scheduleRules: [...s.scheduleRules, rule] }))
        return rule
      },
      updateScheduleRule: (id, data) =>
        set((s) => ({
          scheduleRules: s.scheduleRules.map((r) => (r.id === id ? { ...r, ...data } : r)),
        })),
      deleteScheduleRule: (id) =>
        set((s) => ({
          scheduleRules: s.scheduleRules.filter((r) => r.id !== id),
          sessionExceptions: s.sessionExceptions.filter((e) => e.rule_id !== id),
        })),

      // Session Exceptions
      sessionExceptions: [],
      addSessionException: (data) => {
        const existing = get().sessionExceptions.find(
          (e) => e.rule_id === data.rule_id && e.original_date === data.original_date
        )
        if (existing) {
          const updated: SessionException = { ...existing, ...data }
          set((s) => ({
            sessionExceptions: s.sessionExceptions.map((e) =>
              e.id === existing.id ? updated : e
            ),
          }))
          return updated
        }
        const ex: SessionException = { ...data, id: generateId(), user_id: get().userId }
        set((s) => ({ sessionExceptions: [...s.sessionExceptions, ex] }))
        return ex
      },
      updateSessionException: (id, data) =>
        set((s) => ({
          sessionExceptions: s.sessionExceptions.map((e) =>
            e.id === id ? { ...e, ...data } : e
          ),
        })),
      deleteSessionException: (id) =>
        set((s) => ({
          sessionExceptions: s.sessionExceptions.filter((e) => e.id !== id),
        })),
      dismissMakeupException: (id) =>
        set((s) => ({
          sessionExceptions: s.sessionExceptions.map((e) =>
            e.id === id ? { ...e, needs_makeup: false } : e
          ),
        })),
      clearAllMakeupExceptions: () =>
        set((s) => ({
          sessionExceptions: s.sessionExceptions.map((e) =>
            e.action === 'cancelled' && e.needs_makeup && !s.extraSessions.some((ex) => ex.makeup_for === e.id)
              ? { ...e, needs_makeup: false }
              : e
          ),
        })),
      cleanupExpiredMakeupExceptions: (currentMonthStr) => {
        const curMonth = currentMonthStr || new Date().toISOString().slice(0, 7)
        const state = get()
        let cleaned = 0
        const nextExceptions = state.sessionExceptions.map((e) => {
          if (
            e.action === 'cancelled' &&
            e.needs_makeup &&
            e.original_date.slice(0, 7) < curMonth &&
            !state.extraSessions.some((ex) => ex.makeup_for === e.id)
          ) {
            cleaned++
            return { ...e, needs_makeup: false }
          }
          return e
        })
        if (cleaned > 0) {
          set({ sessionExceptions: nextExceptions })
        }
        return cleaned
      },

      // Extra Sessions
      extraSessions: [],
      addExtraSession: (data) => {
        const ex: ExtraSession = { ...data, id: generateId(), user_id: get().userId }
        set((s) => ({ extraSessions: [...s.extraSessions, ex] }))
        return ex
      },
      updateExtraSession: (id, data) =>
        set((s) => ({
          extraSessions: s.extraSessions.map((e) => (e.id === id ? { ...e, ...data } : e)),
        })),
      deleteExtraSession: (id) =>
        set((s) => ({
          extraSessions: s.extraSessions.filter((e) => e.id !== id),
        })),

      // School Periods
      schoolPeriods: INITIAL_SCHOOL_PERIODS,
      setSchoolPeriods: (periods) => {
        const uid = get().userId
        const nextPeriods: SchoolPeriod[] = periods.map((p) => ({
          ...p,
          id: generateId(),
          user_id: uid,
        }))
        const updatedSchedule = get().schoolSchedule.map((item) => {
          const wCfg = get().schoolWeekConfigs[item.week_start]
          const resolved = resolveSchoolScheduleTime(
            item,
            nextPeriods,
            item.week_start || item.valid_from,
            wCfg,
            undefined,
            get().settings
          )
          return {
            ...item,
            start_time: resolved.start_time,
            end_time: resolved.end_time,
            session: resolved.session,
          }
        })
        set({ schoolPeriods: nextPeriods, schoolSchedule: updatedSchedule })
      },
      updateSchoolPeriod: (id, data) =>
        set((s) => {
          const nextPeriods = s.schoolPeriods.map((p) => (p.id === id ? { ...p, ...data } : p))
          const updatedSchedule = s.schoolSchedule.map((item) => {
            const wCfg = s.schoolWeekConfigs[item.week_start]
            const resolved = resolveSchoolScheduleTime(
              item,
              nextPeriods,
              item.week_start || item.valid_from,
              wCfg,
              undefined,
              s.settings
            )
            return {
              ...item,
              start_time: resolved.start_time,
              end_time: resolved.end_time,
              session: resolved.session,
            }
          })
          return { schoolPeriods: nextPeriods, schoolSchedule: updatedSchedule }
        }),
      addSchoolPeriod: (data) => {
        const period: SchoolPeriod = { ...data, id: generateId(), user_id: get().userId }
        set((s) => ({ schoolPeriods: [...s.schoolPeriods, period] }))
        return period
      },
      deleteSchoolPeriod: (id) =>
        set((s) => ({
          schoolPeriods: s.schoolPeriods.filter((p) => p.id !== id),
        })),

      // School Schedule & Per-Week Config (Group B1, B2, B3)
      schoolSchedule: [],
      schoolWeekConfigs: {},

      setSchoolWeekConfig: (weekStart, config) => {
        const monday = getMondayOfDateStr(weekStart)
        set((s) => {
          const current = s.schoolWeekConfigs[monday] || {
            week_start: monday,
            afternoon_long_break: false,
            afternoon_break_minutes: s.settings.afternoon_long_break_minutes || 20,
          }
          const updatedCfg: SchoolWeekConfig = {
            ...current,
            ...config,
            week_start: monday,
          }
          return {
            schoolWeekConfigs: {
              ...s.schoolWeekConfigs,
              [monday]: updatedCfg,
            },
          }
        })
      },

      addSchoolScheduleItem: (data) => {
        const weekStart = getMondayOfDateStr(data.week_start || data.valid_from)
        const wCfg = get().schoolWeekConfigs[weekStart]
        const resolved = resolveSchoolScheduleTime(
          data,
          get().schoolPeriods,
          weekStart,
          wCfg,
          undefined,
          get().settings
        )
        const item: SchoolSchedule = {
          ...data,
          id: generateId(),
          week_start: weekStart,
          valid_from: weekStart,
          valid_to: null,
          user_id: get().userId,
          period_code: data.period_code || resolved.period_code,
          session: data.session || resolved.session,
          cell_type: data.cell_type || 'class',
          note: data.note || '',
          period: data.period || data.period_code || resolved.period_code,
          start_time: resolved.start_time,
          end_time: resolved.end_time,
        }
        set((s) => ({ schoolSchedule: [...s.schoolSchedule, item] }))
        return item
      },

      setSchoolSchedule: (items, validFrom, _validTo) => {
        const weekStart = getMondayOfDateStr(validFrom)
        get().setSchoolScheduleForWeek(weekStart, items)
      },

      setSchoolScheduleForWeek: (weekStart, items, weekConfig) => {
        const monday = getMondayOfDateStr(weekStart)
        const state = get()
        const uid = state.userId
        const currentCfg = state.schoolWeekConfigs[monday] || {
          week_start: monday,
          afternoon_long_break: false,
          afternoon_break_minutes: state.settings.afternoon_long_break_minutes || 20,
        }
        const mergedCfg: SchoolWeekConfig = {
          ...currentCfg,
          ...(weekConfig || {}),
          week_start: monday,
        }

        const normalizedForWeek = migrateLegacySchoolSchedule(
          items.map((it) => ({
            ...it,
            week_start: monday,
            valid_from: monday,
            valid_to: null,
            afternoon_long_break: mergedCfg.afternoon_long_break,
            afternoon_break_minutes: mergedCfg.afternoon_break_minutes,
            user_id: uid,
          })),
          state.schoolPeriods,
          uid,
          monday
        ).map((it) => ({
          ...it,
          id: generateId(),
          week_start: monday,
          valid_from: monday,
        }))

        set((s) => ({
          schoolSchedule: [
            ...s.schoolSchedule.filter((i) => i.week_start !== monday),
            ...normalizedForWeek,
          ],
          schoolWeekConfigs: {
            ...s.schoolWeekConfigs,
            [monday]: mergedCfg,
          },
        }))
      },

      copySchoolScheduleToWeeks: ({ sourceWeekStart, targetWeekStarts, mode }) => {
        const state = get()
        const srcMonday = getMondayOfDateStr(sourceWeekStart)
        const srcItems = state.schoolSchedule.filter((i) => i.week_start === srcMonday)
        const srcCfg = state.schoolWeekConfigs[srcMonday]

        const copiedWeeks: string[] = []
        const skippedWeeks: string[] = []
        let nextSchedule = [...state.schoolSchedule]
        const nextConfigs = { ...state.schoolWeekConfigs }

        for (const rawTarget of targetWeekStarts) {
          const targetMonday = getMondayOfDateStr(rawTarget)
          if (targetMonday === srcMonday) continue

          const existingTargetItems = nextSchedule.filter((i) => i.week_start === targetMonday)
          if (existingTargetItems.length > 0 && mode === 'skip') {
            skippedWeeks.push(targetMonday)
            continue
          }

          if (existingTargetItems.length > 0 && mode === 'overwrite') {
            nextSchedule = nextSchedule.filter((i) => i.week_start !== targetMonday)
          }

          const cloned = srcItems.map((it) => ({
            ...it,
            id: generateId(),
            week_start: targetMonday,
            valid_from: targetMonday,
            valid_to: null,
          }))
          nextSchedule.push(...cloned)

          if (srcCfg) {
            nextConfigs[targetMonday] = {
              ...srcCfg,
              week_start: targetMonday,
            }
          }
          copiedWeeks.push(targetMonday)
        }

        set({
          schoolSchedule: nextSchedule,
          schoolWeekConfigs: nextConfigs,
        })

        return { copiedWeeks, skippedWeeks }
      },

      clearSchoolScheduleForWeek: (weekStart) => {
        const monday = getMondayOfDateStr(weekStart)
        set((s) => ({
          schoolSchedule: s.schoolSchedule.filter((i) => i.week_start !== monday),
        }))
      },

      updateSchoolScheduleItem: (id, data) =>
        set((s) => ({
          schoolSchedule: s.schoolSchedule.map((i) => {
            if (i.id !== id) return i
            const merged = { ...i, ...data }
            const wCfg = s.schoolWeekConfigs[merged.week_start]
            const resolved = resolveSchoolScheduleTime(
              merged,
              s.schoolPeriods,
              merged.week_start || merged.valid_from,
              wCfg,
              undefined,
              s.settings
            )
            return {
              ...merged,
              period_code: merged.period_code || resolved.period_code,
              session: merged.session || resolved.session,
              period: merged.period_code || resolved.period_code,
              start_time: resolved.start_time,
              end_time: resolved.end_time,
            }
          }),
        })),

      deleteSchoolScheduleItem: (id) =>
        set((s) => ({
          schoolSchedule: s.schoolSchedule.filter((i) => i.id !== id),
        })),

      upsertSchoolCell: (cell) => {
        const state = get()
        const code = cell.period_code.toUpperCase()
        const weekMonday = getMondayOfDateStr(
          cell.week_start || cell.valid_from || new Date().toISOString().slice(0, 10)
        )
        const existing = state.schoolSchedule.find(
          (s) =>
            s.week_start === weekMonday &&
            s.weekday === cell.weekday &&
            s.period_code.toUpperCase() === code
        )

        if (cell.cell_type === 'empty') {
          if (existing) {
            set((s) => ({
              schoolSchedule: s.schoolSchedule.filter((i) => i.id !== existing.id),
            }))
          }
          return
        }

        const wCfg = state.schoolWeekConfigs[weekMonday]
        const resolved = resolveSchoolScheduleTime(
          { period_code: code, cell_type: cell.cell_type },
          state.schoolPeriods,
          weekMonday,
          wCfg,
          undefined,
          state.settings
        )
        const nextItem: SchoolSchedule = {
          id: existing?.id || generateId(),
          week_start: weekMonday,
          weekday: cell.weekday,
          period_code: code,
          session: resolved.session,
          cell_type: cell.cell_type,
          class_name:
            cell.class_name?.trim() ||
            (cell.cell_type === 'duty'
              ? 'Trực'
              : cell.cell_type === 'other'
              ? 'Sinh hoạt / Họp'
              : ''),
          subject: cell.subject?.trim() || (cell.cell_type === 'duty' ? 'Trực chiều' : ''),
          room: cell.room?.trim() || '',
          note: cell.note?.trim() || '',
          valid_from: weekMonday,
          valid_to: null,
          user_id: state.userId,
          period: code,
          start_time: resolved.start_time,
          end_time: resolved.end_time,
        }

        // Group B2: If user sets "Trực" in any afternoon cell of this weekday, remove other afternoon cells on that weekday in this week
        let baseList = state.schoolSchedule
        if (cell.cell_type === 'duty' && resolved.session === 'afternoon') {
          baseList = baseList.filter(
            (i) =>
              !(
                i.week_start === weekMonday &&
                i.weekday === cell.weekday &&
                i.session === 'afternoon' &&
                i.id !== existing?.id
              )
          )
        }

        if (existing) {
          set({
            schoolSchedule: baseList.map((i) => (i.id === existing.id ? nextItem : i)),
          })
        } else {
          set({
            schoolSchedule: [...baseList, nextItem],
          })
        }
      },

      // Holidays
      holidays: INITIAL_HOLIDAYS,
      addHoliday: (data) => {
        const h: Holiday = { ...data, id: generateId(), user_id: get().userId }
        set((s) => ({ holidays: [...s.holidays, h] }))
        return h
      },
      deleteHoliday: (id) =>
        set((s) => ({
          holidays: s.holidays.filter((h) => h.id !== id),
        })),

      // Session Notes
      sessionNotes: [],
      setSessionNote: (class_id, date, start_time, content) => {
        const existing = get().sessionNotes.find(
          (n) =>
            n.class_id === class_id && n.date === date && n.start_time === start_time
        )
        if (existing) {
          set((s) => ({
            sessionNotes: s.sessionNotes.map((n) =>
              n.id === existing.id ? { ...n, content } : n
            ),
          }))
        } else {
          const note: SessionNote = {
            id: generateId(),
            class_id,
            date,
            start_time,
            content,
            user_id: get().userId,
          }
          set((s) => ({ sessionNotes: [...s.sessionNotes, note] }))
        }
      },
      getSessionNote: (class_id, date, start_time) => {
        const note = get().sessionNotes.find(
          (n) =>
            n.class_id === class_id && n.date === date && n.start_time === start_time
        )
        return note?.content || ''
      },

      // Attendance
      attendance: [],
      setAttendance: (class_id, date, start_time, student_id, status) => {
        const existing = get().attendance.find(
          (a) =>
            a.class_id === class_id &&
            a.date === date &&
            a.start_time === start_time &&
            a.student_id === student_id
        )
        if (existing) {
          set((s) => ({
            attendance: s.attendance.map((a) =>
              a.id === existing.id ? { ...a, status } : a
            ),
          }))
        } else {
          const att: Attendance = {
            id: generateId(),
            class_id,
            date,
            start_time,
            student_id,
            status,
            user_id: get().userId,
          }
          set((s) => ({ attendance: [...s.attendance, att] }))
        }
      },
      removeAttendance: (class_id, date, start_time, student_id) => {
        set((s) => ({
          attendance: s.attendance.filter(
            (a) =>
              !(
                a.class_id === class_id &&
                a.date === date &&
                a.start_time === start_time &&
                a.student_id === student_id
              )
          ),
        }))
      },
      getAttendance: (class_id, date, start_time) =>
        get().attendance.filter(
          (a) =>
            a.class_id === class_id && a.date === date && a.start_time === start_time
        ),
      getStudentAttendance: (student_id, class_id, month) =>
        get().attendance.filter(
          (a) =>
            a.student_id === student_id &&
            a.class_id === class_id &&
            a.date.startsWith(month)
        ),

      // Legacy Payments
      payments: [],

      // Section 2.9: Payment Transactions
      paymentTransactions: [],
      addPaymentTransaction: (data) => {
        const now = new Date().toISOString()
        const tx: PaymentTransaction = {
          id: generateId(),
          student_id: data.student_id,
          amount: Math.max(0, Math.round(data.amount)),
          paid_at: data.paid_at || now.slice(0, 10),
          method: data.method || 'transfer',
          note: data.note ?? null,
          group_id: data.group_id ?? null,
          created_at: now,
          user_id: get().userId,
        }
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'payment_transaction',
          entity_id: tx.id,
          action: 'create',
          before: null,
          after: tx,
          created_at: now,
          user_id: get().userId,
        }
        set((s) => ({
          paymentTransactions: [...s.paymentTransactions, tx],
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
        return tx
      },
      addBulkPaymentTransactions: (items) => {
        const now = new Date().toISOString()
        const uid = get().userId
        const groupId = items.length > 1 ? `grp-${generateId()}` : null
        const createdTxs: PaymentTransaction[] = []
        const newLogs: ChangeLog[] = []

        for (const item of items) {
          const amt = Math.max(0, Math.round(item.amount))
          if (amt <= 0) continue
          const tx: PaymentTransaction = {
            id: generateId(),
            student_id: item.student_id,
            amount: amt,
            paid_at: item.paid_at || now.slice(0, 10),
            method: item.method || 'transfer',
            note: item.note ?? null,
            group_id: groupId,
            created_at: now,
            user_id: uid,
          }
          createdTxs.push(tx)
          newLogs.push({
            id: generateId(),
            entity: 'payment_transaction',
            entity_id: tx.id,
            action: 'create',
            before: null,
            after: tx,
            created_at: now,
            user_id: uid,
          })
        }

        if (createdTxs.length > 0) {
          set((s) => ({
            paymentTransactions: [...s.paymentTransactions, ...createdTxs],
            changeLogs: [...newLogs, ...s.changeLogs].slice(0, 200),
          }))
        }
        return createdTxs
      },
      updatePaymentTransaction: (id, data) => {
        const existing = get().paymentTransactions.find((t) => t.id === id)
        if (!existing) return
        const now = new Date().toISOString()
        const updated: PaymentTransaction = {
          ...existing,
          ...data,
          amount:
            data.amount !== undefined
              ? Math.max(0, Math.round(data.amount))
              : existing.amount,
        }
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'payment_transaction',
          entity_id: id,
          action: 'update',
          before: existing,
          after: updated,
          created_at: now,
          user_id: get().userId,
        }
        set((s) => ({
          paymentTransactions: s.paymentTransactions.map((t) =>
            t.id === id ? updated : t
          ),
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
      },
      deletePaymentTransaction: (id) => {
        const existing = get().paymentTransactions.find((t) => t.id === id)
        if (!existing) return
        const now = new Date().toISOString()
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'payment_transaction',
          entity_id: id,
          action: 'delete',
          before: existing,
          after: null,
          created_at: now,
          user_id: get().userId,
        }
        set((s) => ({
          paymentTransactions: s.paymentTransactions.filter((t) => t.id !== id),
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
      },

      // Section 2.9: Month Locks ("Chốt tháng")
      monthLocks: [],
      lockMonth: (class_id, month) => {
        const state = get()
        const now = new Date().toISOString()
        const snapshot = buildClassMonthLockSnapshot({
          classId: class_id,
          monthStr: month,
          classes: state.classes,
          students: state.students,
          scheduleRules: state.scheduleRules,
          sessionExceptions: state.sessionExceptions,
          extraSessions: state.extraSessions,
          holidays: state.holidays,
          attendance: state.attendance,
          studentEnrollments: state.studentEnrollments,
          studentStatusHistory: state.studentStatusHistory,
          sessionGuests: state.sessionGuests,
        })
        const existing = state.monthLocks.find(
          (l) => l.class_id === class_id && l.month === month
        )
        const lockObj: MonthLock = {
          id: existing?.id || generateId(),
          class_id,
          month,
          locked_at: now,
          snapshot,
          user_id: state.userId,
        }
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'month_lock',
          entity_id: lockObj.id,
          action: 'lock',
          before: existing || null,
          after: lockObj,
          created_at: now,
          user_id: state.userId,
        }
        set((s) => ({
          monthLocks: [
            ...s.monthLocks.filter(
              (l) => !(l.class_id === class_id && l.month === month)
            ),
            lockObj,
          ],
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
        return lockObj
      },
      unlockMonth: (class_id, month) => {
        const existing = get().monthLocks.find(
          (l) => l.class_id === class_id && l.month === month
        )
        if (!existing) return
        const now = new Date().toISOString()
        const logEntry: ChangeLog = {
          id: generateId(),
          entity: 'month_lock',
          entity_id: existing.id,
          action: 'unlock',
          before: existing,
          after: null,
          created_at: now,
          user_id: get().userId,
        }
        set((s) => ({
          monthLocks: s.monthLocks.filter(
            (l) => !(l.class_id === class_id && l.month === month)
          ),
          changeLogs: [logEntry, ...s.changeLogs].slice(0, 200),
        }))
      },
      isMonthLocked: (class_id, month) =>
        get().monthLocks.some((l) => l.class_id === class_id && l.month === month),

      changeLogs: [],

      // Section 2.10: Google Calendar Sync State
      calendarEventMap: [],
      calendarSyncLogs: [],
      addCalendarSyncLog: (data) =>
        set((s) => ({
          calendarSyncLogs: [
            { ...data, id: generateId(), user_id: get().userId },
            ...s.calendarSyncLogs,
          ].slice(0, 100),
        })),

      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (data) =>
        set((s) => ({ settings: { ...s.settings, ...data } })),

      // Notification Log
      notificationLogs: [],
      addNotificationLog: (data) =>
        set((s) => ({
          notificationLogs: [
            { ...data, id: generateId(), user_id: get().userId },
            ...s.notificationLogs,
          ].slice(0, 100),
        })),
    }),
    {
      name: 'gv-app-store',
      partialize: (state) => ({
        darkMode: state.darkMode,
        calendarViewMode: state.calendarViewMode,
        calendarLayers: state.calendarLayers,
        classes: state.classes,
        students: state.students,
        studentEnrollments: state.studentEnrollments,
        studentStatusHistory: state.studentStatusHistory,
        sessionGuests: state.sessionGuests,
        scheduleRules: state.scheduleRules,
        sessionExceptions: state.sessionExceptions,
        extraSessions: state.extraSessions,
        schoolPeriods: state.schoolPeriods,
        schoolSchedule: state.schoolSchedule,
        schoolWeekConfigs: state.schoolWeekConfigs,
        holidays: state.holidays,
        sessionNotes: state.sessionNotes,
        attendance: state.attendance,
        payments: state.payments,
        paymentTransactions: state.paymentTransactions,
        monthLocks: state.monthLocks,
        changeLogs: state.changeLogs,
        calendarEventMap: state.calendarEventMap,
        calendarSyncLogs: state.calendarSyncLogs,
        settings: state.settings,
        notificationLogs: state.notificationLogs,
      }),
      merge: (persistedState, currentState) => {
        const raw = (persistedState as Partial<AppState> | undefined) || {}

        // If seed version changed or legacy sample classes ("Toán 9 Nâng cao") are present, reset to new schedule data
        try {
          const seedKey = 'gv-data-seed-version'
          const savedSeedVersion =
            typeof window !== 'undefined' ? window.localStorage.getItem(seedKey) : DATA_SEED_VERSION
          const hasOldSampleClasses =
            Array.isArray(raw.classes) &&
            raw.classes.some(
              (c) =>
                c &&
                (c.name === 'Toán 9 Nâng cao' ||
                  c.name === 'Toán 12 Luyện thi ĐH' ||
                  c.name === 'Toán 10 Chuyên đề')
            )

          if (savedSeedVersion !== DATA_SEED_VERSION || hasOldSampleClasses) {
            ensureDataBackupBeforeMigration()
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(seedKey, DATA_SEED_VERSION)
            }
            const targetUserId = raw.userId || currentState.userId || 'local'
            const isSeeded = isDefaultSeededTeacherId(targetUserId)
            return {
              ...currentState,
              darkMode: Boolean(raw.darkMode ?? currentState.darkMode),
              userId: targetUserId,
              classes: isSeeded ? INITIAL_CLASSES : [],
              students: isSeeded ? INITIAL_STUDENTS : [],
              studentEnrollments: isSeeded ? INITIAL_STUDENT_ENROLLMENTS : [],
              studentStatusHistory: isSeeded ? INITIAL_STUDENT_STATUS_HISTORY : [],
              sessionGuests: [],
              scheduleRules: isSeeded ? INITIAL_SCHEDULE_RULES : [],
              sessionExceptions: [],
              extraSessions: [],
              schoolPeriods: INITIAL_SCHOOL_PERIODS,
              schoolSchedule: isSeeded ? INITIAL_SCHOOL_SCHEDULE : [],
              schoolWeekConfigs: {},
              holidays: INITIAL_HOLIDAYS,
              sessionNotes: [],
              attendance: [],
              payments: [],
              paymentTransactions: [],
              monthLocks: [],
              changeLogs: [],
              calendarEventMap: [],
              calendarSyncLogs: [],
              notificationLogs: [],
              settings: { ...DEFAULT_SETTINGS },
              calendarLayers: { ...DEFAULT_LAYERS },
            }
          }
        } catch {
          // continue normal merge if localStorage unavailable
        }

        const merged: AppState = {
          ...currentState,
          ...raw,
        }

        try {
          ensureDataBackupBeforeMigration()

          const periods =
            Array.isArray(raw.schoolPeriods) && raw.schoolPeriods.length > 0
              ? raw.schoolPeriods
              : currentState.schoolPeriods || DEFAULT_SCHOOL_PERIODS

          const currentMonday = getMondayOfDateStr(new Date().toISOString().slice(0, 10))
          const isSeeded = isDefaultSeededTeacherId(merged.userId)
          const rawSchoolSchedule = Array.isArray(raw.schoolSchedule)
            ? raw.schoolSchedule
            : isSeeded
              ? INITIAL_SCHOOL_SCHEDULE
              : []

          let migratedSchedule = migrateLegacySchoolSchedule(
            rawSchoolSchedule,
            periods,
            merged.userId || 'local',
            currentMonday
          )

          if (
            migratedSchedule.length > 0 &&
            !migratedSchedule.some((s) => s.week_start === currentMonday)
          ) {
            const allLegacyOrDefault = migratedSchedule.every(
              (s) =>
                s.week_start === '2026-08-31' ||
                String(s.id || '').startsWith('sch-')
            )
            if (allLegacyOrDefault) {
              migratedSchedule = migratedSchedule.map((s) => ({
                ...s,
                week_start: currentMonday,
                valid_from: currentMonday,
              }))
            }
          }

          const classes = Array.isArray(raw.classes)
            ? raw.classes
            : isSeeded
              ? INITIAL_CLASSES
              : []
          const students = Array.isArray(raw.students)
            ? raw.students
            : isSeeded
              ? INITIAL_STUDENTS
              : []
          const scheduleRules = Array.isArray(raw.scheduleRules)
            ? raw.scheduleRules
            : isSeeded
              ? INITIAL_SCHEDULE_RULES
              : []
          const holidays = Array.isArray(raw.holidays) ? raw.holidays : currentState.holidays || INITIAL_HOLIDAYS
          const attendance = Array.isArray(raw.attendance) ? raw.attendance : []
          const extraSessionsList = Array.isArray(raw.extraSessions) ? raw.extraSessions : []
          const rawExceptions = Array.isArray(raw.sessionExceptions) ? raw.sessionExceptions : []

          // Group A1, D1, E1: Auto-migrate existing students into studentEnrollments & studentStatusHistory without losing any data
          const enrollments = Array.isArray(raw.studentEnrollments)
            ? [...raw.studentEnrollments]
            : []
          const statusHistory = Array.isArray(raw.studentStatusHistory)
            ? [...raw.studentStatusHistory]
            : []

          for (const st of students) {
            if (!st || !st.id) continue
            const hasEnroll = enrollments.some((e) => e.student_id === st.id)
            const stAttDates = attendance
              .filter((a) => a && a.student_id === st.id && a.date)
              .map((a) => a.date)
              .sort()
            const earliestAtt = stAttDates[0]
            const createdDate = String(st.created_at || '2026-09-01').slice(0, 10)
            let safeFromDate = st.start_date || '2026-09-01'
            if (earliestAtt && earliestAtt < safeFromDate) {
              safeFromDate = earliestAtt
            } else if (!st.start_date && createdDate < safeFromDate) {
              safeFromDate = createdDate
            }

            let primaryEnrollId = enrollments.find(
              (e) => e.student_id === st.id && e.kind === 'primary'
            )?.id

            if (!hasEnroll) {
              primaryEnrollId = `enr-mig-${st.id}`
              enrollments.push({
                id: primaryEnrollId,
                student_id: st.id,
                class_id: st.class_id,
                kind: 'primary',
                schedule_rule_ids: null,
                price_override: st.custom_price,
                from_date: safeFromDate,
                to_date: st.left_date || null,
                note: 'Chuyển đổi dữ liệu cũ',
                created_at: st.created_at || new Date().toISOString(),
                user_id: merged.userId || 'local',
              })
            }

            const hasStatusHistory = statusHistory.some((h) => h.student_id === st.id)
            if (!hasStatusHistory) {
              statusHistory.push({
                id: `ssh-mig-${st.id}`,
                student_id: st.id,
                enrollment_id: primaryEnrollId || null,
                status: st.status || 'active',
                effective_from: safeFromDate,
                note: 'Trạng thái khởi tạo từ dữ liệu hiện có',
                created_at: st.created_at || new Date().toISOString(),
                user_id: merged.userId || 'local',
              })
            }
          }

          const migratedTxs = migrateLegacyPaymentsToTransactions({
            legacyPayments: Array.isArray(raw.payments) ? raw.payments : [],
            existingTransactions: Array.isArray(raw.paymentTransactions) ? raw.paymentTransactions : [],
            classes,
            students,
            scheduleRules,
            sessionExceptions: rawExceptions,
            extraSessions: extraSessionsList,
            holidays,
            attendance,
            userId: merged.userId || 'local',
          })

          const curMonthStr = new Date().toISOString().slice(0, 7)
          const cleanedExceptions = rawExceptions.map((e) => {
            if (
              e &&
              e.action === 'cancelled' &&
              e.needs_makeup &&
              String(e.original_date || '').slice(0, 7) < curMonthStr &&
              !extraSessionsList.some((ex) => ex.makeup_for === e.id)
            ) {
              return { ...e, needs_makeup: false }
            }
            return e
          })

          const normalizedWeekConfigs: Record<string, SchoolWeekConfig> = {}
          if (Array.isArray(raw.schoolWeekConfigs)) {
            for (const cfg of raw.schoolWeekConfigs as unknown as SchoolWeekConfig[]) {
              if (cfg && cfg.week_start) {
                normalizedWeekConfigs[cfg.week_start] = cfg
              }
            }
          } else if (raw.schoolWeekConfigs && typeof raw.schoolWeekConfigs === 'object') {
            Object.assign(normalizedWeekConfigs, raw.schoolWeekConfigs)
          }

          return {
            ...merged,
            classes,
            students,
            scheduleRules,
            holidays,
            attendance,
            extraSessions: extraSessionsList,
            schoolPeriods: periods,
            schoolSchedule: migratedSchedule,
            schoolWeekConfigs: normalizedWeekConfigs,
            studentEnrollments: enrollments,
            studentStatusHistory: statusHistory,
            sessionGuests: Array.isArray(raw.sessionGuests) ? raw.sessionGuests : [],
            sessionExceptions: cleanedExceptions,
            sessionNotes: Array.isArray(raw.sessionNotes) ? raw.sessionNotes : [],
            payments: Array.isArray(raw.payments) ? raw.payments : [],
            paymentTransactions: migratedTxs,
            monthLocks: Array.isArray(raw.monthLocks) ? raw.monthLocks : [],
            changeLogs: Array.isArray(raw.changeLogs) ? raw.changeLogs : [],
            calendarEventMap: Array.isArray(raw.calendarEventMap) ? raw.calendarEventMap : [],
            calendarSyncLogs: Array.isArray(raw.calendarSyncLogs) ? raw.calendarSyncLogs : [],
            notificationLogs: Array.isArray(raw.notificationLogs) ? raw.notificationLogs : [],
            settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
            calendarLayers: { ...DEFAULT_LAYERS, ...(raw.calendarLayers || {}) },
          }
        } catch {
          return {
            ...merged,
            settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
            calendarLayers: { ...DEFAULT_LAYERS, ...(raw.calendarLayers || {}) },
            schoolWeekConfigs:
              raw.schoolWeekConfigs && !Array.isArray(raw.schoolWeekConfigs)
                ? raw.schoolWeekConfigs
                : {},
          }
        }
      },
    }
  )
)
