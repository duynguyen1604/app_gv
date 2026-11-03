import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Class, Student, ScheduleRule, SessionException, ExtraSession, Attendance, Payment, SessionNote, SchoolSchedule, Holiday, Settings, NotificationLog } from '../types'
import { generateId } from '../lib/utils'
import { INITIAL_CLASSES, INITIAL_STUDENTS, INITIAL_SCHEDULE_RULES, INITIAL_SCHOOL_SCHEDULE, INITIAL_HOLIDAYS } from './initialData'

interface AppState {
  // Theme
  darkMode: boolean
  toggleDarkMode: () => void

  // Auth (simplified - can integrate Supabase Auth later)
  userId: string

  // Classes
  classes: Class[]
  addClass: (data: Omit<Class, 'id' | 'created_at' | 'user_id'>) => Class
  updateClass: (id: string, data: Partial<Class>) => void
  deleteClass: (id: string) => void

  // Students
  students: Student[]
  addStudent: (data: Omit<Student, 'id' | 'created_at'>) => Student
  addStudentsBulk: (class_id: string, names: string[]) => Student[]
  updateStudent: (id: string, data: Partial<Student>) => void
  deleteStudent: (id: string) => void
  getStudentsByClass: (class_id: string) => Student[]

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

  // Extra Sessions
  extraSessions: ExtraSession[]
  addExtraSession: (data: Omit<ExtraSession, 'id' | 'user_id'>) => ExtraSession
  updateExtraSession: (id: string, data: Partial<ExtraSession>) => void
  deleteExtraSession: (id: string) => void

  // School Schedule
  schoolSchedule: SchoolSchedule[]
  addSchoolScheduleItem: (data: Omit<SchoolSchedule, 'id' | 'user_id'>) => SchoolSchedule
  setSchoolSchedule: (items: Omit<SchoolSchedule, 'id' | 'user_id'>[], validFrom: string, validTo: string | null) => void
  updateSchoolScheduleItem: (id: string, data: Partial<SchoolSchedule>) => void
  deleteSchoolScheduleItem: (id: string) => void

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
  setAttendance: (class_id: string, date: string, start_time: string, student_id: string, status: 'present' | 'absent' | 'excused') => void
  removeAttendance: (class_id: string, date: string, start_time: string, student_id: string) => void
  getAttendance: (class_id: string, date: string, start_time: string) => Attendance[]
  getStudentAttendance: (student_id: string, class_id: string, month: string) => Attendance[]

  // Payments
  payments: Payment[]
  setPayment: (student_id: string, month: string, paid: boolean) => void
  getPayment: (student_id: string, month: string) => Payment | undefined

  // Settings
  settings: Settings
  updateSettings: (data: Partial<Settings>) => void

  // Notification Log
  notificationLogs: NotificationLog[]
  addNotificationLog: (data: Omit<NotificationLog, 'id' | 'user_id'>) => void
}

const DEFAULT_SETTINGS: Settings = {
  id: 'default',
  user_id: 'local',
  notify_enabled: false,
  notify_time: '06:00',
  notify_email: '',
  notify_content: 'both',
  weekly_summary: false,
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      darkMode: false,
      toggleDarkMode: () => set(s => ({ darkMode: !s.darkMode })),

      userId: 'local',

      // Classes
      classes: INITIAL_CLASSES,
      addClass: (data) => {
        const newClass: Class = {
          ...data,
          id: generateId(),
          created_at: new Date().toISOString(),
          user_id: get().userId,
        }
        set(s => ({ classes: [...s.classes, newClass] }))
        return newClass
      },
      updateClass: (id, data) => set(s => ({
        classes: s.classes.map(c => c.id === id ? { ...c, ...data } : c)
      })),
      deleteClass: (id) => set(s => ({
        classes: s.classes.filter(c => c.id !== id),
        students: s.students.filter(st => st.class_id !== id),
        scheduleRules: s.scheduleRules.filter(r => r.class_id !== id),
        extraSessions: s.extraSessions.filter(e => e.class_id !== id),
      })),

      // Students
      students: INITIAL_STUDENTS,
      addStudent: (data) => {
        const student: Student = {
          ...data,
          id: generateId(),
          created_at: new Date().toISOString(),
        }
        set(s => ({ students: [...s.students, student] }))
        return student
      },
      addStudentsBulk: (class_id, names) => {
        const newStudents: Student[] = names
          .map(n => n.trim())
          .filter(n => n.length > 0)
          .map(name => ({
            id: generateId(),
            class_id,
            name,
            parent_name: null,
            parent_phone: null,
            custom_price: null,
            status: 'active' as const,
            note: null,
            created_at: new Date().toISOString(),
          }))
        set(s => ({ students: [...s.students, ...newStudents] }))
        return newStudents
      },
      updateStudent: (id, data) => set(s => ({
        students: s.students.map(st => st.id === id ? { ...st, ...data } : st)
      })),
      deleteStudent: (id) => set(s => ({
        students: s.students.filter(st => st.id !== id),
        attendance: s.attendance.filter(a => a.student_id !== id),
      })),
      getStudentsByClass: (class_id) => get().students.filter(s => s.class_id === class_id),

      // Schedule Rules
      scheduleRules: INITIAL_SCHEDULE_RULES,
      addScheduleRule: (data) => {
        const rule: ScheduleRule = { ...data, id: generateId(), user_id: get().userId }
        set(s => ({ scheduleRules: [...s.scheduleRules, rule] }))
        return rule
      },
      updateScheduleRule: (id, data) => set(s => ({
        scheduleRules: s.scheduleRules.map(r => r.id === id ? { ...r, ...data } : r)
      })),
      deleteScheduleRule: (id) => set(s => ({
        scheduleRules: s.scheduleRules.filter(r => r.id !== id),
        sessionExceptions: s.sessionExceptions.filter(e => e.rule_id !== id),
      })),

      // Session Exceptions
      sessionExceptions: [],
      addSessionException: (data) => {
        const ex: SessionException = { ...data, id: generateId(), user_id: get().userId }
        set(s => ({ sessionExceptions: [...s.sessionExceptions, ex] }))
        return ex
      },
      updateSessionException: (id, data) => set(s => ({
        sessionExceptions: s.sessionExceptions.map(e => e.id === id ? { ...e, ...data } : e)
      })),
      deleteSessionException: (id) => set(s => ({
        sessionExceptions: s.sessionExceptions.filter(e => e.id !== id)
      })),

      // Extra Sessions
      extraSessions: [],
      addExtraSession: (data) => {
        const ex: ExtraSession = { ...data, id: generateId(), user_id: get().userId }
        set(s => ({ extraSessions: [...s.extraSessions, ex] }))
        return ex
      },
      updateExtraSession: (id, data) => set(s => ({
        extraSessions: s.extraSessions.map(e => e.id === id ? { ...e, ...data } : e)
      })),
      deleteExtraSession: (id) => set(s => ({
        extraSessions: s.extraSessions.filter(e => e.id !== id)
      })),

      // School Schedule
      schoolSchedule: INITIAL_SCHOOL_SCHEDULE,
      addSchoolScheduleItem: (data) => {
        const item: SchoolSchedule = { ...data, id: generateId(), user_id: get().userId }
        set(s => ({ schoolSchedule: [...s.schoolSchedule, item] }))
        return item
      },
      setSchoolSchedule: (items, validFrom, validTo) => {
        const newItems: SchoolSchedule[] = items.map(item => ({
          ...item,
          id: generateId(),
          user_id: get().userId,
          valid_from: validFrom,
          valid_to: validTo,
        }))
        set({ schoolSchedule: newItems })
      },
      updateSchoolScheduleItem: (id, data) => set(s => ({
        schoolSchedule: s.schoolSchedule.map(i => i.id === id ? { ...i, ...data } : i)
      })),
      deleteSchoolScheduleItem: (id) => set(s => ({
        schoolSchedule: s.schoolSchedule.filter(i => i.id !== id)
      })),

      // Holidays
      holidays: INITIAL_HOLIDAYS,
      addHoliday: (data) => {
        const h: Holiday = { ...data, id: generateId(), user_id: get().userId }
        set(s => ({ holidays: [...s.holidays, h] }))
        return h
      },
      deleteHoliday: (id) => set(s => ({
        holidays: s.holidays.filter(h => h.id !== id)
      })),

      // Session Notes
      sessionNotes: [],
      setSessionNote: (class_id, date, start_time, content) => {
        const existing = get().sessionNotes.find(
          n => n.class_id === class_id && n.date === date && n.start_time === start_time
        )
        if (existing) {
          set(s => ({
            sessionNotes: s.sessionNotes.map(n =>
              n.id === existing.id ? { ...n, content } : n
            )
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
          set(s => ({ sessionNotes: [...s.sessionNotes, note] }))
        }
      },
      getSessionNote: (class_id, date, start_time) => {
        const note = get().sessionNotes.find(
          n => n.class_id === class_id && n.date === date && n.start_time === start_time
        )
        return note?.content || ''
      },

      // Attendance
      attendance: [],
      setAttendance: (class_id, date, start_time, student_id, status) => {
        const existing = get().attendance.find(
          a => a.class_id === class_id && a.date === date &&
            a.start_time === start_time && a.student_id === student_id
        )
        if (existing) {
          set(s => ({
            attendance: s.attendance.map(a =>
              a.id === existing.id ? { ...a, status } : a
            )
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
          set(s => ({ attendance: [...s.attendance, att] }))
        }
      },
      removeAttendance: (class_id, date, start_time, student_id) => {
        set(s => ({
          attendance: s.attendance.filter(
            a => !(a.class_id === class_id && a.date === date &&
              a.start_time === start_time && a.student_id === student_id)
          )
        }))
      },
      getAttendance: (class_id, date, start_time) =>
        get().attendance.filter(
          a => a.class_id === class_id && a.date === date && a.start_time === start_time
        ),
      getStudentAttendance: (student_id, class_id, month) =>
        get().attendance.filter(
          a => a.student_id === student_id && a.class_id === class_id &&
            a.date.startsWith(month)
        ),

      // Payments
      payments: [],
      setPayment: (student_id, month, paid) => {
        const existing = get().payments.find(
          p => p.student_id === student_id && p.month === month
        )
        if (existing) {
          set(s => ({
            payments: s.payments.map(p =>
              p.id === existing.id ? { ...p, paid, paid_at: paid ? new Date().toISOString() : null } : p
            )
          }))
        } else {
          const payment: Payment = {
            id: generateId(),
            student_id,
            month,
            paid,
            paid_at: paid ? new Date().toISOString() : null,
            user_id: get().userId,
          }
          set(s => ({ payments: [...s.payments, payment] }))
        }
      },
      getPayment: (student_id, month) =>
        get().payments.find(p => p.student_id === student_id && p.month === month),

      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (data) => set(s => ({ settings: { ...s.settings, ...data } })),

      // Notification Log
      notificationLogs: [],
      addNotificationLog: (data) => set(s => ({
        notificationLogs: [
          { ...data, id: generateId(), user_id: get().userId },
          ...s.notificationLogs
        ].slice(0, 100) // keep last 100
      })),
    }),
    {
      name: 'gv-app-store',
      partialize: (state) => ({
        darkMode: state.darkMode,
        classes: state.classes,
        students: state.students,
        scheduleRules: state.scheduleRules,
        sessionExceptions: state.sessionExceptions,
        extraSessions: state.extraSessions,
        schoolSchedule: state.schoolSchedule,
        holidays: state.holidays,
        sessionNotes: state.sessionNotes,
        attendance: state.attendance,
        payments: state.payments,
        settings: state.settings,
        notificationLogs: state.notificationLogs,
      }),
    }
  )
)

