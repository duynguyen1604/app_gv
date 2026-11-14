import { format } from 'date-fns'
import { dateToWeekday, formatMoney, formatMonth, getCurrentMonth, getDaysInMonth } from './dateUtils'
import type {
  Attendance,
  AttendanceStatus,
  Class,
  ExtraSession,
  FeeRow,
  Holiday,
  MonthFeeStatus,
  MonthLock,
  MonthLockStudentSnapshot,
  Payment,
  PaymentTransaction,
  ScheduleRule,
  SessionException,
  SessionGuest,
  SessionNote,
  Student,
  StudentClassFeeBreakdown,
  StudentEnrollment,
  StudentStatus,
  StudentStatusHistory,
} from '../types'

export interface StudentSessionDetailItem {
  id: string
  date: string // YYYY-MM-DD
  weekday: number // 1=T2..7=CN
  start_time: string // HH:mm
  end_time: string // HH:mm
  class_id: string
  class_name: string
  class_color: string
  billed_class_id: string
  billed_class_name: string
  session_kind:
    | 'primary'
    | 'extra_long_term'
    | 'guest_swap'
    | 'guest_extra'
    | 'swapped_away'
    | 'cancelled_or_holiday'
    | 'out_of_window'
  student_status_on_date: StudentStatus
  attendance_status: AttendanceStatus | 'unmarked' | 'swapped_away' | 'cancelled'
  unit_price: number
  charged_amount: number
  badge_label: string
  dot_color: 'green' | 'red' | 'amber' | 'slate' | 'purple' | 'hollow'
  note: string
  lesson_note?: string
  transfer_banner_before?: string | null
  out_of_enrollment_window?: boolean
  guest_id?: string
  enrollment_id?: string
}

export interface StudentMonthSummary {
  month: string // YYYY-MM
  present_count: number
  absent_count: number
  excused_count: number
  trial_count: number
  guest_count: number
  unmarked_count: number
  status_note: string | null
  class_breakdowns: StudentClassFeeBreakdown[]
  session_details: StudentSessionDetailItem[]
  price_per_session: number
  due_amount: number // Phải thu của tháng
  allocated_paid: number // Đã thu được phân bổ vào tháng này theo FIFO
  shortage: number // Còn thiếu của riêng tháng này (due_amount - allocated_paid)
  paid_in_month: number // Tổng giao dịch thu diễn ra trong tháng M
  cumulative_due: number // Tổng phải thu tính đến hết tháng M
  cumulative_paid: number // Tổng đã thu tính đến hết tháng M
  cumulative_balance: number // Số dư tích lũy cuối tháng M = cumulative_paid - cumulative_due (âm = nợ, dương = dư)
  status: MonthFeeStatus // 'Đủ' | 'Còn thiếu' | 'Chưa đóng' | 'Đóng dư'
  is_locked: boolean
}

export interface StudentLedgerEntry {
  id: string
  date: string // YYYY-MM-DD
  month: string // YYYY-MM
  type: 'charge' | 'payment'
  title: string
  subtitle: string
  debit: number // Phải thu (+)
  credit: number // Đã đóng (+)
  balance_after: number // Số dư sau dòng này (âm = đang nợ, dương = đóng dư)
  transaction?: PaymentTransaction
  is_locked?: boolean
}

export interface StudentDebtProfile {
  student: Student
  cls: Class | undefined
  months: Record<string, StudentMonthSummary>
  orderedMonths: StudentMonthSummary[]
  ledgerEntries: StudentLedgerEntry[]
  total_due: number
  total_paid: number
  balance: number // total_paid - total_due (âm = nợ, dương = dư)
  debt_amount: number // Math.max(0, total_due - total_paid)
  credit_amount: number // Math.max(0, total_paid - total_due)
  unpaid_months: {
    month: string
    due: number
    allocated: number
    shortage: number
  }[]
  oldest_unpaid_month: string | null
  unpaid_months_count: number
}

export interface EffectiveSessionStudentItem {
  student: Student
  mode:
    | 'regular'
    | 'extra_long_term'
    | 'guest_swap'
    | 'guest_extra'
    | 'swapped_away'
    | 'out_of_window'
    | 'future_start'
  statusOnDate: StudentStatus
  enrollment?: StudentEnrollment
  guest?: SessionGuest
  swappedToGuest?: SessionGuest
  homeClassName?: string
  targetClassName?: string
  badgeText?: string
  futureStartDate?: string
}

/**
 * Format YYYY-MM-DD into dd/mm
 */
export function formatShortDdMm(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [, mm, dd] = dateStr.slice(0, 10).split('-')
  return `${dd}/${mm}`
}

/**
 * Format YYYY-MM-DD into dd/mm/yyyy
 */
export function formatFullDdMmYyyy(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [yyyy, mm, dd] = dateStr.slice(0, 10).split('-')
  return `${dd}/${mm}/${yyyy}`
}

/**
 * Group A1: Resolve a student's status ('trial' | 'active' | 'left') ON A SPECIFIC DATE (YYYY-MM-DD),
 * NOT their current status.
 */
export function resolveStudentStatusOnDate({
  student,
  dateStr,
  studentStatusHistory = [],
  enrollmentId,
}: {
  student: Student
  dateStr: string
  studentStatusHistory?: StudentStatusHistory[]
  enrollmentId?: string | null
}): StudentStatus {
  if (student.left_date && dateStr > student.left_date) {
    return 'left'
  }

  const relevant = studentStatusHistory
    .filter(
      (h) =>
        h.student_id === student.id &&
        (!enrollmentId || !h.enrollment_id || h.enrollment_id === enrollmentId)
    )
    .sort((a, b) => {
      const cmp = a.effective_from.localeCompare(b.effective_from)
      if (cmp !== 0) return cmp
      return (a.created_at || '').localeCompare(b.created_at || '')
    })

  if (relevant.length === 0) {
    return student.status
  }

  // Find latest row with effective_from <= dateStr
  const onOrBefore = relevant.filter((h) => h.effective_from <= dateStr)
  if (onOrBefore.length > 0) {
    return onOrBefore[onOrBefore.length - 1].status
  }

  // If dateStr is earlier than the earliest status_history row:
  // If the earliest row was a conversion to 'active', before that date the student was 'trial'
  const firstRow = relevant[0]
  if (firstRow.status === 'active' && relevant.length === 1 && student.status === 'active') {
    return 'active'
  }
  return firstRow.status
}

/**
 * Get a student's current status as of today from studentStatusHistory
 */
export function getStudentCurrentStatus(
  student: Student,
  studentStatusHistory: StudentStatusHistory[] = [],
  todayStr = new Date().toISOString().slice(0, 10)
): StudentStatus {
  return resolveStudentStatusOnDate({
    student,
    dateStr: todayStr,
    studentStatusHistory,
  })
}

/**
 * Group D1 & E1: Get all enrollments for a student, synthesizing a primary enrollment if none exist yet
 */
export function getStudentEnrollmentsWithFallback(
  student: Student,
  studentEnrollments: StudentEnrollment[] = [],
  attendance: Attendance[] = []
): StudentEnrollment[] {
  const existing = studentEnrollments
    .filter((e) => e.student_id === student.id)
    .sort((a, b) => a.from_date.localeCompare(b.from_date))

  if (existing.length > 0) {
    return existing
  }

  // Fallback for legacy student records: earliest attendance date or start_date or 2026-01-01
  const studentAttDates = attendance
    .filter((a) => a.student_id === student.id)
    .map((a) => a.date)
    .sort()
  const earliestAtt = studentAttDates[0]
  const createdDate = (student.created_at || '2026-01-01').slice(0, 10)
  let fallbackFrom = student.start_date || '2026-01-01'
  if (earliestAtt && earliestAtt < fallbackFrom) {
    fallbackFrom = earliestAtt
  } else if (!student.start_date && createdDate < fallbackFrom) {
    fallbackFrom = createdDate
  }

  return [
    {
      id: `default-enroll-${student.id}`,
      student_id: student.id,
      class_id: student.class_id,
      kind: 'primary',
      schedule_rule_ids: null,
      price_override: student.custom_price,
      from_date: fallbackFrom,
      to_date: student.left_date || null,
      note: null,
      created_at: student.created_at || new Date().toISOString(),
      user_id: 'local',
    },
  ]
}

/**
 * Compute all actual tutoring sessions held for a class in a given month (YYYY-MM),
 * including rule_id and end_time so long-term extra enrollments can filter by schedule_rule_ids.
 */
export function getClassSessionsForMonth({
  classId,
  monthStr,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays = [],
  includeCancelledAndHolidays = false,
}: {
  classId: string
  monthStr: string
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays?: Holiday[]
  includeCancelledAndHolidays?: boolean
}): {
  date: string
  start_time: string
  end_time: string
  rule_id?: string
  is_cancelled?: boolean
  cancel_reason?: string
}[] {
  const daysInMonth = getDaysInMonth(monthStr)
  const holidayMap = new Map(holidays.map((h) => [h.date, h.note || 'Nghỉ lễ']))
  const sessions: {
    date: string
    start_time: string
    end_time: string
    rule_id?: string
    is_cancelled?: boolean
    cancel_reason?: string
  }[] = []

  for (const day of daysInMonth) {
    const dateStr = format(day, 'yyyy-MM-dd')
    const isHoliday = holidayMap.has(dateStr)
    const weekday = dateToWeekday(day)

    const applicable = scheduleRules.filter(
      (r) =>
        r.class_id === classId &&
        r.weekday === weekday &&
        r.valid_from <= dateStr &&
        (!r.valid_to || r.valid_to >= dateStr)
    )

    for (const rule of applicable) {
      if (isHoliday) {
        if (includeCancelledAndHolidays) {
          sessions.push({
            date: dateStr,
            start_time: rule.start_time,
            end_time: rule.end_time,
            rule_id: rule.id,
            is_cancelled: true,
            cancel_reason: `Nghỉ lễ: ${holidayMap.get(dateStr)}`,
          })
        }
        continue
      }

      const exception = sessionExceptions.find(
        (e) => e.rule_id === rule.id && e.original_date === dateStr
      )
      if (exception?.action === 'cancelled') {
        if (includeCancelledAndHolidays) {
          sessions.push({
            date: dateStr,
            start_time: rule.start_time,
            end_time: rule.end_time,
            rule_id: rule.id,
            is_cancelled: true,
            cancel_reason: exception.reason || 'Lớp hủy buổi',
          })
        }
        continue
      }
      if (exception?.action === 'moved') {
        if (
          exception.new_date?.startsWith(monthStr) &&
          exception.new_date &&
          exception.new_start &&
          !holidayMap.has(exception.new_date)
        ) {
          const already = sessions.find(
            (s) =>
              s.date === exception.new_date &&
              s.start_time === exception.new_start &&
              !s.is_cancelled
          )
          if (!already) {
            sessions.push({
              date: exception.new_date,
              start_time: exception.new_start,
              end_time: exception.new_end || rule.end_time,
              rule_id: rule.id,
            })
          }
        }
        continue
      }
      const already = sessions.find(
        (s) => s.date === dateStr && s.start_time === rule.start_time && !s.is_cancelled
      )
      if (!already) {
        sessions.push({
          date: dateStr,
          start_time: rule.start_time,
          end_time: rule.end_time,
          rule_id: rule.id,
        })
      }
    }
  }

  // Moved sessions from another month landing in this month
  sessionExceptions
    .filter((e) => {
      const rule = scheduleRules.find((r) => r.id === e.rule_id && r.class_id === classId)
      return (
        rule &&
        e.action === 'moved' &&
        e.new_date?.startsWith(monthStr) &&
        e.new_date &&
        e.new_start &&
        !holidayMap.has(e.new_date)
      )
    })
    .forEach((e) => {
      const rule = scheduleRules.find((r) => r.id === e.rule_id)
      const already = sessions.find(
        (s) => s.date === e.new_date && s.start_time === e.new_start && !s.is_cancelled
      )
      if (!already && e.new_date && e.new_start) {
        sessions.push({
          date: e.new_date,
          start_time: e.new_start,
          end_time: e.new_end || rule?.end_time || '19:00',
          rule_id: e.rule_id,
        })
      }
    })

  // Extra sessions in this month
  extraSessions
    .filter(
      (e) =>
        e.class_id === classId &&
        e.date.startsWith(monthStr) &&
        !holidayMap.has(e.date)
    )
    .forEach((e) => {
      const already = sessions.find(
        (s) => s.date === e.date && s.start_time === e.start_time && !s.is_cancelled
      )
      if (!already) {
        sessions.push({
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
        })
      }
    })

  return sessions.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  })
}

/**
 * Group D3: Check if a swap guest session is still valid (host session was not cancelled and student was not marked absent at host)
 */
export function isSwapGuestEffective({
  guest,
  attendance,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays,
}: {
  guest: SessionGuest
  attendance: Attendance[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays: Holiday[]
}): boolean {
  // Check if host session exists & wasn't cancelled
  const hostMonth = guest.date.slice(0, 7)
  const hostSessions = getClassSessionsForMonth({
    classId: guest.host_class_id,
    monthStr: hostMonth,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
  })
  const hostSessionExists = hostSessions.some(
    (s) => s.date === guest.date && s.start_time === guest.start_time
  )
  if (!hostSessionExists) {
    return false
  }

  // If student was explicitly marked 'absent' at the host class, D3 says original session reverts to absent/needs makeup
  const hostAtt = attendance.find(
    (a) =>
      a.student_id === guest.student_id &&
      a.class_id === guest.host_class_id &&
      a.date === guest.date &&
      a.start_time === guest.start_time
  )
  if (hostAtt && hostAtt.status === 'absent') {
    return false
  }

  return true
}

/**
 * Group D4 & E1: Compute the list of effective students for a specific session (for Attendance UI)
 */
export function getEffectiveStudentsForSession({
  classId,
  dateStr,
  startTime,
  ruleId,
  students,
  classes,
  studentEnrollments = [],
  studentStatusHistory = [],
  sessionGuests = [],
  attendance = [],
  scheduleRules = [],
  sessionExceptions = [],
  extraSessions = [],
  holidays = [],
}: {
  classId: string
  dateStr: string
  startTime: string
  ruleId?: string
  students: Student[]
  classes: Class[]
  studentEnrollments?: StudentEnrollment[]
  studentStatusHistory?: StudentStatusHistory[]
  sessionGuests?: SessionGuest[]
  attendance?: Attendance[]
  scheduleRules?: ScheduleRule[]
  sessionExceptions?: SessionException[]
  extraSessions?: ExtraSession[]
  holidays?: Holiday[]
}): EffectiveSessionStudentItem[] {
  const result: EffectiveSessionStudentItem[] = []
  const includedStudentIds = new Set<string>()
  const sessionKey = `${classId}|${dateStr}|${startTime}`

  // 1. Students enrolled in `classId` (primary or long-term extra)
  for (const student of students) {
    const enrolls = getStudentEnrollmentsWithFallback(student, studentEnrollments, attendance)
    const classEnrolls = enrolls.filter((e) => e.class_id === classId)

    // Check active enrollment on `dateStr`
    const activeEnroll = classEnrolls.find(
      (e) =>
        e.from_date <= dateStr &&
        (!e.to_date || e.to_date >= dateStr) &&
        (!e.schedule_rule_ids ||
          e.schedule_rule_ids.length === 0 ||
          !ruleId ||
          e.schedule_rule_ids.includes(ruleId))
    )

    if (activeEnroll) {
      const statusOnDate = resolveStudentStatusOnDate({
        student,
        dateStr,
        studentStatusHistory,
        enrollmentId: activeEnroll.id,
      })

      const hasExistingAtt = attendance.some(
        (a) =>
          a.student_id === student.id &&
          a.class_id === classId &&
          a.date === dateStr &&
          a.start_time === startTime
      )

      if (statusOnDate === 'left' && !hasExistingAtt) {
        continue
      }

      // Check if student swapped away from this session
      const swapAway = sessionGuests.find(
        (g) =>
          g.student_id === student.id &&
          g.kind === 'swap' &&
          (g.home_session_key === sessionKey ||
            (g.home_class_id === classId &&
              g.home_date === dateStr &&
              g.home_start_time === startTime))
      )

      if (
        swapAway &&
        isSwapGuestEffective({
          guest: swapAway,
          attendance,
          scheduleRules,
          sessionExceptions,
          extraSessions,
          holidays,
        })
      ) {
        const targetCls = classes.find((c) => c.id === swapAway.host_class_id)
        includedStudentIds.add(student.id)
        result.push({
          student,
          mode: 'swapped_away',
          statusOnDate,
          enrollment: activeEnroll,
          swappedToGuest: swapAway,
          targetClassName: targetCls?.name || 'Lớp khác',
          badgeText: `Đã sang ${targetCls?.name || 'lớp khác'} (${formatShortDdMm(swapAway.date)})`,
        })
        continue
      }

      includedStudentIds.add(student.id)
      const enrollPrice =
        activeEnroll.price_override ?? student.custom_price ?? classes.find((c) => c.id === activeEnroll.class_id)?.price ?? 0
      const effectiveTrialPrice = Math.max(0, Math.round(student.trial_price ?? enrollPrice))
      result.push({
        student,
        mode: activeEnroll.kind === 'extra' ? 'extra_long_term' : 'regular',
        statusOnDate,
        enrollment: activeEnroll,
        badgeText:
          activeEnroll.kind === 'extra'
            ? 'Học thêm dài hạn'
            : statusOnDate === 'trial'
            ? effectiveTrialPrice === 0
              ? 'Học thử (0đ)'
              : `Học thử (${formatMoney(effectiveTrialPrice)})`
            : undefined,
      })
      continue
    }

    // Check if student has a future enrollment in this class (E2: "Bắt đầu từ dd/mm")
    const futureEnroll = classEnrolls.find((e) => e.from_date > dateStr)
    const hasAttOutside = attendance.some(
      (a) =>
        a.student_id === student.id &&
        a.class_id === classId &&
        a.date === dateStr &&
        a.start_time === startTime
    )

    if (hasAttOutside) {
      // Rule E1: Never hide an existing attendance record outside [from_date, to_date]
      const statusOnDate = resolveStudentStatusOnDate({
        student,
        dateStr,
        studentStatusHistory,
      })
      includedStudentIds.add(student.id)
      result.push({
        student,
        mode: 'out_of_window',
        statusOnDate,
        badgeText: 'Ngoài thời gian đăng ký',
      })
    } else if (futureEnroll && student.class_id === classId) {
      // Show muted info row for future start date on student list if needed
    }
  }

  // 2. Guest / Swap students visiting `classId` on `(dateStr, startTime)` (Group D2 & D4)
  const guestsHere = sessionGuests.filter(
    (g) => g.host_class_id === classId && g.date === dateStr && g.start_time === startTime
  )

  for (const guest of guestsHere) {
    if (includedStudentIds.has(guest.student_id)) continue
    const student = students.find((s) => s.id === guest.student_id)
    if (!student) continue
    const homeCls = classes.find((c) => c.id === (guest.home_class_id || student.class_id))
    const statusOnDate = resolveStudentStatusOnDate({
      student,
      dateStr,
      studentStatusHistory,
    })

    includedStudentIds.add(student.id)
    result.push({
      student,
      mode: guest.kind === 'swap' ? 'guest_swap' : 'guest_extra',
      statusOnDate,
      guest,
      homeClassName: homeCls?.name || 'Lớp gốc',
      badgeText:
        guest.kind === 'swap'
          ? `Học ghép · từ ${homeCls?.name || 'lớp gốc'}`
          : `Học thêm${homeCls ? ` · từ ${homeCls.name}` : ''}`,
    })
  }

  // 3. Any other student with an existing attendance record for (classId, dateStr, startTime) (Rule E1 safety)
  const extraAtts = attendance.filter(
    (a) =>
      a.class_id === classId &&
      a.date === dateStr &&
      a.start_time === startTime &&
      !includedStudentIds.has(a.student_id)
  )
  for (const att of extraAtts) {
    const student = students.find((s) => s.id === att.student_id)
    if (!student) continue
    includedStudentIds.add(student.id)
    result.push({
      student,
      mode: 'out_of_window',
      statusOnDate: resolveStudentStatusOnDate({
        student,
        dateStr,
        studentStatusHistory,
      }),
      badgeText: 'Ngoài thời gian đăng ký',
    })
  }

  return result
}

/**
 * Group A2, D3, E1, E3, E4: Compute full session-by-session breakdown & billing for a student in a given month
 */
export function computeStudentMonthSessionDetails({
  student,
  monthStr,
  classes,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays = [],
  attendance,
  studentEnrollments = [],
  studentStatusHistory = [],
  sessionGuests = [],
  sessionNotes = [],
}: {
  student: Student
  monthStr: string
  classes: Class[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays?: Holiday[]
  attendance: Attendance[]
  studentEnrollments?: StudentEnrollment[]
  studentStatusHistory?: StudentStatusHistory[]
  sessionGuests?: SessionGuest[]
  sessionNotes?: SessionNote[]
}): {
  items: StudentSessionDetailItem[]
  present_count: number
  absent_count: number
  excused_count: number
  trial_count: number
  guest_count: number
  unmarked_count: number
  due_amount: number
  price_per_session: number
  status_note: string | null
  class_breakdowns: StudentClassFeeBreakdown[]
} {
  const enrolls = getStudentEnrollmentsWithFallback(student, studentEnrollments, attendance)
  const primaryCls = classes.find((c) => c.id === student.class_id)
  const defaultUnitPrice = Math.max(0, Math.round(student.custom_price ?? primaryCls?.price ?? 0))

  const items: StudentSessionDetailItem[] = []
  const processedKeys = new Set<string>() // `${classId}|${date}|${start_time}`

  const getLessonNote = (cId: string, d: string, st: string) =>
    sessionNotes.find((n) => n.class_id === cId && n.date === d && n.start_time === st)?.content || ''

  // Collect all classes relevant to this student in `monthStr`
  const relevantClassIds = new Set<string>()
  enrolls.forEach((e) => relevantClassIds.add(e.class_id))
  sessionGuests
    .filter((g) => g.student_id === student.id && g.date.startsWith(monthStr))
    .forEach((g) => {
      relevantClassIds.add(g.host_class_id)
      if (g.home_class_id) relevantClassIds.add(g.home_class_id)
    })
  attendance
    .filter((a) => a.student_id === student.id && a.date.startsWith(monthStr))
    .forEach((a) => relevantClassIds.add(a.class_id))

  // 1. Process sessions from enrollments (primary & long-term extra)
  for (const enroll of enrolls) {
    // Check if enrollment overlaps with monthStr
    const monthStart = `${monthStr}-01`
    const monthEnd = `${monthStr}-31`
    if (enroll.from_date > monthEnd) continue
    if (enroll.to_date && enroll.to_date < monthStart) continue

    const cls = classes.find((c) => c.id === enroll.class_id)
    const clsName = cls?.name || 'Lớp học'
    const clsColor = cls?.color || '#2563EB'
    const enrollUnitPrice = Math.max(
      0,
      Math.round(enroll.price_override ?? student.custom_price ?? cls?.price ?? 0)
    )

    const allMonthSessions = getClassSessionsForMonth({
      classId: enroll.class_id,
      monthStr,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      includeCancelledAndHolidays: true,
    })

    for (const sess of allMonthSessions) {
      if (sess.date < enroll.from_date) continue
      if (enroll.to_date && sess.date > enroll.to_date) continue
      if (
        enroll.schedule_rule_ids &&
        enroll.schedule_rule_ids.length > 0 &&
        sess.rule_id &&
        !enroll.schedule_rule_ids.includes(sess.rule_id)
      ) {
        continue
      }

      const statusOnDate = resolveStudentStatusOnDate({
        student,
        dateStr: sess.date,
        studentStatusHistory,
        enrollmentId: enroll.id,
      })

      const att = attendance.find(
        (a) =>
          a.student_id === student.id &&
          a.class_id === enroll.class_id &&
          a.date === sess.date &&
          a.start_time === sess.start_time
      )

      if (statusOnDate === 'left' && !att) {
        continue
      }

      const key = `${enroll.class_id}|${sess.date}|${sess.start_time}`
      if (processedKeys.has(key)) continue
      processedKeys.add(key)

      const lessonNote = getLessonNote(enroll.class_id, sess.date, sess.start_time)

      if (sess.is_cancelled) {
        items.push({
          id: `sess-cancel-${key}`,
          date: sess.date,
          weekday: dateToWeekday(sess.date),
          start_time: sess.start_time,
          end_time: sess.end_time,
          class_id: enroll.class_id,
          class_name: clsName,
          class_color: clsColor,
          billed_class_id: enroll.class_id,
          billed_class_name: clsName,
          session_kind: 'cancelled_or_holiday',
          student_status_on_date: statusOnDate,
          attendance_status: 'cancelled',
          unit_price: enrollUnitPrice,
          charged_amount: 0,
          badge_label: 'Nghỉ / Hủy',
          dot_color: 'slate',
          note: sess.cancel_reason || 'Buổi nghỉ / hủy',
          lesson_note: lessonNote,
          enrollment_id: enroll.id,
        })
        continue
      }

      // Check if swapped away via session_guests
      const swapAway = sessionGuests.find(
        (g) =>
          g.student_id === student.id &&
          g.kind === 'swap' &&
          (g.home_session_key === key ||
            (g.home_class_id === enroll.class_id &&
              g.home_date === sess.date &&
              g.home_start_time === sess.start_time))
      )

      if (
        swapAway &&
        isSwapGuestEffective({
          guest: swapAway,
          attendance,
          scheduleRules,
          sessionExceptions,
          extraSessions,
          holidays,
        })
      ) {
        const hostCls = classes.find((c) => c.id === swapAway.host_class_id)
        items.push({
          id: `sess-swapped-${key}`,
          date: sess.date,
          weekday: dateToWeekday(sess.date),
          start_time: sess.start_time,
          end_time: sess.end_time,
          class_id: enroll.class_id,
          class_name: clsName,
          class_color: clsColor,
          billed_class_id: enroll.class_id,
          billed_class_name: clsName,
          session_kind: 'swapped_away',
          student_status_on_date: statusOnDate,
          attendance_status: 'swapped_away',
          unit_price: enrollUnitPrice,
          charged_amount: 0,
          badge_label: 'Đã học ghép',
          dot_color: 'purple',
          note: `Đã học ghép sang ${hostCls?.name || 'lớp khác'} ngày ${formatShortDdMm(swapAway.date)}`,
          lesson_note: lessonNote,
          guest_id: swapAway.id,
          enrollment_id: enroll.id,
        })
        continue
      }

      const attStatus: AttendanceStatus | 'unmarked' = att ? att.status : 'unmarked'
      const isTrial = statusOnDate === 'trial'
      const trialUnitPrice = Math.max(
        0,
        Math.round(student.trial_price ?? enrollUnitPrice)
      )
      const effectiveUnitPrice = isTrial ? trialUnitPrice : enrollUnitPrice
      const charged =
        attStatus === 'present' ? effectiveUnitPrice : 0

      let badgeLabel = 'Chưa điểm danh'
      let dotColor: StudentSessionDetailItem['dot_color'] = 'hollow'
      if (attStatus === 'present') {
        if (isTrial) {
          badgeLabel =
            trialUnitPrice === 0
              ? 'Học thử (0đ)'
              : `Học thử (${formatMoney(trialUnitPrice)})`
          dotColor = trialUnitPrice === 0 ? 'slate' : 'green'
        } else {
          badgeLabel = 'Có mặt'
          dotColor = 'green'
        }
      } else if (attStatus === 'absent') {
        badgeLabel = 'Vắng'
        dotColor = 'red'
      } else if (attStatus === 'excused') {
        badgeLabel = 'Vắng có phép'
        dotColor = 'amber'
      }

      const noteParts: string[] = []
      if (isTrial) {
        noteParts.push(
          trialUnitPrice === 0
            ? 'Học thử (miễn phí 0đ)'
            : `Học thử (${formatMoney(trialUnitPrice)}/buổi)`
        )
      }
      if (enroll.kind === 'extra') noteParts.push('Đăng ký học thêm dài hạn')
      if (swapAway) noteParts.push('Vắng ở lớp học ghép → hoàn về buổi gốc')
      if (lessonNote) noteParts.push(lessonNote)

      items.push({
        id: `sess-${key}`,
        date: sess.date,
        weekday: dateToWeekday(sess.date),
        start_time: sess.start_time,
        end_time: sess.end_time,
        class_id: enroll.class_id,
        class_name: clsName,
        class_color: clsColor,
        billed_class_id: enroll.class_id,
        billed_class_name: clsName,
        session_kind: enroll.kind === 'extra' ? 'extra_long_term' : 'primary',
        student_status_on_date: statusOnDate,
        attendance_status: attStatus,
        unit_price: effectiveUnitPrice,
        charged_amount: charged,
        badge_label: badgeLabel,
        dot_color: dotColor,
        note: noteParts.join(' · '),
        lesson_note: lessonNote,
        enrollment_id: enroll.id,
      })
    }
  }

  // 2. Process short-term Guest / Swap sessions (`session_guests`) in `monthStr` (Group D2 & D3)
  const guestRecords = sessionGuests.filter(
    (g) => g.student_id === student.id && g.date.startsWith(monthStr)
  )

  for (const guest of guestRecords) {
    const key = `${guest.host_class_id}|${guest.date}|${guest.start_time}`
    if (processedKeys.has(key)) continue
    processedKeys.add(key)

    const hostCls = classes.find((c) => c.id === guest.host_class_id)
    const homeCls = classes.find((c) => c.id === (guest.home_class_id || student.class_id))
    const billedCls =
      classes.find((c) => c.id === guest.billed_class_id) ||
      (guest.kind === 'swap' ? homeCls : hostCls) ||
      primaryCls

    const statusOnDate = resolveStudentStatusOnDate({
      student,
      dateStr: guest.date,
      studentStatusHistory,
    })

    // Determine unit price based on guest.billing_mode (Group D3)
    let guestUnitPrice = 0
    if (guest.billing_mode === 'free') {
      guestUnitPrice = 0
    } else if (statusOnDate === 'trial') {
      const basePrice =
        guest.billing_mode === 'custom'
          ? Math.max(0, Math.round(guest.custom_amount ?? 0))
          : guest.billing_mode === 'host_price'
          ? Math.max(0, Math.round(hostCls?.price ?? defaultUnitPrice))
          : Math.max(0, Math.round(student.custom_price ?? homeCls?.price ?? defaultUnitPrice))
      guestUnitPrice = Math.max(0, Math.round(student.trial_price ?? basePrice))
    } else if (guest.billing_mode === 'custom') {
      guestUnitPrice = Math.max(0, Math.round(guest.custom_amount ?? 0))
    } else if (guest.billing_mode === 'host_price') {
      guestUnitPrice = Math.max(0, Math.round(hostCls?.price ?? defaultUnitPrice))
    } else {
      // 'home_price' (default for swap)
      guestUnitPrice = Math.max(
        0,
        Math.round(student.custom_price ?? homeCls?.price ?? defaultUnitPrice)
      )
    }

    const att = attendance.find(
      (a) =>
        a.student_id === student.id &&
        a.class_id === guest.host_class_id &&
        a.date === guest.date &&
        a.start_time === guest.start_time
    )
    const attStatus: AttendanceStatus | 'unmarked' = att ? att.status : 'unmarked'
    const charged = attStatus === 'present' ? guestUnitPrice : 0
    const lessonNote = getLessonNote(guest.host_class_id, guest.date, guest.start_time)

    let homeInfo = ''
    if (guest.kind === 'swap') {
      const homeDateStr =
        guest.home_date || (guest.home_session_key ? guest.home_session_key.split('|')[1] : '')
      homeInfo = `Học ghép thay buổi ${homeDateStr ? formatShortDdMm(homeDateStr) + ' ' : ''}lớp ${homeCls?.name || 'gốc'}`
    } else {
      homeInfo = `Học thêm buổi lẻ tại lớp ${hostCls?.name || ''}${guest.billing_mode === 'free' ? ' (Miễn phí)' : ''}`
    }
    if (guest.note) homeInfo += ` · ${guest.note}`
    if (lessonNote) homeInfo += ` · ${lessonNote}`

    items.push({
      id: `sess-guest-${guest.id}`,
      date: guest.date,
      weekday: dateToWeekday(guest.date),
      start_time: guest.start_time,
      end_time: '19:00',
      class_id: guest.host_class_id,
      class_name: hostCls?.name || 'Lớp học ghép',
      class_color: hostCls?.color || '#7C3AED',
      billed_class_id: billedCls?.id || guest.host_class_id,
      billed_class_name: billedCls?.name || hostCls?.name || 'Lớp học',
      session_kind: guest.kind === 'swap' ? 'guest_swap' : 'guest_extra',
      student_status_on_date: statusOnDate,
      attendance_status: attStatus,
      unit_price: guestUnitPrice,
      charged_amount: charged,
      badge_label:
        attStatus === 'present'
          ? guest.kind === 'swap'
            ? 'Học ghép (Có mặt)'
            : 'Học thêm (Có mặt)'
          : attStatus === 'absent'
          ? 'Học ghép (Vắng)'
          : attStatus === 'excused'
          ? 'Học ghép (Có phép)'
          : 'Học ghép (Chưa ĐD)',
      dot_color: attStatus === 'present' ? 'purple' : attStatus === 'absent' ? 'red' : 'hollow',
      note: homeInfo,
      lesson_note: lessonNote,
      guest_id: guest.id,
    })
  }

  // 3. Rule E1 Safe Exception: Any existing attendance record in `monthStr` outside `[from_date, to_date]` is NEVER hidden!
  const remainingAtts = attendance.filter(
    (a) =>
      a.student_id === student.id &&
      a.date.startsWith(monthStr) &&
      !processedKeys.has(`${a.class_id}|${a.date}|${a.start_time}`)
  )

  for (const att of remainingAtts) {
    const key = `${att.class_id}|${att.date}|${att.start_time}`
    processedKeys.add(key)
    const cls = classes.find((c) => c.id === att.class_id)
    const statusOnDate = resolveStudentStatusOnDate({
      student,
      dateStr: att.date,
      studentStatusHistory,
    })
    const isTrial = statusOnDate === 'trial'
    const regularPrice = Math.max(
      0,
      Math.round(student.custom_price ?? cls?.price ?? defaultUnitPrice)
    )
    const unitPrice = isTrial
      ? Math.max(0, Math.round(student.trial_price ?? regularPrice))
      : regularPrice
    const charged = att.status === 'present' ? unitPrice : 0
    const lessonNote = getLessonNote(att.class_id, att.date, att.start_time)

    items.push({
      id: `sess-out-${att.id}`,
      date: att.date,
      weekday: dateToWeekday(att.date),
      start_time: att.start_time,
      end_time: '19:00',
      class_id: att.class_id,
      class_name: cls?.name || 'Lớp học',
      class_color: cls?.color || '#2563EB',
      billed_class_id: att.class_id,
      billed_class_name: cls?.name || 'Lớp học',
      session_kind: 'out_of_window',
      student_status_on_date: statusOnDate,
      attendance_status: att.status,
      unit_price: unitPrice,
      charged_amount: charged,
      badge_label:
        att.status === 'present'
          ? isTrial
            ? unitPrice === 0
              ? 'Học thử (0đ)'
              : `Học thử (${formatMoney(unitPrice)})`
            : 'Có mặt'
          : att.status === 'absent'
          ? 'Vắng'
          : 'Vắng có phép',
      dot_color:
        att.status === 'present'
          ? isTrial && unitPrice === 0
            ? 'slate'
            : 'green'
          : att.status === 'absent'
          ? 'red'
          : 'amber',
      note: `Ngoài thời gian đăng ký${lessonNote ? ' · ' + lessonNote : ''}`,
      lesson_note: lessonNote,
      out_of_enrollment_window: true,
    })
  }

  // Sort chronologically
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  })

  // Annotate mid-month primary class transfer banner (Group E3 & E4)
  let lastPrimaryClassId: string | null = null
  for (const item of items) {
    if (item.session_kind === 'primary') {
      if (lastPrimaryClassId && item.class_id !== lastPrimaryClassId) {
        const matchingEnroll = enrolls.find(
          (e) => e.kind === 'primary' && e.class_id === item.class_id && e.from_date <= item.date
        )
        const transferDate = matchingEnroll?.from_date || item.date
        item.transfer_banner_before = `Chuyển sang lớp ${item.class_name} từ ${formatFullDdMmYyyy(transferDate)}`
      }
      lastPrimaryClassId = item.class_id
    }
  }

  // Aggregate counts & class breakdowns
  let presentCount = 0
  let absentCount = 0
  let excusedCount = 0
  let trialCount = 0
  let guestCount = 0
  let unmarkedCount = 0
  let totalDue = 0

  const trialDates: string[] = []
  const breakdownMap = new Map<string, StudentClassFeeBreakdown>()

  for (const item of items) {
    if (
      item.session_kind === 'cancelled_or_holiday' ||
      item.session_kind === 'swapped_away'
    ) {
      continue
    }

    const bClsId = item.billed_class_id
    if (!breakdownMap.has(bClsId)) {
      const bCls = classes.find((c) => c.id === bClsId)
      const matchingEnroll = enrolls.find((e) => e.class_id === bClsId)
      breakdownMap.set(bClsId, {
        class_id: bClsId,
        class_name: bCls?.name || item.billed_class_name,
        class_color: bCls?.color || item.class_color,
        kind:
          matchingEnroll?.kind === 'extra'
            ? 'extra'
            : matchingEnroll?.kind === 'primary'
            ? 'primary'
            : 'guest',
        present_count: 0,
        trial_count: 0,
        absent_count: 0,
        excused_count: 0,
        guest_count: 0,
        unmarked_count: 0,
        price_per_session: item.unit_price || defaultUnitPrice,
        due_amount: 0,
        from_date: matchingEnroll?.from_date,
        to_date: matchingEnroll?.to_date,
      })
    }
    const bEntry = breakdownMap.get(bClsId)!

    if (item.session_kind === 'guest_swap' || item.session_kind === 'guest_extra') {
      guestCount++
      bEntry.guest_count++
    }

    if (item.attendance_status === 'present') {
      if (item.student_status_on_date === 'trial') {
        trialCount++
        bEntry.trial_count++
        trialDates.push(item.date)
        totalDue += item.charged_amount
        bEntry.due_amount += item.charged_amount
        if (item.charged_amount > 0) {
          presentCount++
          bEntry.present_count++
        }
        if (item.unit_price > 0) {
          bEntry.price_per_session = item.unit_price
        }
      } else {
        presentCount++
        bEntry.present_count++
        totalDue += item.charged_amount
        bEntry.due_amount += item.charged_amount
        if (item.unit_price > 0) {
          bEntry.price_per_session = item.unit_price
        }
      }
    } else if (item.attendance_status === 'absent') {
      absentCount++
      bEntry.absent_count++
    } else if (item.attendance_status === 'excused') {
      excusedCount++
      bEntry.excused_count++
    } else if (item.attendance_status === 'unmarked') {
      unmarkedCount++
      bEntry.unmarked_count++
    }
  }

  // Package payment proration support (Group A2)
  if (
    student.payment_type === 'package' &&
    student.package_total_sessions &&
    student.package_total_sessions > 0 &&
    presentCount > 0
  ) {
    // Keep per-session active billing consistent with package unit price
  }

  // Build human-readable status / transfer note (Group A2 & E3)
  const noteSegments: string[] = []
  if (trialDates.length > 0) {
    const firstTrial = formatShortDdMm(trialDates[0])
    const lastTrial = formatShortDdMm(trialDates[trialDates.length - 1])
    const trialRange =
      trialDates.length === 1 || firstTrial === lastTrial
        ? firstTrial
        : `${firstTrial}–${lastTrial}`
    const effTrialPrice = Math.max(
      0,
      Math.round(student.trial_price ?? defaultUnitPrice)
    )
    const trialFeeDesc =
      effTrialPrice === 0
        ? `${trialCount} buổi miễn phí`
        : `${trialCount} buổi × ${formatMoney(effTrialPrice)}`

    // Check if student converted to active in this month
    const activeRow = studentStatusHistory
      .filter((h) => h.student_id === student.id && h.status === 'active')
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]

    if (activeRow && activeRow.effective_from.startsWith(monthStr)) {
      noteSegments.push(
        `Học thử ${trialRange} (${trialFeeDesc}), chính thức từ ${formatShortDdMm(activeRow.effective_from)}`
      )
    } else {
      noteSegments.push(`Học thử ${trialRange} (${trialFeeDesc})`)
    }
  }

  // Check if mid-month class transfer occurred in this month
  const primaryEnrollsInMonth = enrolls.filter(
    (e) =>
      e.kind === 'primary' &&
      e.from_date <= `${monthStr}-31` &&
      (!e.to_date || e.to_date >= `${monthStr}-01`)
  )
  if (primaryEnrollsInMonth.length > 1) {
    const names = primaryEnrollsInMonth.map((e) => {
      const c = classes.find((cl) => cl.id === e.class_id)
      return `${c?.name || e.class_id} (từ ${formatShortDdMm(e.from_date)})`
    })
    noteSegments.push(`Chuyển lớp: ${names.join(' → ')}`)
  }

  if (guestCount > 0) {
    noteSegments.push(`${guestCount} buổi học ghép/học thêm`)
  }

  return {
    items,
    present_count: presentCount,
    absent_count: absentCount,
    excused_count: excusedCount,
    trial_count: trialCount,
    guest_count: guestCount,
    unmarked_count: unmarkedCount,
    due_amount: totalDue,
    price_per_session: defaultUnitPrice,
    status_note: noteSegments.length > 0 ? noteSegments.join(' · ') : null,
    class_breakdowns: Array.from(breakdownMap.values()),
  }
}

/**
 * Compute raw monthly attendance & fee due for a single student in a given month.
 * Respects `monthLocks` if the month has been locked ("Chốt tháng") for that class,
 * and evaluates per-session status (`trial | active | left`) on each session's date (Group A2).
 */
export function computeStudentMonthRawDue({
  student,
  cls,
  monthStr,
  sessions,
  attendance,
  monthLocks,
  classes,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays,
  studentEnrollments,
  studentStatusHistory,
  sessionGuests,
  sessionNotes,
}: {
  student: Student
  cls: Class | undefined
  monthStr: string
  sessions: { date: string; start_time: string }[]
  attendance: Attendance[]
  monthLocks: MonthLock[]
  classes?: Class[]
  scheduleRules?: ScheduleRule[]
  sessionExceptions?: SessionException[]
  extraSessions?: ExtraSession[]
  holidays?: Holiday[]
  studentEnrollments?: StudentEnrollment[]
  studentStatusHistory?: StudentStatusHistory[]
  sessionGuests?: SessionGuest[]
  sessionNotes?: SessionNote[]
}): MonthLockStudentSnapshot & {
  is_locked: boolean
  unmarked_count: number
  status_note: string | null
  class_breakdowns: StudentClassFeeBreakdown[]
  session_details: StudentSessionDetailItem[]
} {
  const lock = monthLocks.find(
    (l) => l.class_id === student.class_id && l.month === monthStr
  )

  const detailed =
    classes && scheduleRules && sessionExceptions && extraSessions
      ? computeStudentMonthSessionDetails({
          student,
          monthStr,
          classes,
          scheduleRules,
          sessionExceptions,
          extraSessions,
          holidays: holidays || [],
          attendance,
          studentEnrollments: studentEnrollments || [],
          studentStatusHistory: studentStatusHistory || [],
          sessionGuests: sessionGuests || [],
          sessionNotes: sessionNotes || [],
        })
      : null

  if (lock && lock.snapshot && lock.snapshot[student.id]) {
    const snap = lock.snapshot[student.id]
    return {
      present_count: Math.round(snap.present_count || 0),
      absent_count: Math.round(snap.absent_count || 0),
      excused_count: Math.round(snap.excused_count || 0),
      trial_count: Math.round(snap.trial_count ?? detailed?.trial_count ?? 0),
      guest_count: Math.round(snap.guest_count ?? detailed?.guest_count ?? 0),
      unmarked_count: detailed?.unmarked_count ?? 0,
      status_note: detailed?.status_note ?? null,
      class_breakdowns: detailed?.class_breakdowns ?? [],
      session_details: detailed?.items ?? [],
      price_per_session: Math.round(snap.price_per_session || 0),
      due_amount: Math.round(snap.due_amount || 0),
      is_locked: true,
    }
  }

  if (detailed) {
    return {
      present_count: detailed.present_count,
      absent_count: detailed.absent_count,
      excused_count: detailed.excused_count,
      trial_count: detailed.trial_count,
      guest_count: detailed.guest_count,
      unmarked_count: detailed.unmarked_count,
      status_note: detailed.status_note,
      class_breakdowns: detailed.class_breakdowns,
      session_details: detailed.items,
      price_per_session: detailed.price_per_session,
      due_amount: detailed.due_amount,
      is_locked: Boolean(lock),
    }
  }

  // Fallback when full store arrays are not provided
  let presentCount = 0
  let absentCount = 0
  let excusedCount = 0
  let trialCount = 0

  for (const session of sessions) {
    const statusOnDate = resolveStudentStatusOnDate({
      student,
      dateStr: session.date,
      studentStatusHistory: studentStatusHistory || [],
    })
    if (statusOnDate === 'left') continue

    const att = attendance.find(
      (a) =>
        a.student_id === student.id &&
        a.class_id === student.class_id &&
        a.date === session.date &&
        a.start_time === session.start_time
    )
    if (att?.status === 'present') {
      if (statusOnDate === 'trial') trialCount++
      else presentCount++
    } else if (att?.status === 'absent') {
      absentCount++
    } else if (att?.status === 'excused') {
      excusedCount++
    }
  }

  const rawPrice = student.custom_price ?? cls?.price ?? 0
  const price = Math.max(0, Math.round(rawPrice))
  const due = presentCount * price

  return {
    present_count: presentCount,
    absent_count: absentCount,
    excused_count: excusedCount,
    trial_count: trialCount,
    guest_count: 0,
    unmarked_count: 0,
    status_note: trialCount > 0 ? `Học thử ${trialCount} buổi (miễn phí)` : null,
    class_breakdowns: [],
    session_details: [],
    price_per_session: price,
    due_amount: due,
    is_locked: Boolean(lock),
  }
}

/**
 * Generate a snapshot of all students in a class for locking a month ("Chốt tháng")
 */
export function buildClassMonthLockSnapshot({
  classId,
  monthStr,
  classes,
  students,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays,
  attendance,
  studentEnrollments = [],
  studentStatusHistory = [],
  sessionGuests = [],
}: {
  classId: string
  monthStr: string
  classes: Class[]
  students: Student[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays: Holiday[]
  attendance: Attendance[]
  studentEnrollments?: StudentEnrollment[]
  studentStatusHistory?: StudentStatusHistory[]
  sessionGuests?: SessionGuest[]
}): Record<string, MonthLockStudentSnapshot> {
  const cls = classes.find((c) => c.id === classId)
  const classStudents = students.filter(
    (s) =>
      s.class_id === classId ||
      studentEnrollments.some((e) => e.student_id === s.id && e.class_id === classId)
  )
  const sessions = getClassSessionsForMonth({
    classId,
    monthStr,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
  })

  const snapshot: Record<string, MonthLockStudentSnapshot> = {}
  for (const student of classStudents) {
    const raw = computeStudentMonthRawDue({
      student,
      cls,
      monthStr,
      sessions,
      attendance,
      monthLocks: [],
      classes,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
    })
    snapshot[student.id] = {
      present_count: raw.present_count,
      absent_count: raw.absent_count,
      excused_count: raw.excused_count,
      trial_count: raw.trial_count,
      guest_count: raw.guest_count,
      price_per_session: raw.price_per_session,
      due_amount: raw.due_amount,
    }
  }
  return snapshot
}

/**
 * Core Unified Debt & FIFO Allocation Engine for a student across all months
 */
export function computeStudentDebtProfile({
  student,
  classes,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays = [],
  attendance,
  paymentTransactions,
  monthLocks = [],
  studentEnrollments = [],
  studentStatusHistory = [],
  sessionGuests = [],
  sessionNotes = [],
  targetMonth,
}: {
  student: Student
  classes: Class[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays?: Holiday[]
  attendance: Attendance[]
  paymentTransactions: PaymentTransaction[]
  monthLocks?: MonthLock[]
  studentEnrollments?: StudentEnrollment[]
  studentStatusHistory?: StudentStatusHistory[]
  sessionGuests?: SessionGuest[]
  sessionNotes?: SessionNote[]
  targetMonth?: string
}): StudentDebtProfile {
  const cls = classes.find((c) => c.id === student.class_id)
  const currentMonth = getCurrentMonth()

  // Collect all candidate months for this student
  const monthSet = new Set<string>([currentMonth])
  if (targetMonth) monthSet.add(targetMonth)

  attendance
    .filter((a) => a.student_id === student.id)
    .forEach((a) => monthSet.add(a.date.slice(0, 7)))

  sessionGuests
    .filter((g) => g.student_id === student.id)
    .forEach((g) => monthSet.add(g.date.slice(0, 7)))

  monthLocks
    .filter((l) => l.class_id === student.class_id)
    .forEach((l) => monthSet.add(l.month))

  const studentTxs = paymentTransactions
    .filter((t) => t.student_id === student.id)
    .map((t) => ({
      ...t,
      amount: Math.round(t.amount || 0),
      txMonth: (t.paid_at || t.created_at || currentMonth).slice(0, 7),
      txDate: (t.paid_at || t.created_at || `${currentMonth}-01`).slice(0, 10),
    }))
    .sort((a, b) => {
      const dCmp = a.txDate.localeCompare(b.txDate)
      if (dCmp !== 0) return dCmp
      return (a.created_at || '').localeCompare(b.created_at || '')
    })

  studentTxs.forEach((t) => monthSet.add(t.txMonth))

  // Fill any intermediate months between minMonth and maxMonth so cumulative ledger is continuous
  const sortedDistinctMonths = Array.from(monthSet).sort()
  const minMonth = sortedDistinctMonths[0] || currentMonth
  const maxMonth =
    sortedDistinctMonths[sortedDistinctMonths.length - 1] > currentMonth
      ? sortedDistinctMonths[sortedDistinctMonths.length - 1]
      : currentMonth

  const allMonths: string[] = []
  const [minY, minM] = minMonth.split('-').map(Number)
  const [maxY, maxM] = maxMonth.split('-').map(Number)
  let y = minY
  let m = minM
  while (y < maxY || (y === maxY && m <= maxM)) {
    allMonths.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  // Precompute raw due per month
  const rawByMonth = allMonths.map((mStr) => {
    const sessions = getClassSessionsForMonth({
      classId: student.class_id,
      monthStr: mStr,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
    const raw = computeStudentMonthRawDue({
      student,
      cls,
      monthStr: mStr,
      sessions,
      attendance,
      monthLocks,
      classes,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
      sessionNotes,
    })
    const paidInMonth = studentTxs
      .filter((t) => t.txMonth === mStr)
      .reduce((sum, t) => sum + t.amount, 0)

    return {
      month: mStr,
      ...raw,
      paid_in_month: paidInMonth,
    }
  })

  // Total paid across all transactions (FIFO pool)
  const totalPaidAll = studentTxs.reduce((sum, t) => sum + t.amount, 0)
  let remainingFifoPool = totalPaidAll

  let runningDue = 0
  let runningPaid = 0

  const monthsRecord: Record<string, StudentMonthSummary> = {}
  const orderedMonths: StudentMonthSummary[] = []
  const unpaidMonths: {
    month: string
    due: number
    allocated: number
    shortage: number
  }[] = []

  for (const item of rawByMonth) {
    const due = item.due_amount
    const allocated = Math.min(due, Math.max(0, remainingFifoPool))
    remainingFifoPool = Math.max(0, remainingFifoPool - allocated)
    const shortage = Math.max(0, due - allocated)

    runningDue += due
    runningPaid += item.paid_in_month
    const cumulativeBalance = runningPaid - runningDue

    let status: MonthFeeStatus = 'Đủ'
    if (due === 0 && cumulativeBalance <= 0) {
      status = 'Đủ'
    } else if (cumulativeBalance > 0 && shortage === 0) {
      status = 'Đóng dư'
    } else if (shortage === 0) {
      status = 'Đủ'
    } else if (allocated > 0) {
      status = 'Còn thiếu'
    } else {
      status = 'Chưa đóng'
    }

    if (shortage > 0) {
      unpaidMonths.push({
        month: item.month,
        due,
        allocated,
        shortage,
      })
    }

    const summary: StudentMonthSummary = {
      month: item.month,
      present_count: item.present_count,
      absent_count: item.absent_count,
      excused_count: item.excused_count,
      trial_count: item.trial_count || 0,
      guest_count: item.guest_count || 0,
      unmarked_count: item.unmarked_count || 0,
      status_note: item.status_note,
      class_breakdowns: item.class_breakdowns || [],
      session_details: item.session_details || [],
      price_per_session: item.price_per_session,
      due_amount: due,
      allocated_paid: allocated,
      shortage,
      paid_in_month: item.paid_in_month,
      cumulative_due: runningDue,
      cumulative_paid: runningPaid,
      cumulative_balance: cumulativeBalance,
      status,
      is_locked: item.is_locked,
    }

    monthsRecord[item.month] = summary
    orderedMonths.push(summary)
  }

  // Build chronological ledger ("Sổ học phí") with running balance after each line
  const rawEvents: {
    id: string
    date: string
    month: string
    sortOrder: number
    type: 'charge' | 'payment'
    title: string
    subtitle: string
    debit: number
    credit: number
    transaction?: PaymentTransaction
    is_locked?: boolean
  }[] = []

  for (const summary of orderedMonths) {
    if (
      summary.due_amount > 0 ||
      summary.present_count > 0 ||
      summary.trial_count > 0 ||
      summary.is_locked
    ) {
      const trialExtra =
        summary.trial_count > 0 ? ` · ${summary.trial_count} buổi học thử (0đ)` : ''
      rawEvents.push({
        id: `charge-${student.id}-${summary.month}`,
        date: `${summary.month}-01`,
        month: summary.month,
        sortOrder: 1,
        type: 'charge',
        title: `Học phí ${formatMonth(summary.month)}${summary.is_locked ? ' (Đã chốt)' : ''}`,
        subtitle: `${summary.present_count} buổi tính phí × ${formatMoney(summary.price_per_session)}${trialExtra}`,
        debit: summary.due_amount,
        credit: 0,
        is_locked: summary.is_locked,
      })
    }
  }

  for (const tx of studentTxs) {
    const methodLabel =
      tx.method === 'transfer'
        ? 'Chuyển khoản'
        : tx.method === 'cash'
        ? 'Tiền mặt'
        : 'Khác'
    rawEvents.push({
      id: `tx-${tx.id}`,
      date: tx.txDate,
      month: tx.txMonth,
      sortOrder: 2,
      type: 'payment',
      title: `Thu học phí (${methodLabel})`,
      subtitle: tx.note || (tx.group_id ? 'Gộp thu anh/chị/em cùng PH' : 'Khoản thu học phí'),
      debit: 0,
      credit: tx.amount,
      transaction: tx,
    })
  }

  rawEvents.sort((a, b) => {
    const mCmp = a.month.localeCompare(b.month)
    if (mCmp !== 0) return mCmp
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.date.localeCompare(b.date)
  })

  let ledgerRunningBalance = 0
  const ledgerEntries: StudentLedgerEntry[] = rawEvents.map((ev) => {
    ledgerRunningBalance = ledgerRunningBalance - ev.debit + ev.credit
    return {
      id: ev.id,
      date: ev.date,
      month: ev.month,
      type: ev.type,
      title: ev.title,
      subtitle: ev.subtitle,
      debit: ev.debit,
      credit: ev.credit,
      balance_after: ledgerRunningBalance,
      transaction: ev.transaction,
      is_locked: ev.is_locked,
    }
  })

  const totalDueAll = orderedMonths.reduce((s, m) => s + m.due_amount, 0)
  const balance = totalPaidAll - totalDueAll
  const debtAmount = Math.max(0, totalDueAll - totalPaidAll)
  const creditAmount = Math.max(0, totalPaidAll - totalDueAll)

  return {
    student,
    cls,
    months: monthsRecord,
    orderedMonths,
    ledgerEntries,
    total_due: totalDueAll,
    total_paid: totalPaidAll,
    balance,
    debt_amount: debtAmount,
    credit_amount: creditAmount,
    unpaid_months: unpaidMonths,
    oldest_unpaid_month: unpaidMonths[0]?.month || null,
    unpaid_months_count: unpaidMonths.length,
  }
}

/**
 * Compute all StudentDebtProfiles across all students (including students who have left if they still owe!)
 */
export function computeAllStudentDebtProfiles({
  classes,
  students,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays = [],
  attendance,
  paymentTransactions,
  monthLocks = [],
  studentEnrollments = [],
  studentStatusHistory = [],
  sessionGuests = [],
  sessionNotes = [],
  targetMonth,
}: {
  classes: Class[]
  students: Student[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays?: Holiday[]
  attendance: Attendance[]
  paymentTransactions: PaymentTransaction[]
  monthLocks?: MonthLock[]
  studentEnrollments?: StudentEnrollment[]
  studentStatusHistory?: StudentStatusHistory[]
  sessionGuests?: SessionGuest[]
  sessionNotes?: SessionNote[]
  targetMonth?: string
}): Map<string, StudentDebtProfile> {
  const map = new Map<string, StudentDebtProfile>()
  for (const student of students) {
    const profile = computeStudentDebtProfile({
      student,
      classes,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
      attendance,
      paymentTransactions,
      monthLocks,
      studentEnrollments,
      studentStatusHistory,
      sessionGuests,
      sessionNotes,
      targetMonth,
    })
    map.set(student.id, profile)
  }
  return map
}

/**
 * Convert a StudentDebtProfile + targetMonth into a FeeRow for the Monthly Fee Table (Section 2.9 & Groups A, D, E)
 */
export function buildFeeRowFromProfile(
  profile: StudentDebtProfile,
  monthStr: string
): FeeRow {
  const mSummary = profile.months[monthStr] || {
    month: monthStr,
    present_count: 0,
    absent_count: 0,
    excused_count: 0,
    trial_count: 0,
    guest_count: 0,
    unmarked_count: 0,
    status_note: null,
    class_breakdowns: [],
    session_details: [],
    price_per_session: profile.student.custom_price ?? profile.cls?.price ?? 0,
    due_amount: 0,
    allocated_paid: 0,
    shortage: 0,
    paid_in_month: 0,
    cumulative_due: profile.total_due,
    cumulative_paid: profile.total_paid,
    cumulative_balance: profile.balance,
    status: profile.balance > 0 ? 'Đóng dư' : 'Đủ',
    is_locked: false,
  }

  return {
    student: profile.student,
    class_id: profile.cls?.id,
    class_name: profile.cls?.name,
    class_color: profile.cls?.color,
    present_count: mSummary.present_count,
    absent_count: mSummary.absent_count,
    excused_count: mSummary.excused_count,
    trial_count: mSummary.trial_count,
    guest_count: mSummary.guest_count,
    unmarked_count: mSummary.unmarked_count,
    status_note: mSummary.status_note,
    class_breakdowns: mSummary.class_breakdowns,
    price_per_session: mSummary.price_per_session,
    total: mSummary.due_amount,
    paid_amount: mSummary.allocated_paid,
    remaining_amount: mSummary.shortage,
    cumulative_balance: mSummary.cumulative_balance,
    status: mSummary.status,
    is_locked: mSummary.is_locked,
    paid: mSummary.status === 'Đủ' || mSummary.status === 'Đóng dư',
    paid_at: null,
  }
}

/**
 * Group A3: Preview the impact of changing a student's status (`trial` ↔ `active` / `left`)
 * from `effectiveFrom` (YYYY-MM-DD).
 */
export function previewStatusChangeImpact({
  student,
  newStatus,
  effectiveFrom,
  trialPriceOverride,
  targetMonth,
  classes,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays,
  attendance,
  studentEnrollments,
  studentStatusHistory,
  sessionGuests,
  monthLocks,
}: {
  student: Student
  newStatus: StudentStatus
  effectiveFrom: string
  trialPriceOverride?: number | null
  targetMonth?: string
  classes: Class[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays: Holiday[]
  attendance: Attendance[]
  studentEnrollments: StudentEnrollment[]
  studentStatusHistory: StudentStatusHistory[]
  sessionGuests: SessionGuest[]
  monthLocks: MonthLock[]
}): {
  monthStr: string
  trial_count: number
  billable_count: number
  estimated_due: number
  unit_price: number
  trial_unit_price: number
  retroactive_sessions: { date: string; start_time: string; class_name: string }[]
  locked_months_affected: MonthLock[]
} {
  const monthStr = targetMonth || effectiveFrom.slice(0, 7)
  const todayStr = new Date().toISOString().slice(0, 10)

  const simulatedHistory: StudentStatusHistory[] = [
    ...studentStatusHistory.filter(
      (h) => !(h.student_id === student.id && h.effective_from === effectiveFrom)
    ),
    {
      id: 'sim-status',
      student_id: student.id,
      status: newStatus,
      effective_from: effectiveFrom,
      note: 'Xem trước',
      created_at: new Date().toISOString(),
      user_id: 'local',
    },
  ]

  const beforeDetails = computeStudentMonthSessionDetails({
    student,
    monthStr,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
  })

  const nextTrialPrice =
    trialPriceOverride !== undefined ? trialPriceOverride : student.trial_price
  const afterDetails = computeStudentMonthSessionDetails({
    student: { ...student, status: newStatus, trial_price: nextTrialPrice },
    monthStr,
    classes,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    holidays,
    attendance,
    studentEnrollments,
    studentStatusHistory: simulatedHistory,
    sessionGuests,
  })

  // Find retroactive sessions that flip from 0đ to charged (or vice versa) when effectiveFrom < todayStr
  const retroactiveSessions: { date: string; start_time: string; class_name: string }[] = []
  if (effectiveFrom <= todayStr) {
    for (const afterItem of afterDetails.items) {
      if (afterItem.date >= effectiveFrom && afterItem.date <= todayStr) {
        const beforeItem = beforeDetails.items.find((b) => b.id === afterItem.id)
        if (beforeItem && beforeItem.charged_amount !== afterItem.charged_amount) {
          retroactiveSessions.push({
            date: afterItem.date,
            start_time: afterItem.start_time,
            class_name: afterItem.class_name,
          })
        }
      }
    }
  }

  const affectedMonth = effectiveFrom.slice(0, 7)
  const lockedMonthsAffected = monthLocks.filter(
    (l) => l.class_id === student.class_id && l.month >= affectedMonth
  )

  return {
    monthStr,
    trial_count: afterDetails.trial_count,
    billable_count: afterDetails.present_count,
    estimated_due: afterDetails.due_amount,
    unit_price: afterDetails.price_per_session,
    trial_unit_price: Math.max(
      0,
      Math.round(nextTrialPrice ?? afterDetails.price_per_session)
    ),
    retroactive_sessions: retroactiveSessions,
    locked_months_affected: lockedMonthsAffected,
  }
}

/**
 * Group A4: Find trial students in a class who have attended >= defaultTrialSessions
 */
export function getTrialReminderStudents({
  classId,
  students,
  attendance,
  studentStatusHistory,
  defaultTrialSessions = 2,
}: {
  classId: string
  students: Student[]
  attendance: Attendance[]
  studentStatusHistory: StudentStatusHistory[]
  defaultTrialSessions?: number
}): { student: Student; attendedTrialCount: number }[] {
  const todayStr = new Date().toISOString().slice(0, 10)
  const classStudents = students.filter((s) => s.class_id === classId)
  const reminders: { student: Student; attendedTrialCount: number }[] = []

  for (const st of classStudents) {
    const curStatus = getStudentCurrentStatus(st, studentStatusHistory, todayStr)
    if (curStatus !== 'trial') continue

    const attendedTrialCount = attendance.filter(
      (a) => a.student_id === st.id && a.status === 'present'
    ).length

    if (attendedTrialCount >= defaultTrialSessions) {
      reminders.push({ student: st, attendedTrialCount })
    }
  }

  return reminders
}

/**
 * Group E2: Get past sessions between `fromDate` and `todayStr` when adding/editing a student with a past start date
 */
export function getPastSessionsForNewStartDate({
  classId,
  fromDate,
  todayStr = new Date().toISOString().slice(0, 10),
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays,
}: {
  classId: string
  fromDate: string
  todayStr?: string
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays: Holiday[]
}): { date: string; start_time: string; end_time: string }[] {
  if (!fromDate || fromDate >= todayStr) return []

  const minMonth = fromDate.slice(0, 7)
  const maxMonth = todayStr.slice(0, 7)
  const [minY, minM] = minMonth.split('-').map(Number)
  const [maxY, maxM] = maxMonth.split('-').map(Number)
  const months: string[] = []
  let y = minY
  let m = minM
  while (y < maxY || (y === maxY && m <= maxM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  const results: { date: string; start_time: string; end_time: string }[] = []
  for (const mStr of months) {
    const mSessions = getClassSessionsForMonth({
      classId,
      monthStr: mStr,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
    for (const s of mSessions) {
      if (s.date >= fromDate && s.date <= todayStr) {
        results.push({ date: s.date, start_time: s.start_time, end_time: s.end_time })
      }
    }
  }
  return results
}

/**
 * Find sibling students belonging to the same parent (by phone number or exact parent name)
 */
export function findSiblingStudents(student: Student, allStudents: Student[]): Student[] {
  const cleanPhone = (student.parent_phone || '').replace(/\D+/g, '')
  const cleanParentName = (student.parent_name || '').trim().toLowerCase()

  return allStudents.filter((other) => {
    if (other.id === student.id) return true
    if (cleanPhone.length >= 8) {
      const otherPhone = (other.parent_phone || '').replace(/\D+/g, '')
      if (otherPhone === cleanPhone) return true
    }
    if (cleanParentName.length >= 3) {
      const otherParent = (other.parent_name || '').trim().toLowerCase()
      if (otherParent === cleanParentName) return true
    }
    return false
  })
}

/**
 * Generate Zalo / SMS fee reminder message using actual multi-month debt data & per-session trial/guest details.
 * Supports 2 templates: 'gentle' (Nhắc nhẹ) and 'second' (Nhắc lần 2).
 */
export function generateDebtReminderMessage({
  profile,
  selectedMonth,
  template = 'gentle',
  includeSessionBreakdown = false,
}: {
  profile: StudentDebtProfile
  selectedMonth: string
  template?: 'gentle' | 'second'
  includeSessionBreakdown?: boolean
}): string {
  const { student, cls, unpaid_months, debt_amount } = profile
  const className = cls?.name || 'Lớp dạy thêm'
  const mSummary = profile.months[selectedMonth]

  const lines: string[] = []
  if (unpaid_months.length > 0) {
    for (const um of unpaid_months) {
      const mInfo = profile.months[um.month]
      const trialPart =
        mInfo && mInfo.trial_count > 0 ? `, ${mInfo.trial_count} buổi học thử miễn phí` : ''
      const sessionsNote = mInfo ? ` (${mInfo.present_count} buổi tính phí${trialPart})` : ''
      if (um.allocated > 0) {
        lines.push(
          `- ${formatMonth(um.month)}${sessionsNote}: Phải thu ${formatMoney(um.due)}, đã đóng ${formatMoney(um.allocated)} → Còn thiếu ${formatMoney(um.shortage)}`
        )
      } else {
        lines.push(
          `- ${formatMonth(um.month)}${sessionsNote}: ${formatMoney(um.shortage)}`
        )
      }
    }
  } else if (mSummary) {
    const trialPart =
      mSummary.trial_count > 0 ? `, ${mSummary.trial_count} buổi học thử 0đ` : ''
    lines.push(
      `- ${formatMonth(selectedMonth)} (${mSummary.present_count} buổi tính phí × ${formatMoney(mSummary.price_per_session)}${trialPart}): ${formatMoney(mSummary.due_amount)} [Đã hoàn tất]`
    )
  }

  let breakdownText = ''
  if (includeSessionBreakdown && mSummary && mSummary.session_details.length > 0) {
    const sessionLines = mSummary.session_details
      .filter((s) => s.session_kind !== 'cancelled_or_holiday')
      .map(
        (s) =>
          `  • ${formatShortDdMm(s.date)} (${s.class_name}): ${s.badge_label} — ${formatMoney(s.charged_amount)}${s.note ? ` (${s.note})` : ''}`
      )
    if (sessionLines.length > 0) {
      breakdownText = `\nChi tiết từng buổi ${formatMonth(selectedMonth)}:\n${sessionLines.join('\n')}\n`
    }
  }

  const totalNeedToPay = debt_amount > 0 ? debt_amount : mSummary?.shortage || 0

  if (template === 'second') {
    return `Kính gửi quý phụ huynh em ${student.name} (${className}),
Đây là thông báo nhắc học phí lần 2. Hiện tại học phí của em còn các khoản chưa hoàn tất như sau:
${lines.join('\n')}${breakdownText}
👉 TỔNG SỐ TIỀN CẦN ĐÓNG: ${formatMoney(totalNeedToPay)}
(Ghi chú: Chỉ tính các buổi học sinh có mặt trong giai đoạn chính thức; buổi học thử và buổi vắng không tính phí).

Do đã qua đợt thu định kỳ, kính mong quý phụ huynh thu xếp hoàn tất chuyển khoản sớm giúp giáo viên. Nếu phụ huynh đã chuyển khoản, xin vui lòng gửi lại ảnh biên lai để đối chiếu.
Trân trọng cảm ơn quý phụ huynh!`
  }

  return `Kính gửi quý phụ huynh em ${student.name},
Xin gửi bảng tổng hợp học phí thực tế của em tại lớp ${className}:
${lines.join('\n')}${breakdownText}
👉 Tổng số tiền cần đóng: ${formatMoney(totalNeedToPay)}
(Ghi chú: Học phí chỉ tính các buổi em có mặt chính thức; buổi học thử và buổi vắng miễn phí 0đ).

Kính mong quý phụ huynh thu xếp chuyển khoản hoặc gửi học phí giúp giáo viên.
Trân trọng cảm ơn quý phụ huynh!`
}

/**
 * Automatically migrate legacy `payments` (boolean paid=true) into `payment_transactions`
 * so existing users don't lose their paid status when upgrading to Section 2.9.
 */
export function migrateLegacyPaymentsToTransactions({
  legacyPayments,
  existingTransactions,
  classes,
  students,
  scheduleRules,
  sessionExceptions,
  extraSessions,
  holidays,
  attendance,
  userId = 'local',
}: {
  legacyPayments: Payment[]
  existingTransactions: PaymentTransaction[]
  classes: Class[]
  students: Student[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  holidays: Holiday[]
  attendance: Attendance[]
  userId?: string
}): PaymentTransaction[] {
  if (!Array.isArray(legacyPayments) || legacyPayments.length === 0) {
    return existingTransactions
  }
  if (Array.isArray(existingTransactions) && existingTransactions.length > 0) {
    return existingTransactions
  }

  const migrated: PaymentTransaction[] = []

  for (const p of legacyPayments) {
    if (!p.paid) continue
    const student = students.find((s) => s.id === p.student_id)
    if (!student) continue
    const cls = classes.find((c) => c.id === student.class_id)
    const sessions = getClassSessionsForMonth({
      classId: student.class_id,
      monthStr: p.month,
      scheduleRules,
      sessionExceptions,
      extraSessions,
      holidays,
    })
    const raw = computeStudentMonthRawDue({
      student,
      cls,
      monthStr: p.month,
      sessions,
      attendance,
      monthLocks: [],
    })
    if (raw.due_amount <= 0) continue

    migrated.push({
      id: `migrated-tx-${p.id}`,
      student_id: p.student_id,
      amount: raw.due_amount,
      paid_at: p.paid_at ? p.paid_at.slice(0, 10) : `${p.month}-10`,
      method: 'transfer',
      note: `Chuyển đổi tự động từ học phí ${formatMonth(p.month)}`,
      group_id: null,
      created_at: p.paid_at || new Date().toISOString(),
      user_id: p.user_id || userId,
    })
  }

  return migrated
}
