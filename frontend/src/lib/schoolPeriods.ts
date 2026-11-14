import type {
  CalendarSession,
  SchoolCellType,
  SchoolPeriod,
  SchoolSchedule,
  SchoolSessionType,
  SchoolWeekConfig,
  Settings,
  TimeOfDayGroup,
} from '../types'

/**
 * Helper: convert HH:mm to total minutes from 00:00
 */
export function hmToMinutes(hm: string): number {
  const [h, m] = (hm || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Helper: convert total minutes from 00:00 to HH:mm
 */
export function minutesToHm(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Normalize any YYYY-MM-DD (or dd/mm/yyyy) date string to the Monday (YYYY-MM-DD) of its week (Group B3)
 */
export function getMondayOfDateStr(dateStr?: string | null): string {
  let clean = String(dateStr || '').trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    const [dd, mm, yyyy] = clean.split('/')
    clean = `${yyyy}-${mm}-${dd}`
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(clean)) {
    clean = clean.slice(0, 10)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const now = new Date()
    clean = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
  const [y, m, d] = clean.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.getDay() // 0=Sun, 1=Mon..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/**
 * Add days to a YYYY-MM-DD string
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/**
 * Group B1: Auto-calculate school periods based on start times, period length, short break, and long break after period 2
 * Default Morning: S1 07:00-07:45, S2 07:50-08:35, (ra chơi dài 20p 08:35-08:55), S3 08:55-09:40, S4 09:45-10:30, S5 10:35-11:20
 * Default Afternoon (no long break): C1 13:30-14:15, C2 14:20-15:05, C3 15:10-15:55, C4 16:00-16:45, C5 16:50-17:35
 * Afternoon WITH 20p long break after C2: C1 13:30-14:15, C2 14:20-15:05, (ra chơi dài 20p 15:05-15:25), C3 15:25-16:10, C4 16:15-17:00, C5 17:05-17:50
 */
export function recalculateSchoolPeriods({
  morningStart = '07:00',
  afternoonStart = '13:30',
  periodMinutes = 45,
  shortBreakMinutes = 5,
  morningLongBreakMinutes = 20,
  afternoonLongBreakEnabled = false,
  afternoonLongBreakMinutes = 20,
  morningCount = 5,
  afternoonCount = 5,
  scheduleName = 'Mặc định',
  validFrom = '2026-01-01',
  userId = 'local',
}: {
  morningStart?: string
  afternoonStart?: string
  periodMinutes?: number
  shortBreakMinutes?: number
  morningLongBreakMinutes?: number
  afternoonLongBreakEnabled?: boolean
  afternoonLongBreakMinutes?: number
  morningCount?: number
  afternoonCount?: number
  scheduleName?: string
  validFrom?: string
  userId?: string
} = {}): SchoolPeriod[] {
  const result: SchoolPeriod[] = []

  // Morning periods S1..Sn
  let curMin = hmToMinutes(morningStart)
  for (let i = 1; i <= morningCount; i++) {
    const startHm = minutesToHm(curMin)
    const endMin = curMin + periodMinutes
    const endHm = minutesToHm(endMin)
    result.push({
      id: `sp-s${i}`,
      period_code: `S${i}`,
      session: 'morning',
      kind: 'class',
      start_time: startHm,
      end_time: endHm,
      schedule_name: scheduleName,
      valid_from: validFrom,
      valid_to: null,
      user_id: userId,
    })
    if (i === 2 && morningLongBreakMinutes > 0) {
      curMin = endMin + morningLongBreakMinutes
    } else {
      curMin = endMin + shortBreakMinutes
    }
  }

  // Afternoon periods C1..Cm
  curMin = hmToMinutes(afternoonStart)
  for (let i = 1; i <= afternoonCount; i++) {
    const startHm = minutesToHm(curMin)
    const endMin = curMin + periodMinutes
    const endHm = minutesToHm(endMin)
    result.push({
      id: `sp-c${i}`,
      period_code: `C${i}`,
      session: 'afternoon',
      kind: 'class',
      start_time: startHm,
      end_time: endHm,
      schedule_name: scheduleName,
      valid_from: validFrom,
      valid_to: null,
      user_id: userId,
    })
    if (i === 2 && afternoonLongBreakEnabled && afternoonLongBreakMinutes > 0) {
      curMin = endMin + afternoonLongBreakMinutes
    } else {
      curMin = endMin + shortBreakMinutes
    }
  }

  return result
}

/**
 * Default School Period Timetable configured per Teacher's Schedule Image:
 * - Buổi Sáng (7h - 11h45): 5 tiết (S1–S5) từ 07:00 đến 11:45
 * - Buổi Chiều (14h - 16h30): C1–C3 từ 14:00 đến 16:30 (kèm C4 dự phòng)
 */
export const DEFAULT_SCHOOL_PERIODS: SchoolPeriod[] = [
  {
    id: 'sp-s1',
    period_code: 'S1',
    session: 'morning',
    kind: 'class',
    start_time: '07:00',
    end_time: '07:45',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-s2',
    period_code: 'S2',
    session: 'morning',
    kind: 'class',
    start_time: '07:55',
    end_time: '08:40',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-s3',
    period_code: 'S3',
    session: 'morning',
    kind: 'class',
    start_time: '09:10',
    end_time: '09:55',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-s4',
    period_code: 'S4',
    session: 'morning',
    kind: 'class',
    start_time: '10:05',
    end_time: '10:50',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-s5',
    period_code: 'S5',
    session: 'morning',
    kind: 'class',
    start_time: '11:00',
    end_time: '11:45',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-c1',
    period_code: 'C1',
    session: 'afternoon',
    kind: 'class',
    start_time: '14:00',
    end_time: '14:45',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-c2',
    period_code: 'C2',
    session: 'afternoon',
    kind: 'class',
    start_time: '14:50',
    end_time: '15:35',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-c3',
    period_code: 'C3',
    session: 'afternoon',
    kind: 'class',
    start_time: '15:45',
    end_time: '16:30',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
  {
    id: 'sp-c4',
    period_code: 'C4',
    session: 'afternoon',
    kind: 'class',
    start_time: '16:35',
    end_time: '17:20',
    schedule_name: 'Giờ chuẩn (Sáng 7h-11h45, Chiều 14h-16h30)',
    valid_from: '2026-01-01',
    valid_to: null,
    user_id: 'local',
  },
]

export const SEASONAL_PERIOD_PRESETS: Record<
  'standard' | 'summer' | 'winter',
  { label: string; periods: SchoolPeriod[] }
> = {
  standard: {
    label: 'Giờ chuẩn',
    periods: DEFAULT_SCHOOL_PERIODS,
  },
  summer: {
    label: 'Giờ mùa hè',
    periods: recalculateSchoolPeriods({
      morningStart: '06:45',
      afternoonStart: '13:30',
      periodMinutes: 45,
      shortBreakMinutes: 5,
      morningLongBreakMinutes: 20,
      afternoonLongBreakEnabled: false,
      afternoonLongBreakMinutes: 20,
      morningCount: 5,
      afternoonCount: 5,
      scheduleName: 'Giờ mùa hè',
    }),
  },
  winter: {
    label: 'Giờ mùa đông',
    periods: recalculateSchoolPeriods({
      morningStart: '07:15',
      afternoonStart: '13:30',
      periodMinutes: 45,
      shortBreakMinutes: 5,
      morningLongBreakMinutes: 20,
      afternoonLongBreakEnabled: false,
      afternoonLongBreakMinutes: 20,
      morningCount: 5,
      afternoonCount: 5,
      scheduleName: 'Giờ mùa đông',
    }),
  },
}

/**
 * Determine whether a specific date (or week) has afternoon long break enabled
 */
export function isAfternoonLongBreakOnDate(
  dateStr: string,
  weekConfig?: SchoolWeekConfig | null,
  weekItems?: SchoolSchedule[]
): { enabled: boolean; minutes: number } {
  const minutes =
    weekConfig?.afternoon_break_minutes ||
    weekItems?.[0]?.afternoon_break_minutes ||
    20

  if (weekConfig) {
    if (Array.isArray(weekConfig.afternoon_break_days) && weekConfig.afternoon_break_days.length > 0) {
      const [y, m, d] = dateStr.split('-').map(Number)
      const dt = new Date(y, m - 1, d)
      const weekday = dt.getDay() === 0 ? 7 : dt.getDay()
      return {
        enabled: weekConfig.afternoon_break_days.includes(weekday),
        minutes,
      }
    }
    return {
      enabled: Boolean(weekConfig.afternoon_long_break),
      minutes,
    }
  }

  if (weekItems && weekItems.some((it) => it.afternoon_long_break)) {
    return { enabled: true, minutes }
  }

  return { enabled: false, minutes }
}

/**
 * Get effective school periods for a given date/week, dynamically applying the per-week/per-day
 * "Chiều có ra chơi dài" toggle to C3..C5 if enabled.
 */
export function getEffectivePeriodsForDate(
  basePeriods: SchoolPeriod[],
  dateStr?: string,
  weekConfig?: SchoolWeekConfig | null,
  weekItems?: SchoolSchedule[],
  settings?: Partial<Settings>
): SchoolPeriod[] {
  const list = basePeriods && basePeriods.length > 0 ? basePeriods : DEFAULT_SCHOOL_PERIODS
  if (!dateStr) return list

  const { enabled: aftBreakEnabled, minutes: aftBreakMinutes } = isAfternoonLongBreakOnDate(
    dateStr,
    weekConfig,
    weekItems
  )

  if (!aftBreakEnabled) {
    return list
  }

  // Recompute C3..C5 from C2 end_time + aftBreakMinutes
  const c2 = list.find((p) => p.period_code.toUpperCase() === 'C2')
  const c1 = list.find((p) => p.period_code.toUpperCase() === 'C1')
  const periodLen =
    settings?.period_duration_minutes ||
    (c1 ? Math.max(30, hmToMinutes(c1.end_time) - hmToMinutes(c1.start_time)) : 45)
  const shortBreak = settings?.short_break_minutes ?? 5
  let curMin = (c2 ? hmToMinutes(c2.end_time) : hmToMinutes('15:05')) + aftBreakMinutes

  return list.map((p) => {
    const code = p.period_code.toUpperCase()
    if (code.startsWith('C')) {
      const idx = parseInt(code.slice(1), 10)
      if (idx >= 3) {
        const startHm = minutesToHm(curMin)
        const endMin = curMin + periodLen
        const endHm = minutesToHm(endMin)
        curMin = endMin + shortBreak
        return {
          ...p,
          start_time: startHm,
          end_time: endHm,
        }
      }
    }
    return p
  })
}

/**
 * Get subtle non-event Break Bands ("Ra chơi dài") for a date so TimeGridCalendar / SchoolPeriodGridView can render them
 */
export function getBreakBandsForDate(
  basePeriods: SchoolPeriod[],
  dateStr: string,
  weekConfig?: SchoolWeekConfig | null,
  weekItems?: SchoolSchedule[]
): {
  code: string
  session: SchoolSessionType
  label: string
  start_time: string
  end_time: string
  minutes: number
}[] {
  const effective = getEffectivePeriodsForDate(basePeriods, dateStr, weekConfig, weekItems)
  const bands: {
    code: string
    session: SchoolSessionType
    label: string
    start_time: string
    end_time: string
    minutes: number
  }[] = []

  const s2 = effective.find((p) => p.period_code.toUpperCase() === 'S2')
  const s3 = effective.find((p) => p.period_code.toUpperCase() === 'S3')
  if (s2 && s3) {
    const diff = hmToMinutes(s3.start_time) - hmToMinutes(s2.end_time)
    if (diff >= 10) {
      bands.push({
        code: 'SB1',
        session: 'morning',
        label: `Ra chơi dài (${diff}p)`,
        start_time: s2.end_time,
        end_time: s3.start_time,
        minutes: diff,
      })
    }
  }

  const c2 = effective.find((p) => p.period_code.toUpperCase() === 'C2')
  const c3 = effective.find((p) => p.period_code.toUpperCase() === 'C3')
  if (c2 && c3) {
    const diff = hmToMinutes(c3.start_time) - hmToMinutes(c2.end_time)
    if (diff >= 10) {
      bands.push({
        code: 'CB1',
        session: 'afternoon',
        label: `Ra chơi dài chiều (${diff}p)`,
        start_time: c2.end_time,
        end_time: c3.start_time,
        minutes: diff,
      })
    }
  }

  return bands
}

/**
 * Look up a period definition by period_code (and optional dateStr for valid_from/valid_to)
 */
export function findSchoolPeriod(
  periods: SchoolPeriod[],
  periodCode: string,
  dateStr?: string,
  weekConfig?: SchoolWeekConfig | null,
  weekItems?: SchoolSchedule[]
): SchoolPeriod | undefined {
  const code = String(periodCode || '').trim().toUpperCase()
  const list = getEffectivePeriodsForDate(
    periods && periods.length > 0 ? periods : DEFAULT_SCHOOL_PERIODS,
    dateStr,
    weekConfig,
    weekItems
  )
  if (dateStr) {
    const dated = list.find(
      (p) =>
        p.period_code.toUpperCase() === code &&
        p.valid_from <= dateStr &&
        (!p.valid_to || p.valid_to >= dateStr)
    )
    if (dated) return dated
  }
  return (
    list.find((p) => p.period_code.toUpperCase() === code) ||
    DEFAULT_SCHOOL_PERIODS.find((p) => p.period_code === code)
  )
}

/**
 * Parse a period_code or legacy period string into normalized { period_code, session }
 */
export function normalizePeriodCode(
  rawPeriodCode?: string | number | null,
  rawStartTime?: string
): { period_code: string; session: SchoolSessionType } {
  const rawStr = String(rawPeriodCode ?? '')
  const cleaned = rawStr.trim().toUpperCase()
  if (/^S[1-9]$/.test(cleaned)) {
    return { period_code: cleaned, session: 'morning' }
  }
  if (/^C[1-9]$/.test(cleaned)) {
    return { period_code: cleaned, session: 'afternoon' }
  }

  const isAfternoonByTime = rawStartTime ? String(rawStartTime) >= '12:00' : false
  const isAfternoonByText = /CHIỀU|CHIEU|^C/i.test(rawStr)
  const session: SchoolSessionType =
    isAfternoonByTime || isAfternoonByText ? 'afternoon' : 'morning'
  const prefix = session === 'morning' ? 'S' : 'C'

  const numMatch = rawStr.match(/([1-9])/)
  if (numMatch) {
    const n = parseInt(numMatch[1], 10)
    const periodNum = session === 'afternoon' && n > 5 ? n - 5 : Math.min(Math.max(n, 1), 5)
    return { period_code: `${prefix}${periodNum}`, session }
  }

  if (rawStartTime) {
    const candidates = DEFAULT_SCHOOL_PERIODS.filter((p) => p.session === session)
    const exact = candidates.find((p) => p.start_time === rawStartTime)
    if (exact) return { period_code: exact.period_code, session: exact.session }
  }

  return { period_code: `${prefix}1`, session }
}

/**
 * Resolve start_time and end_time for a SchoolSchedule record from the SchoolPeriod table
 */
export function resolveSchoolScheduleTime(
  item: Partial<SchoolSchedule>,
  periods: SchoolPeriod[],
  dateStr?: string,
  weekConfig?: SchoolWeekConfig | null,
  weekItems?: SchoolSchedule[],
  settings?: Partial<Settings>
): { start_time: string; end_time: string; period_code: string; session: SchoolSessionType } {
  const { period_code, session } = normalizePeriodCode(
    item.period_code || item.period,
    item.start_time
  )
  // Group B2: If afternoon duty ("Trực"), it spans 13:30 to settings.duty_end_time (default 16:30)
  if (item.cell_type === 'duty' && session === 'afternoon') {
    const dutyStart = settings?.afternoon_period_start_time || '13:30'
    const dutyEnd = settings?.duty_end_time || '16:30'
    return {
      period_code,
      session: 'afternoon',
      start_time: dutyStart,
      end_time: dutyEnd,
    }
  }
  const matched = findSchoolPeriod(periods, period_code, dateStr, weekConfig, weekItems)
  return {
    period_code,
    session: matched?.session || session,
    start_time: matched?.start_time || item.start_time || (session === 'morning' ? '07:00' : '13:30'),
    end_time: matched?.end_time || item.end_time || (session === 'morning' ? '07:45' : '14:15'),
  }
}

/**
 * Determine whether a cell represents "Trực" (duty), "Khác" (other), or a regular class
 */
export function inferSchoolCellType(
  rawCellType?: string,
  className?: string,
  subject?: string
): SchoolCellType {
  if (rawCellType === 'duty' || rawCellType === 'other' || rawCellType === 'class') {
    return rawCellType
  }
  const combined = `${className || ''} ${subject || ''}`.trim()
  if (/^trực|trực\s|trực$|giám thị/i.test(combined)) {
    return 'duty'
  }
  if (/chào cờ|sinh hoạt|shl|họp|chuyên đề/i.test(combined) && !/\d+[A-Z0-9]/i.test(className || '')) {
    return 'other'
  }
  return 'class'
}

/**
 * Backup existing app store data in localStorage before migrating to v3 schema (Groups A, B, D, E)
 */
export function ensureDataBackupBeforeMigration(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const backupKey = 'gv-app-backup-before-v3-migration'
    if (!window.localStorage.getItem(backupKey)) {
      const currentRaw = window.localStorage.getItem('gv-app-store')
      if (currentRaw) {
        window.localStorage.setItem(backupKey, currentRaw)
      }
    }
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

/**
 * Migrate any legacy SchoolSchedule items into the new per-week SchoolSchedule format (Group B3).
 * Existing records without `week_start` are assigned to the current week Monday (or their valid_from Monday if recent).
 */
export function migrateLegacySchoolSchedule(
  items: Partial<SchoolSchedule>[],
  periods: SchoolPeriod[] = DEFAULT_SCHOOL_PERIODS,
  userId = 'local',
  fallbackWeekStart?: string
): SchoolSchedule[] {
  ensureDataBackupBeforeMigration()
  const defaultMonday =
    fallbackWeekStart || getMondayOfDateStr(new Date().toISOString().slice(0, 10))

  return items.map((item, idx) => {
    const resolved = resolveSchoolScheduleTime(item, periods, item.week_start || item.valid_from)
    const cell_type = inferSchoolCellType(item.cell_type, item.class_name, item.subject)

    // Determine week_start (Monday YYYY-MM-DD)
    let weekStart = item.week_start
    if (!weekStart) {
      weekStart = defaultMonday
    } else {
      weekStart = getMondayOfDateStr(weekStart)
    }

    return {
      id: String(item.id || `ss-migrated-${idx}`),
      week_start: weekStart,
      weekday: Number(item.weekday) || 1,
      period_code: resolved.period_code,
      session: resolved.session,
      cell_type,
      class_name:
        item.class_name ||
        (cell_type === 'duty' ? 'Trực' : cell_type === 'other' ? 'Khác' : ''),
      subject: item.subject || (cell_type === 'duty' ? 'Trực' : ''),
      room: item.room || '',
      note: item.note || '',
      valid_from: weekStart,
      valid_to: null,
      afternoon_long_break: Boolean(item.afternoon_long_break),
      afternoon_break_minutes: Number(item.afternoon_break_minutes) || 20,
      user_id: item.user_id || userId,
      period: resolved.period_code,
      start_time: resolved.start_time,
      end_time: resolved.end_time,
    }
  })
}

/**
 * Determine time-of-day group ('morning' | 'afternoon' | 'evening') from HH:mm
 */
export function getTimeOfDayGroup(
  startTime: string,
  afternoonStart = '12:00',
  eveningStart = '17:00'
): TimeOfDayGroup {
  if (startTime < afternoonStart) return 'morning'
  if (startTime < eveningStart) return 'afternoon'
  return 'evening'
}

export function timeGroupLabel(group: TimeOfDayGroup): string {
  if (group === 'morning') return 'Sáng'
  if (group === 'afternoon') return 'Chiều'
  return 'Tối'
}

export function getSessionFromPeriodCode(
  code?: string,
  rawStartTime?: string
): SchoolSessionType {
  return normalizePeriodCode(code, rawStartTime).session
}

export function parseLegacyPeriodToCodes(
  rawPeriod?: string,
  rawStartTime?: string
): string[] {
  const { period_code } = normalizePeriodCode(rawPeriod, rawStartTime)
  return [period_code]
}

/**
 * Check if a session spans from afternoon into evening (e.g. 16:30 - 18:30)
 */
export function getSpansToGroup(
  startTime: string,
  endTime: string,
  afternoonStart = '12:00',
  eveningStart = '17:00'
): TimeOfDayGroup | null {
  const startGroup = getTimeOfDayGroup(startTime, afternoonStart, eveningStart)
  const endGroup = getTimeOfDayGroup(endTime, afternoonStart, eveningStart)
  if (startGroup !== endGroup && endTime > eveningStart && startGroup === 'afternoon') {
    return 'evening'
  }
  return null
}

/**
 * Extract numeric period index from period_code ('S1' -> 1, 'C3' -> 3)
 */
export function getPeriodIndex(periodCode: string): number {
  const m = String(periodCode || '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 1
}

/**
 * Merge consecutive periods of the same school class in the same session into a single CalendarSession block.
 * Group B2: If any afternoon period on this day has `cell_type === 'duty'`, the ENTIRE afternoon becomes a single
 * "Trực" block (13:30 - settings.duty_end_time, default 16:30), hiding other afternoon cells on that day.
 */
export function mergeSchoolDaySessions(
  dayItems: SchoolSchedule[],
  periods: SchoolPeriod[],
  dateStr: string,
  settings?: Partial<Settings>,
  weekConfig?: SchoolWeekConfig | null
): CalendarSession[] {
  if (dayItems.length === 0) return []

  const effectivePeriods = getEffectivePeriodsForDate(
    periods,
    dateStr,
    weekConfig,
    dayItems,
    settings
  )
  const afternoonStart = settings?.afternoon_start || '12:00'
  const eveningStart = settings?.evening_start || '17:00'
  const dutyStart = settings?.afternoon_period_start_time || '13:30'
  const dutyEnd = settings?.duty_end_time || '16:30'

  const morningItems = dayItems.filter(
    (it) => (it.session || normalizePeriodCode(it.period_code || it.period, it.start_time).session) === 'morning'
  )
  const afternoonItems = dayItems.filter(
    (it) => (it.session || normalizePeriodCode(it.period_code || it.period, it.start_time).session) === 'afternoon'
  )

  const results: CalendarSession[] = []

  // Helper to resolve & merge a list of items within a session
  const processSessionItems = (items: SchoolSchedule[], isAfternoon: boolean) => {
    if (items.length === 0) return

    // Group B2: Check if afternoon has any "Trực" cell
    if (isAfternoon) {
      const dutyCells = items.filter((it) => it.cell_type === 'duty')
      if (dutyCells.length > 0) {
        const firstDuty = dutyCells[0]
        const aftCount = settings?.afternoon_periods_count || 4
        results.push({
          id: `school-duty-${dateStr}-${firstDuty.id}`,
          type: 'duty',
          cell_type: 'duty',
          date: dateStr,
          start_time: dutyStart,
          end_time: dutyEnd,
          period_code: `C1-C${aftCount}`,
          session_group: 'afternoon',
          spans_to_group: null,
          class_name: 'Trực',
          subject: firstDuty.subject && firstDuty.subject !== 'Trực' ? firstDuty.subject : 'Trực chiều',
          room: firstDuty.room || '',
          note: firstDuty.note || `Trực cả buổi chiều (${dutyStart}–${dutyEnd})`,
          color: '#64748B',
          school_item_ids: dutyCells.map((d) => d.id),
        })
        return
      }
    }

    const resolved = items
      .map((it) => {
        const r = resolveSchoolScheduleTime(
          it,
          effectivePeriods,
          dateStr,
          weekConfig,
          dayItems,
          settings
        )
        return {
          ...it,
          period_code: r.period_code,
          session: r.session,
          start_time: r.start_time,
          end_time: r.end_time,
          periodIndex: getPeriodIndex(r.period_code),
        }
      })
      .sort((a, b) => a.periodIndex - b.periodIndex)

    let i = 0
    while (i < resolved.length) {
      const first = resolved[i]
      let last = first
      const ids = [first.id]

      while (i + 1 < resolved.length) {
        const next = resolved[i + 1]
        const gapMinutes = hmToMinutes(next.start_time) - hmToMinutes(last.end_time)
        const isGenericSchoolBlock =
          (last.class_name || '').trim().toLowerCase() === 'dạy trường' &&
          (next.class_name || '').trim().toLowerCase() === 'dạy trường'
        const sameGroup =
          next.session === last.session &&
          next.cell_type === last.cell_type &&
          next.periodIndex === last.periodIndex + 1 &&
          (gapMinutes <= 15 || isGenericSchoolBlock) &&
          (next.class_name || '').trim().toLowerCase() ===
            (last.class_name || '').trim().toLowerCase() &&
          (next.subject || '').trim().toLowerCase() ===
            (last.subject || '').trim().toLowerCase() &&
          (next.room || '').trim().toLowerCase() === (last.room || '').trim().toLowerCase()

        if (sameGroup) {
          last = next
          ids.push(next.id)
          i++
        } else {
          break
        }
      }

      const combinedPeriodCode =
        first.period_code === last.period_code
          ? first.period_code
          : `${first.period_code}-${last.period_code}`

      const isDuty = first.cell_type === 'duty'
      const sessionGroup = getTimeOfDayGroup(first.start_time, afternoonStart, eveningStart)
      const spansTo = getSpansToGroup(first.start_time, last.end_time, afternoonStart, eveningStart)

      results.push({
        id: `school-${dateStr}-${first.id}`,
        type: isDuty ? 'duty' : 'school',
        cell_type: first.cell_type,
        date: dateStr,
        start_time: first.start_time,
        end_time: last.end_time,
        period_code: combinedPeriodCode,
        session_group: sessionGroup,
        spans_to_group: spansTo,
        class_name: first.class_name || (isDuty ? 'Trực' : 'Lịch trường'),
        subject: first.subject,
        room: first.room,
        note: first.note,
        color: isDuty ? '#64748B' : '#2563EB',
        school_item_ids: ids,
      })

      i++
    }
  }

  processSessionItems(morningItems, false)
  processSessionItems(afternoonItems, true)

  return results
}
