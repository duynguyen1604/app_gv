import { format } from 'date-fns'
import type {
  Class,
  ScheduleRule,
  SessionException,
  ExtraSession,
  SchoolSchedule,
  SchoolPeriod,
  SchoolWeekConfig,
  Holiday,
  CalendarSession,
  ConflictCheckResult,
  Settings,
  SessionGuest,
  StudentEnrollment,
  Student,
} from '../types'
import { dateToWeekday, timeOverlap, timeDiffMinutes } from './dateUtils'
import {
  DEFAULT_SCHOOL_PERIODS,
  getMondayOfDateStr,
  getSpansToGroup,
  getTimeOfDayGroup,
  mergeSchoolDaySessions,
} from './schoolPeriods'

const TRAVEL_BUFFER_MINUTES = 20

export interface ComputeSessionsParams {
  dateStr: string
  classes: Class[]
  students?: Student[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
  schoolSchedule: SchoolSchedule[]
  schoolPeriods?: SchoolPeriod[]
  holidays: Holiday[]
  settings?: Partial<Settings>
  studentsCountByClass?: Record<string, number>
  schoolWeekConfigs?: Record<string, SchoolWeekConfig>
  sessionGuests?: SessionGuest[]
}

/**
 * Compute all active sessions for a given date (YYYY-MM-DD).
 * Supports both single-object call `computeSessionsForDate({ dateStr, ... })` and positional arguments.
 */
export function computeSessionsForDate(
  dateStrOrObj: string | ComputeSessionsParams,
  classesArg?: Class[],
  scheduleRulesArg?: ScheduleRule[],
  sessionExceptionsArg?: SessionException[],
  extraSessionsArg?: ExtraSession[],
  schoolScheduleArg?: SchoolSchedule[],
  holidaysArg?: Holiday[],
  schoolPeriodsArg: SchoolPeriod[] = DEFAULT_SCHOOL_PERIODS,
  settingsArg?: Partial<Settings>,
  studentsCountByClassArg?: Record<string, number>,
  schoolWeekConfigsArg?: Record<string, SchoolWeekConfig>,
  sessionGuestsArg?: SessionGuest[]
): CalendarSession[] {
  let dateStr: string
  let classes: Class[]
  let scheduleRules: ScheduleRule[]
  let sessionExceptions: SessionException[]
  let extraSessions: ExtraSession[]
  let schoolSchedule: SchoolSchedule[]
  let holidays: Holiday[]
  let schoolPeriods: SchoolPeriod[]
  let settings: Partial<Settings> | undefined
  let studentsCountByClass: Record<string, number> | undefined
  let schoolWeekConfigs: Record<string, SchoolWeekConfig> | undefined
  let sessionGuests: SessionGuest[] | undefined

  if (typeof dateStrOrObj === 'object' && dateStrOrObj !== null) {
    dateStr = dateStrOrObj.dateStr
    classes = dateStrOrObj.classes || []
    scheduleRules = dateStrOrObj.scheduleRules || []
    sessionExceptions = dateStrOrObj.sessionExceptions || []
    extraSessions = dateStrOrObj.extraSessions || []
    schoolSchedule = dateStrOrObj.schoolSchedule || []
    holidays = dateStrOrObj.holidays || []
    schoolPeriods = dateStrOrObj.schoolPeriods || DEFAULT_SCHOOL_PERIODS
    settings = dateStrOrObj.settings
    schoolWeekConfigs = dateStrOrObj.schoolWeekConfigs
    sessionGuests = dateStrOrObj.sessionGuests
    if (dateStrOrObj.studentsCountByClass) {
      studentsCountByClass = dateStrOrObj.studentsCountByClass
    } else if (dateStrOrObj.students) {
      studentsCountByClass = {}
      for (const st of dateStrOrObj.students) {
        if (st.status !== 'left') {
          studentsCountByClass[st.class_id] = (studentsCountByClass[st.class_id] || 0) + 1
        }
      }
    }
  } else {
    dateStr = dateStrOrObj
    classes = classesArg || []
    scheduleRules = scheduleRulesArg || []
    sessionExceptions = sessionExceptionsArg || []
    extraSessions = extraSessionsArg || []
    schoolSchedule = schoolScheduleArg || []
    holidays = holidaysArg || []
    schoolPeriods = schoolPeriodsArg || DEFAULT_SCHOOL_PERIODS
    settings = settingsArg
    studentsCountByClass = studentsCountByClassArg
    schoolWeekConfigs = schoolWeekConfigsArg
    sessionGuests = sessionGuestsArg
  }
  const isHoliday = holidays.some((h) => h.date === dateStr)
  const weekday = dateToWeekday(dateStr)
  const weekMonday = getMondayOfDateStr(dateStr)
  const weekConfig = schoolWeekConfigs?.[weekMonday] || null
  const results: CalendarSession[] = []

  const afternoonStart = settings?.afternoon_start || '12:00'
  const eveningStart = settings?.evening_start || '17:00'

  const getGuestCount = (classId: string, startHm: string): number => {
    if (!sessionGuests || sessionGuests.length === 0) return 0
    return sessionGuests.filter(
      (g) => g.host_class_id === classId && g.date === dateStr && g.start_time === startHm
    ).length
  }

  // 1. School schedule for this weekday AND this week_start (Group B3: no automatic weekly repeat)
  if (!isHoliday) {
    const daySchoolItems = schoolSchedule.filter(
      (s) =>
        s.weekday === weekday &&
        (s.week_start ? s.week_start === weekMonday : s.valid_from <= dateStr && (!s.valid_to || s.valid_to >= dateStr))
    )
    const mergedSchool = mergeSchoolDaySessions(
      daySchoolItems,
      schoolPeriods,
      dateStr,
      settings,
      weekConfig
    )
    results.push(...mergedSchool)
  }

  // 2. Fixed tutoring rules for this weekday
  const applicableRules = scheduleRules.filter(
    (r) =>
      r.weekday === weekday &&
      r.valid_from <= dateStr &&
      (!r.valid_to || r.valid_to >= dateStr)
  )

  for (const rule of applicableRules) {
    const cls = classes.find((c) => c.id === rule.class_id)
    if (!cls) continue

    const exception = sessionExceptions.find(
      (e) => e.rule_id === rule.id && e.original_date === dateStr
    )

    const sessionGroup = getTimeOfDayGroup(rule.start_time, afternoonStart, eveningStart)
    const spansTo = getSpansToGroup(rule.start_time, rule.end_time, afternoonStart, eveningStart)
    const studentCount = studentsCountByClass ? studentsCountByClass[cls.id] ?? 0 : undefined
    const guestCount = getGuestCount(cls.id, rule.start_time)

    if (isHoliday) {
      results.push({
        id: `fixed-holiday-${rule.id}-${dateStr}`,
        type: 'cancelled',
        date: dateStr,
        start_time: rule.start_time,
        end_time: rule.end_time,
        session_group: sessionGroup,
        spans_to_group: spansTo,
        class_id: cls.id,
        class_name: cls.name,
        location: cls.location,
        color: cls.color,
        rule_id: rule.id,
        is_cancelled: true,
        reason: 'Ngày nghỉ lễ',
        student_count: studentCount,
        guest_count: guestCount,
      })
      continue
    }

    if (exception) {
      if (exception.action === 'cancelled') {
        results.push({
          id: `fixed-cancel-${rule.id}-${dateStr}`,
          type: 'cancelled',
          date: dateStr,
          start_time: rule.start_time,
          end_time: rule.end_time,
          session_group: sessionGroup,
          spans_to_group: spansTo,
          class_id: cls.id,
          class_name: cls.name,
          location: cls.location,
          color: cls.color,
          rule_id: rule.id,
          exception_id: exception.id,
          is_cancelled: true,
          needs_makeup: exception.needs_makeup,
          reason: exception.reason || 'Đã hủy buổi',
          student_count: studentCount,
          guest_count: guestCount,
        })
      } else if (exception.action === 'moved') {
        results.push({
          id: `fixed-moved-${rule.id}-${dateStr}`,
          type: 'tutoring_moved_away',
          date: dateStr,
          start_time: rule.start_time,
          end_time: rule.end_time,
          session_group: sessionGroup,
          spans_to_group: spansTo,
          class_id: cls.id,
          class_name: cls.name,
          location: cls.location,
          color: cls.color,
          rule_id: rule.id,
          exception_id: exception.id,
          is_moved: true,
          moved_to_date: exception.new_date || undefined,
          moved_to_start: exception.new_start || undefined,
          reason: exception.reason || 'Đã dời lịch',
          student_count: studentCount,
          guest_count: guestCount,
        })
      }
    } else {
      results.push({
        id: `fixed-${rule.id}-${dateStr}`,
        type: 'tutoring_fixed',
        date: dateStr,
        start_time: rule.start_time,
        end_time: rule.end_time,
        session_group: sessionGroup,
        spans_to_group: spansTo,
        class_id: cls.id,
        class_name: cls.name,
        location: cls.location,
        color: cls.color,
        rule_id: rule.id,
        student_count: studentCount,
        guest_count: guestCount,
      })
    }
  }

  // 3. Sessions moved TO this date from another date
  const movedHere = sessionExceptions.filter(
    (e) => e.action === 'moved' && e.new_date === dateStr && e.new_start && e.new_end
  )
  for (const ex of movedHere) {
    const rule = scheduleRules.find((r) => r.id === ex.rule_id)
    if (!rule) continue
    const cls = classes.find((c) => c.id === rule.class_id)
    if (!cls) continue
    const startTime = ex.new_start!
    const endTime = ex.new_end!
    results.push({
      id: `moved-in-${ex.id}-${dateStr}`,
      type: 'tutoring_extra',
      date: dateStr,
      start_time: startTime,
      end_time: endTime,
      session_group: getTimeOfDayGroup(startTime, afternoonStart, eveningStart),
      spans_to_group: getSpansToGroup(startTime, endTime, afternoonStart, eveningStart),
      class_id: cls.id,
      class_name: cls.name,
      location: cls.location,
      color: '#7C3AED', // Purple for moved/extra
      rule_id: rule.id,
      exception_id: ex.id,
      moved_from_date: ex.original_date,
      reason: ex.reason || undefined,
      note: `Học bù (dời từ ${ex.original_date.split('-').reverse().join('/')})`,
      student_count: studentsCountByClass ? studentsCountByClass[cls.id] ?? 0 : undefined,
      guest_count: getGuestCount(cls.id, startTime),
    })
  }

  // 4. Extra sessions on this date
  const extras = extraSessions.filter((e) => e.date === dateStr)
  for (const ex of extras) {
    const cls = classes.find((c) => c.id === ex.class_id)
    if (!cls) continue
    results.push({
      id: `extra-${ex.id}`,
      type: 'tutoring_extra',
      date: dateStr,
      start_time: ex.start_time,
      end_time: ex.end_time,
      session_group: getTimeOfDayGroup(ex.start_time, afternoonStart, eveningStart),
      spans_to_group: getSpansToGroup(ex.start_time, ex.end_time, afternoonStart, eveningStart),
      class_id: cls.id,
      class_name: cls.name,
      location: cls.location,
      color: '#7C3AED', // Purple for extra
      extra_session_id: ex.id,
      custom_price: ex.custom_price ?? null,
      makeup_for: ex.makeup_for || undefined,
      note: ex.note || 'Buổi học phát sinh',
      student_count: studentsCountByClass ? studentsCountByClass[cls.id] ?? 0 : undefined,
      guest_count: getGuestCount(cls.id, ex.start_time),
    })
  }

  // Annotate conflicts among active sessions on this day
  const activeSessions = results.filter(
    (s) => !s.is_cancelled && !s.is_moved && s.type !== 'cancelled' && s.type !== 'tutoring_moved_away'
  )

  for (const s of activeSessions) {
    const conflicts: string[] = []
    for (const other of activeSessions) {
      if (other.id === s.id) continue
      if (timeOverlap(s.start_time, s.end_time, other.start_time, other.end_time)) {
        const label =
          other.type === 'school'
            ? `Lịch trường (${other.period_code ? `${other.period_code} · ` : ''}${other.class_name})`
            : other.type === 'duty'
            ? `Lịch trực chiều (${other.start_time}–${other.end_time})`
            : `Lớp ${other.class_name} (${other.start_time}–${other.end_time})`
        conflicts.push(label)
      }
    }
    if (conflicts.length > 0) {
      s.has_conflict = true
      s.conflict_details = conflicts
    }
  }

  return results.sort((a, b) => a.start_time.localeCompare(b.start_time))
}

/**
 * Check if a proposed session (date, startTime, endTime) conflicts with existing schedule
 * Includes Group B1 (afternoon long break C4 ending at 16:45 or 17:00 vs 17:00 tutoring)
 * and Group B2 ("Trực" full afternoon 13:30–16:30 busy block).
 */
export function checkScheduleConflict(
  params: {
    date: string // YYYY-MM-DD
    startTime?: string // HH:mm
    endTime?: string   // HH:mm
    start_time?: string
    end_time?: string
    class_id?: string
    location?: string
    exclude_id?: string
    excludeRuleId?: string
    excludeExtraId?: string
    excludeExceptionId?: string
    classes?: Class[]
    scheduleRules?: ScheduleRule[]
    sessionExceptions?: SessionException[]
    extraSessions?: ExtraSession[]
    schoolSchedule?: SchoolSchedule[]
    schoolPeriods?: SchoolPeriod[]
    schoolWeekConfigs?: Record<string, SchoolWeekConfig>
    settings?: Partial<Settings>
    holidays?: Holiday[]
  },
  store?: {
    classes: Class[]
    scheduleRules: ScheduleRule[]
    sessionExceptions: SessionException[]
    extraSessions: ExtraSession[]
    schoolSchedule: SchoolSchedule[]
    schoolPeriods?: SchoolPeriod[]
    schoolWeekConfigs?: Record<string, SchoolWeekConfig>
    settings?: Partial<Settings>
    holidays?: Holiday[]
  }
): ConflictCheckResult {
  const date = params.date
  const startTime = params.startTime || params.start_time || '07:00'
  const endTime = params.endTime || params.end_time || '08:30'
  const excludeRuleId = params.excludeRuleId || params.exclude_id
  const excludeExtraId = params.excludeExtraId || params.exclude_id
  const excludeExceptionId = params.excludeExceptionId || params.exclude_id

  const classes = store?.classes || params.classes || []
  const scheduleRules = store?.scheduleRules || params.scheduleRules || []
  const sessionExceptions = store?.sessionExceptions || params.sessionExceptions || []
  const extraSessions = store?.extraSessions || params.extraSessions || []
  const schoolSchedule = store?.schoolSchedule || params.schoolSchedule || []
  const schoolPeriods =
    store?.schoolPeriods || params.schoolPeriods || DEFAULT_SCHOOL_PERIODS
  const schoolWeekConfigs = store?.schoolWeekConfigs || params.schoolWeekConfigs
  const settings = store?.settings || params.settings
  const holidays = store?.holidays || params.holidays || []

  const conflicts: string[] = []
  let hasHardConflict = false
  let hasSoftWarning = false

  // 1. Check holidays
  const holiday = holidays.find((h) => h.date === date)
  if (holiday) {
    hasSoftWarning = true
    conflicts.push(`Trùng ngày nghỉ lễ: ${holiday.note || 'Nghỉ lễ'} (${date.split('-').reverse().join('/')})`)
  }

  const weekday = dateToWeekday(date)
  const weekMonday = getMondayOfDateStr(date)
  const weekConfig = schoolWeekConfigs?.[weekMonday] || null

  // 2. Check school schedule for this week_start (Group B1, B2, B3)
  const daySchoolItems = schoolSchedule.filter(
    (s) =>
      s.weekday === weekday &&
      (s.week_start ? s.week_start === weekMonday : s.valid_from <= date && (!s.valid_to || s.valid_to >= date))
  )

  const mergedSchoolBlocks = mergeSchoolDaySessions(
    daySchoolItems,
    schoolPeriods,
    date,
    settings,
    weekConfig
  )

  for (const block of mergedSchoolBlocks) {
    const label =
      block.cell_type === 'duty'
        ? `Lịch trực chiều (${block.start_time}–${block.end_time})`
        : `Tiết ${block.period_code} trường (${block.class_name}${block.subject ? ' - ' + block.subject : ''}, ${block.start_time}–${block.end_time})`

    if (timeOverlap(startTime, endTime, block.start_time, block.end_time)) {
      hasHardConflict = true
      conflicts.push(`Trùng ${label}`)
    } else {
      const gapAfterSchool = timeDiffMinutes(block.end_time, startTime)
      const gapBeforeSchool = timeDiffMinutes(endTime, block.start_time)
      if (gapAfterSchool >= 0 && gapAfterSchool < TRAVEL_BUFFER_MINUTES) {
        hasSoftWarning = true
        conflicts.push(
          `Sát giờ ${label} — chỉ cách ${gapAfterSchool} phút (cần tối thiểu ${TRAVEL_BUFFER_MINUTES}p di chuyển)`
        )
      } else if (gapBeforeSchool >= 0 && gapBeforeSchool < TRAVEL_BUFFER_MINUTES) {
        hasSoftWarning = true
        conflicts.push(
          `Kết thúc sát giờ ${label} — chỉ cách ${gapBeforeSchool} phút`
        )
      }
    }
  }

  // 3. Check fixed tutoring rules on this date
  const applicableRules = scheduleRules.filter(
    (r) =>
      r.id !== excludeRuleId &&
      r.weekday === weekday &&
      r.valid_from <= date &&
      (!r.valid_to || r.valid_to >= date)
  )

  for (const r of applicableRules) {
    const ex = sessionExceptions.find(
      (e) => e.rule_id === r.id && e.original_date === date && e.id !== excludeExceptionId
    )
    if (ex && (ex.action === 'cancelled' || ex.action === 'moved')) continue

    const cls = classes.find((c) => c.id === r.class_id)
    const clsName = cls?.name || 'Lớp khác'

    if (timeOverlap(startTime, endTime, r.start_time, r.end_time)) {
      hasHardConflict = true
      conflicts.push(`Trùng lịch cố định Lớp ${clsName} (${r.start_time} - ${r.end_time})`)
    }
  }

  // 4. Check sessions moved TO this date
  const movedHere = sessionExceptions.filter(
    (e) =>
      e.id !== excludeExceptionId &&
      e.action === 'moved' &&
      e.new_date === date &&
      e.new_start &&
      e.new_end
  )
  for (const ex of movedHere) {
    const rule = scheduleRules.find((r) => r.id === ex.rule_id)
    const cls = classes.find((c) => c.id === rule?.class_id)
    const clsName = cls?.name || 'Lớp học bù'

    if (timeOverlap(startTime, endTime, ex.new_start!, ex.new_end!)) {
      hasHardConflict = true
      conflicts.push(`Trùng buổi học dời đến của Lớp ${clsName} (${ex.new_start} - ${ex.new_end})`)
    }
  }

  // 5. Check extra sessions on this date
  const extras = extraSessions.filter((e) => e.id !== excludeExtraId && e.date === date)
  for (const ex of extras) {
    const cls = classes.find((c) => c.id === ex.class_id)
    const clsName = cls?.name || 'Lớp phát sinh'

    if (timeOverlap(startTime, endTime, ex.start_time, ex.end_time)) {
      hasHardConflict = true
      conflicts.push(`Trùng buổi phát sinh Lớp ${clsName} (${ex.start_time} - ${ex.end_time})`)
    }
  }

  if (hasHardConflict) {
    return {
      hasConflict: true,
      severity: 'error',
      message: conflicts[0],
      conflicts,
    }
  }

  if (hasSoftWarning) {
    return {
      hasConflict: true,
      severity: 'warning',
      message: conflicts[0],
      conflicts,
    }
  }

  return {
    hasConflict: false,
    severity: null,
    message: null,
    conflicts: [],
  }
}

/**
 * Group D4: Check if a student already has another class session on the given date & time range
 */
export function checkStudentSessionConflict({
  student,
  targetClassId,
  date,
  startTime,
  endTime,
  classes,
  studentEnrollments,
  sessionGuests,
  scheduleRules,
  sessionExceptions,
  extraSessions,
}: {
  student: Student
  targetClassId: string
  date: string
  startTime: string
  endTime: string
  classes: Class[]
  studentEnrollments: StudentEnrollment[]
  sessionGuests: SessionGuest[]
  scheduleRules: ScheduleRule[]
  sessionExceptions: SessionException[]
  extraSessions: ExtraSession[]
}): string[] {
  const warnings: string[] = []
  const weekday = dateToWeekday(date)

  // Active enrollments for this student on `date`
  const activeEnrolls = studentEnrollments.filter(
    (en) =>
      en.student_id === student.id &&
      en.class_id !== targetClassId &&
      en.from_date <= date &&
      (!en.to_date || en.to_date >= date)
  )

  for (const en of activeEnrolls) {
    const cls = classes.find((c) => c.id === en.class_id)
    const clsName = cls?.name || en.class_id

    const rules = scheduleRules.filter(
      (r) =>
        r.class_id === en.class_id &&
        r.weekday === weekday &&
        r.valid_from <= date &&
        (!r.valid_to || r.valid_to >= date) &&
        (!en.schedule_rule_ids || en.schedule_rule_ids.length === 0 || en.schedule_rule_ids.includes(r.id))
    )

    for (const r of rules) {
      const ex = sessionExceptions.find((e) => e.rule_id === r.id && e.original_date === date)
      if (ex && (ex.action === 'cancelled' || ex.action === 'moved')) continue
      if (timeOverlap(startTime, endTime, r.start_time, r.end_time)) {
        warnings.push(`Học sinh ${student.name} có lịch lớp ${clsName} (${r.start_time}–${r.end_time}) trùng giờ này`)
      }
    }

    const extras = extraSessions.filter((e) => e.class_id === en.class_id && e.date === date)
    for (const ex of extras) {
      if (timeOverlap(startTime, endTime, ex.start_time, ex.end_time)) {
        warnings.push(`Học sinh ${student.name} có buổi phát sinh lớp ${clsName} (${ex.start_time}–${ex.end_time})`)
      }
    }
  }

  // Existing guest sessions on `date`
  const otherGuests = sessionGuests.filter(
    (g) => g.student_id === student.id && g.date === date && g.host_class_id !== targetClassId
  )
  for (const g of otherGuests) {
    const cls = classes.find((c) => c.id === g.host_class_id)
    if (g.start_time === startTime) {
      warnings.push(`Học sinh ${student.name} đã xếp học ghép tại lớp ${cls?.name || g.host_class_id} lúc ${g.start_time}`)
    }
  }

  return warnings
}

/**
 * Check conflicts when saving a new weekly recurring rule (checks upcoming 4 occurrences)
 */
export function checkRuleConflict(
  params: {
    weekday: number
    startTime: string
    endTime: string
    validFrom: string
    excludeRuleId?: string
  },
  store: {
    classes: Class[]
    scheduleRules: ScheduleRule[]
    sessionExceptions: SessionException[]
    extraSessions: ExtraSession[]
    schoolSchedule: SchoolSchedule[]
    schoolPeriods?: SchoolPeriod[]
    schoolWeekConfigs?: Record<string, SchoolWeekConfig>
    settings?: Partial<Settings>
    holidays: Holiday[]
  }
): ConflictCheckResult {
  const { weekday, startTime, endTime, validFrom, excludeRuleId } = params
  const baseDate = new Date(validFrom || new Date().toISOString().slice(0, 10))

  for (let i = 0; i < 14; i++) {
    const d = new Date(baseDate)
    d.setDate(baseDate.getDate() + i)
    const dStr = format(d, 'yyyy-MM-dd')
    if (dateToWeekday(d) === weekday) {
      const res = checkScheduleConflict(
        { date: dStr, startTime, endTime, excludeRuleId },
        store
      )
      if (res.hasConflict) return res
    }
  }

  return { hasConflict: false, severity: null, message: null, conflicts: [] }
}
