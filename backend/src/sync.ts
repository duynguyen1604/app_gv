import type { PoolClient } from 'pg'
import pool from './db.js'
import { serializeRow, serializeRows, toDateString } from './serialize.js'
import { debounceTriggerGCalSync } from './gcal.js'

export interface SyncPayload {
  user_id?: string
  classes?: Record<string, unknown>[]
  students?: Record<string, unknown>[]
  studentEnrollments?: Record<string, unknown>[]
  studentStatusHistory?: Record<string, unknown>[]
  sessionGuests?: Record<string, unknown>[]
  scheduleRules?: Record<string, unknown>[]
  sessionExceptions?: Record<string, unknown>[]
  extraSessions?: Record<string, unknown>[]
  schoolPeriods?: Record<string, unknown>[]
  schoolSchedule?: Record<string, unknown>[]
  schoolWeekConfigs?: Record<string, unknown>[]
  holidays?: Record<string, unknown>[]
  sessionNotes?: Record<string, unknown>[]
  attendance?: Record<string, unknown>[]
  payments?: Record<string, unknown>[]
  paymentTransactions?: Record<string, unknown>[]
  monthLocks?: Record<string, unknown>[]
  changeLogs?: Record<string, unknown>[]
  calendarEventMap?: Record<string, unknown>[]
  calendarSyncLogs?: Record<string, unknown>[]
  settings?: Record<string, unknown> | null
  notificationLogs?: Record<string, unknown>[]
}

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  return String(value)
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value == null) return fallback
  return value === 'true' || value === true
}

function jsonVal(value: unknown, fallback: unknown = null): string {
  if (value == null) return JSON.stringify(fallback)
  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify(value)
    }
  }
  return JSON.stringify(value)
}

async function insertMany(
  client: PoolClient,
  sql: string,
  rows: unknown[][],
): Promise<void> {
  for (const params of rows) {
    await client.query(sql, params)
  }
}

export async function pullUserState(userId: string) {
  const [
    classes,
    students,
    studentEnrollments,
    studentStatusHistory,
    sessionGuests,
    scheduleRules,
    sessionExceptions,
    extraSessions,
    schoolPeriods,
    schoolSchedule,
    schoolWeekConfigs,
    holidays,
    sessionNotes,
    attendance,
    payments,
    paymentTransactions,
    monthLocks,
    changeLogs,
    calendarEventMap,
    calendarSyncLogs,
    settings,
    logs,
  ] = await Promise.all([
    pool.query('SELECT * FROM classes WHERE user_id = $1 ORDER BY created_at', [userId]),
    pool.query(
      `SELECT s.* FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE c.user_id = $1
       ORDER BY s.created_at`,
      [userId],
    ),
    pool.query('SELECT * FROM student_enrollments WHERE user_id = $1 ORDER BY from_date, created_at', [userId]),
    pool.query('SELECT * FROM student_status_history WHERE user_id = $1 ORDER BY effective_from, created_at', [userId]),
    pool.query('SELECT * FROM session_guests WHERE user_id = $1 ORDER BY date, start_time', [userId]),
    pool.query('SELECT * FROM schedule_rules WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM session_exceptions WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM extra_sessions WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM school_periods WHERE user_id = $1 ORDER BY period_code', [userId]),
    pool.query('SELECT * FROM school_schedule WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM school_week_configs WHERE user_id = $1 ORDER BY week_start', [userId]),
    pool.query('SELECT * FROM holidays WHERE user_id = $1 ORDER BY date', [userId]),
    pool.query('SELECT * FROM session_notes WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM attendance WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM payments WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM payment_transactions WHERE user_id = $1 ORDER BY paid_at DESC, created_at DESC', [userId]),
    pool.query('SELECT * FROM month_locks WHERE user_id = $1 ORDER BY month DESC', [userId]),
    pool.query('SELECT * FROM change_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 300', [userId]),
    pool.query('SELECT * FROM calendar_event_map WHERE user_id = $1 ORDER BY last_synced_at DESC', [userId]),
    pool.query('SELECT * FROM calendar_sync_log WHERE user_id = $1 ORDER BY synced_at DESC LIMIT 100', [userId]),
    pool.query('SELECT * FROM settings WHERE user_id = $1 LIMIT 1', [userId]),
    pool.query(
      'SELECT * FROM notification_log WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 100',
      [userId],
    ),
  ])

  return {
    classes: serializeRows(classes.rows as Record<string, unknown>[]),
    students: serializeRows(students.rows as Record<string, unknown>[]),
    studentEnrollments: serializeRows(studentEnrollments.rows as Record<string, unknown>[]),
    studentStatusHistory: serializeRows(studentStatusHistory.rows as Record<string, unknown>[]),
    sessionGuests: serializeRows(sessionGuests.rows as Record<string, unknown>[]),
    scheduleRules: serializeRows(scheduleRules.rows as Record<string, unknown>[]),
    sessionExceptions: serializeRows(sessionExceptions.rows as Record<string, unknown>[]),
    extraSessions: serializeRows(extraSessions.rows as Record<string, unknown>[]),
    schoolPeriods: serializeRows(schoolPeriods.rows as Record<string, unknown>[]),
    schoolSchedule: serializeRows(schoolSchedule.rows as Record<string, unknown>[]),
    schoolWeekConfigs: serializeRows(schoolWeekConfigs.rows as Record<string, unknown>[]),
    holidays: serializeRows(holidays.rows as Record<string, unknown>[]),
    sessionNotes: serializeRows(sessionNotes.rows as Record<string, unknown>[]),
    attendance: serializeRows(attendance.rows as Record<string, unknown>[]),
    payments: serializeRows(payments.rows as Record<string, unknown>[]),
    paymentTransactions: serializeRows(paymentTransactions.rows as Record<string, unknown>[]),
    monthLocks: serializeRows(monthLocks.rows as Record<string, unknown>[]),
    changeLogs: serializeRows(changeLogs.rows as Record<string, unknown>[]),
    calendarEventMap: serializeRows(calendarEventMap.rows as Record<string, unknown>[]),
    calendarSyncLogs: serializeRows(calendarSyncLogs.rows as Record<string, unknown>[]),
    settings: settings.rows[0] ? serializeRow(settings.rows[0] as Record<string, unknown>) : null,
    notificationLogs: serializeRows(logs.rows as Record<string, unknown>[]).map((row) => ({
      ...row,
      to: row.to_email,
    })),
  }
}

export async function pushUserState(userId: string, payload: SyncPayload): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId])

    await client.query('DELETE FROM notification_log WHERE user_id = $1', [userId])
    await client.query('DELETE FROM change_log WHERE user_id = $1', [userId])
    await client.query('DELETE FROM month_locks WHERE user_id = $1', [userId])
    await client.query('DELETE FROM payment_transactions WHERE user_id = $1', [userId])
    await client.query('DELETE FROM payments WHERE user_id = $1', [userId])
    await client.query('DELETE FROM attendance WHERE user_id = $1', [userId])
    await client.query('DELETE FROM session_guests WHERE user_id = $1', [userId])
    await client.query('DELETE FROM student_status_history WHERE user_id = $1', [userId])
    await client.query('DELETE FROM student_enrollments WHERE user_id = $1', [userId])
    await client.query('DELETE FROM session_notes WHERE user_id = $1', [userId])
    await client.query('DELETE FROM extra_sessions WHERE user_id = $1', [userId])
    await client.query('DELETE FROM session_exceptions WHERE user_id = $1', [userId])
    await client.query('DELETE FROM schedule_rules WHERE user_id = $1', [userId])
    await client.query('DELETE FROM school_periods WHERE user_id = $1', [userId])
    await client.query('DELETE FROM school_schedule WHERE user_id = $1', [userId])
    await client.query('DELETE FROM school_week_configs WHERE user_id = $1', [userId])
    await client.query('DELETE FROM holidays WHERE user_id = $1', [userId])
    await client.query(
      `DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE user_id = $1)`,
      [userId],
    )
    await client.query('DELETE FROM classes WHERE user_id = $1', [userId])

    await insertMany(
      client,
      `INSERT INTO classes (id, name, location, price, color, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      (payload.classes || []).map((row) => [
        str(row.id),
        str(row.name),
        str(row.location),
        num(row.price),
        str(row.color, '#3B82F6'),
        row.created_at || new Date().toISOString(),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO students (id, class_id, name, parent_name, parent_phone, custom_price, trial_price, status, start_date, left_date, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      (payload.students || []).map((row) => [
        str(row.id),
        str(row.class_id),
        str(row.name),
        row.parent_name ?? null,
        row.parent_phone ?? null,
        row.custom_price == null || row.custom_price === '' ? null : num(row.custom_price),
        row.trial_price == null || row.trial_price === '' ? null : num(row.trial_price),
        str(row.status, 'active'),
        toDateString(row.start_date),
        toDateString(row.left_date),
        row.note ?? null,
        row.created_at || new Date().toISOString(),
      ]),
    )

    const validStudentIds = new Set((payload.students || []).map((s) => str(s.id)))
    const validClassIds = new Set((payload.classes || []).map((c) => str(c.id)))

    await insertMany(
      client,
      `INSERT INTO student_enrollments (id, student_id, class_id, role, schedule_rule_ids, price_override, from_date, to_date, note, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)`,
      (payload.studentEnrollments || [])
        .filter((row) => validStudentIds.has(str(row.student_id)) && validClassIds.has(str(row.class_id)))
        .map((row) => [
          str(row.id),
          str(row.student_id),
          str(row.class_id),
          str(row.role, 'primary'),
          jsonVal(row.schedule_rule_ids, []),
          row.price_override == null || row.price_override === '' ? null : num(row.price_override),
          toDateString(row.from_date) || '2026-01-01',
          toDateString(row.to_date),
          str(row.note),
          row.created_at || new Date().toISOString(),
          userId,
        ]),
    )

    await insertMany(
      client,
      `INSERT INTO student_status_history (id, student_id, enrollment_id, status, effective_from, note, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      (payload.studentStatusHistory || [])
        .filter((row) => validStudentIds.has(str(row.student_id)))
        .map((row) => [
          str(row.id),
          str(row.student_id),
          row.enrollment_id ? str(row.enrollment_id) : null,
          str(row.status, 'active'),
          toDateString(row.effective_from) || '2026-01-01',
          str(row.note),
          row.created_at || new Date().toISOString(),
          userId,
        ]),
    )

    await insertMany(
      client,
      `INSERT INTO session_guests (id, student_id, host_class_id, date, start_time, kind, home_class_id, home_session_key, billing_mode, custom_amount, billed_class_id, reason, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      (payload.sessionGuests || [])
        .filter((row) => validStudentIds.has(str(row.student_id)) && validClassIds.has(str(row.host_class_id)))
        .map((row) => [
          str(row.id),
          str(row.student_id),
          str(row.host_class_id),
          toDateString(row.date) || new Date().toISOString().slice(0, 10),
          str(row.start_time, '17:30'),
          str(row.kind, 'extra'),
          row.home_class_id ? str(row.home_class_id) : null,
          row.home_session_key ? str(row.home_session_key) : null,
          str(row.billing_mode, 'free'),
          row.custom_amount == null || row.custom_amount === '' ? null : num(row.custom_amount),
          row.billed_class_id ? str(row.billed_class_id) : null,
          str(row.reason),
          row.created_at || new Date().toISOString(),
          userId,
        ]),
    )

    await insertMany(
      client,
      `INSERT INTO schedule_rules (id, class_id, weekday, start_time, end_time, valid_from, valid_to, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      (payload.scheduleRules || []).map((row) => [
        str(row.id),
        str(row.class_id),
        num(row.weekday),
        str(row.start_time),
        str(row.end_time),
        toDateString(row.valid_from),
        toDateString(row.valid_to),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO session_exceptions (id, rule_id, original_date, action, new_date, new_start, new_end, reason, needs_makeup, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      (payload.sessionExceptions || []).map((row) => [
        str(row.id),
        str(row.rule_id),
        toDateString(row.original_date),
        str(row.action),
        toDateString(row.new_date),
        row.new_start ?? null,
        row.new_end ?? null,
        row.reason ?? null,
        bool(row.needs_makeup),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO extra_sessions (id, class_id, date, start_time, end_time, note, makeup_for, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      (payload.extraSessions || []).map((row) => [
        str(row.id),
        str(row.class_id),
        toDateString(row.date),
        str(row.start_time),
        str(row.end_time),
        row.note ?? null,
        row.makeup_for ?? null,
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO school_periods (id, period_code, session, start_time, end_time, schedule_name, valid_from, valid_to, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      (payload.schoolPeriods || []).map((row) => [
        str(row.id),
        str(row.period_code, 'S1'),
        str(row.session, 'morning'),
        str(row.start_time, '07:00'),
        str(row.end_time, '07:45'),
        str(row.schedule_name, 'Giờ chuẩn'),
        toDateString(row.valid_from) || '2020-01-01',
        toDateString(row.valid_to),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO school_schedule (id, week_start, weekday, period, period_code, session, cell_type, start_time, end_time, class_name, subject, room, note, valid_from, valid_to, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      (payload.schoolSchedule || []).map((row) => {
        const pCode = str(row.period_code || row.period, 'S1')
        const weekStart = toDateString(row.week_start) || toDateString(row.valid_from) || '2026-01-05'
        return [
          str(row.id),
          weekStart,
          num(row.weekday, 1),
          str(row.period || pCode, pCode),
          pCode,
          str(row.session, pCode.startsWith('C') ? 'afternoon' : 'morning'),
          str(row.cell_type, 'class'),
          str(row.start_time, '07:00'),
          str(row.end_time, '07:45'),
          str(row.class_name),
          str(row.subject),
          str(row.room),
          str(row.note),
          toDateString(row.valid_from) || weekStart,
          toDateString(row.valid_to),
          userId,
        ]
      }),
    )

    await insertMany(
      client,
      `INSERT INTO school_week_configs (id, week_start, afternoon_long_break, afternoon_long_break_minutes, teacher_name, declared_period_count, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, week_start) DO UPDATE SET
         afternoon_long_break = EXCLUDED.afternoon_long_break,
         afternoon_long_break_minutes = EXCLUDED.afternoon_long_break_minutes,
         teacher_name = EXCLUDED.teacher_name,
         declared_period_count = EXCLUDED.declared_period_count`,
      (payload.schoolWeekConfigs || []).map((row) => [
        str(row.id),
        toDateString(row.week_start) || '2026-01-05',
        bool(row.afternoon_long_break),
        num(row.afternoon_long_break_minutes, 20),
        str(row.teacher_name),
        row.declared_period_count == null ? null : num(row.declared_period_count),
        row.created_at || new Date().toISOString(),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO holidays (id, date, note, user_id) VALUES ($1, $2, $3, $4)`,
      (payload.holidays || []).map((row) => [
        str(row.id),
        toDateString(row.date),
        str(row.note, 'Nghỉ lễ'),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO session_notes (id, class_id, date, start_time, content, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      (payload.sessionNotes || []).map((row) => [
        str(row.id),
        str(row.class_id),
        toDateString(row.date),
        str(row.start_time),
        str(row.content),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO attendance (id, class_id, date, start_time, student_id, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      (payload.attendance || []).map((row) => [
        str(row.id),
        str(row.class_id),
        toDateString(row.date),
        str(row.start_time),
        str(row.student_id),
        str(row.status),
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO payments (id, student_id, month, paid, paid_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      (payload.payments || []).map((row) => [
        str(row.id),
        str(row.student_id),
        str(row.month),
        bool(row.paid),
        row.paid_at || null,
        userId,
      ]),
    )

    await insertMany(
      client,
      `INSERT INTO payment_transactions (id, student_id, amount, paid_at, method, note, group_id, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      (payload.paymentTransactions || [])
        .filter((row) => validStudentIds.has(str(row.student_id)) && num(row.amount) > 0)
        .map((row) => [
          str(row.id),
          str(row.student_id),
          Math.round(num(row.amount)),
          toDateString(row.paid_at) || new Date().toISOString().slice(0, 10),
          str(row.method, 'transfer'),
          str(row.note),
          row.group_id ? str(row.group_id) : null,
          row.created_at || new Date().toISOString(),
          userId,
        ]),
    )

    await insertMany(
      client,
      `INSERT INTO month_locks (id, class_id, month, locked_at, snapshot, user_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (class_id, month) DO UPDATE SET
         locked_at = EXCLUDED.locked_at,
         snapshot = EXCLUDED.snapshot`,
      (payload.monthLocks || [])
        .filter((row) => validClassIds.has(str(row.class_id)))
        .map((row) => [
          str(row.id),
          str(row.class_id),
          str(row.month),
          row.locked_at || new Date().toISOString(),
          jsonVal(row.snapshot, []),
          userId,
        ]),
    )

    await insertMany(
      client,
      `INSERT INTO change_log (id, entity, entity_id, action, "before", "after", created_at, user_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      (payload.changeLogs || []).slice(0, 300).map((row) => [
        str(row.id),
        str(row.entity, 'payment_transaction'),
        str(row.entity_id),
        str(row.action, 'update'),
        jsonVal(row.before, null),
        jsonVal(row.after, null),
        row.created_at || new Date().toISOString(),
        userId,
      ]),
    )

    const settings = payload.settings || {}
    await client.query(
      `INSERT INTO settings (
         id, user_id, notify_enabled, notify_time, notify_email, notify_content,
         weekly_summary, gemini_api_key, afternoon_start, evening_start,
         show_session_overlay, show_duty_in_email, show_duty_in_gcal,
         period_duration_minutes, morning_long_break_minutes, duty_end_time, default_trial_sessions,
         gcal_enabled, gcal_calendar_id, gcal_connected, gcal_account_email,
         gcal_token_expired, gcal_content, gcal_reminders, gcal_school_reminders,
         gcal_extra_reminders, gcal_weeks_ahead, gcal_travel_reminder
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20, $21,
         $22, $23, $24::jsonb, $25::jsonb,
         $26::jsonb, $27, $28
       )
       ON CONFLICT (user_id) DO UPDATE SET
         notify_enabled = EXCLUDED.notify_enabled,
         notify_time = EXCLUDED.notify_time,
         notify_email = EXCLUDED.notify_email,
         notify_content = EXCLUDED.notify_content,
         weekly_summary = EXCLUDED.weekly_summary,
         gemini_api_key = EXCLUDED.gemini_api_key,
         afternoon_start = EXCLUDED.afternoon_start,
         evening_start = EXCLUDED.evening_start,
         show_session_overlay = EXCLUDED.show_session_overlay,
         show_duty_in_email = EXCLUDED.show_duty_in_email,
         show_duty_in_gcal = EXCLUDED.show_duty_in_gcal,
         period_duration_minutes = EXCLUDED.period_duration_minutes,
         morning_long_break_minutes = EXCLUDED.morning_long_break_minutes,
         duty_end_time = EXCLUDED.duty_end_time,
         default_trial_sessions = EXCLUDED.default_trial_sessions,
         gcal_enabled = EXCLUDED.gcal_enabled,
         gcal_calendar_id = CASE WHEN EXCLUDED.gcal_calendar_id <> '' THEN EXCLUDED.gcal_calendar_id ELSE settings.gcal_calendar_id END,
         gcal_connected = EXCLUDED.gcal_connected,
         gcal_account_email = CASE WHEN EXCLUDED.gcal_account_email <> '' THEN EXCLUDED.gcal_account_email ELSE settings.gcal_account_email END,
         gcal_token_expired = EXCLUDED.gcal_token_expired,
         gcal_content = EXCLUDED.gcal_content,
         gcal_reminders = EXCLUDED.gcal_reminders,
         gcal_school_reminders = EXCLUDED.gcal_school_reminders,
         gcal_extra_reminders = EXCLUDED.gcal_extra_reminders,
         gcal_weeks_ahead = EXCLUDED.gcal_weeks_ahead,
         gcal_travel_reminder = EXCLUDED.gcal_travel_reminder`,
      [
        str(settings.id, userId === 'local' ? 'default' : `settings-${userId}`),
        userId,
        bool(settings.notify_enabled),
        str(settings.notify_time, '06:00'),
        str(settings.notify_email),
        str(settings.notify_content, 'both'),
        bool(settings.weekly_summary),
        str(settings.gemini_api_key),
        str(settings.afternoon_start, '12:00'),
        str(settings.evening_start, '17:00'),
        bool(settings.show_session_overlay, true),
        bool(settings.show_duty_in_email, true),
        bool(settings.show_duty_in_gcal, true),
        num(settings.period_duration_minutes, 45),
        num(settings.morning_long_break_minutes, 20),
        str(settings.duty_end_time, '16:30'),
        num(settings.default_trial_sessions, 2),
        bool(settings.gcal_enabled, false),
        str(settings.gcal_calendar_id),
        bool(settings.gcal_connected, false),
        str(settings.gcal_account_email),
        bool(settings.gcal_token_expired, false),
        str(settings.gcal_content, 'both'),
        jsonVal(settings.gcal_reminders, [30]),
        jsonVal(settings.gcal_school_reminders, [30]),
        jsonVal(settings.gcal_extra_reminders, [30]),
        num(settings.gcal_weeks_ahead, 8),
        bool(settings.gcal_travel_reminder, true),
      ],
    )

    await insertMany(
      client,
      `INSERT INTO notification_log (id, sent_at, to_email, status, error, subject, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      (payload.notificationLogs || []).slice(0, 100).map((row) => [
        str(row.id),
        row.sent_at || new Date().toISOString(),
        str(row.to ?? row.to_email),
        str(row.status, 'success'),
        row.error ?? null,
        row.subject ?? null,
        userId,
      ]),
    )

    await client.query('COMMIT')

    // Trigger debounced one-way Google Calendar sync in background after state save
    debounceTriggerGCalSync(userId)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
