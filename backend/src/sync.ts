import type { PoolClient } from 'pg'
import pool from './db.js'
import { serializeRow, serializeRows, toDateString } from './serialize.js'

export interface SyncPayload {
  user_id?: string
  classes?: Record<string, unknown>[]
  students?: Record<string, unknown>[]
  scheduleRules?: Record<string, unknown>[]
  sessionExceptions?: Record<string, unknown>[]
  extraSessions?: Record<string, unknown>[]
  schoolSchedule?: Record<string, unknown>[]
  holidays?: Record<string, unknown>[]
  sessionNotes?: Record<string, unknown>[]
  attendance?: Record<string, unknown>[]
  payments?: Record<string, unknown>[]
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
    scheduleRules,
    sessionExceptions,
    extraSessions,
    schoolSchedule,
    holidays,
    sessionNotes,
    attendance,
    payments,
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
    pool.query('SELECT * FROM schedule_rules WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM session_exceptions WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM extra_sessions WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM school_schedule WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM holidays WHERE user_id = $1 ORDER BY date', [userId]),
    pool.query('SELECT * FROM session_notes WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM attendance WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM payments WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM settings WHERE user_id = $1 LIMIT 1', [userId]),
    pool.query(
      'SELECT * FROM notification_log WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 100',
      [userId],
    ),
  ])

  return {
    classes: serializeRows(classes.rows as Record<string, unknown>[]),
    students: serializeRows(students.rows as Record<string, unknown>[]),
    scheduleRules: serializeRows(scheduleRules.rows as Record<string, unknown>[]),
    sessionExceptions: serializeRows(sessionExceptions.rows as Record<string, unknown>[]),
    extraSessions: serializeRows(extraSessions.rows as Record<string, unknown>[]),
    schoolSchedule: serializeRows(schoolSchedule.rows as Record<string, unknown>[]),
    holidays: serializeRows(holidays.rows as Record<string, unknown>[]),
    sessionNotes: serializeRows(sessionNotes.rows as Record<string, unknown>[]),
    attendance: serializeRows(attendance.rows as Record<string, unknown>[]),
    payments: serializeRows(payments.rows as Record<string, unknown>[]),
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

    await client.query('DELETE FROM notification_log WHERE user_id = $1', [userId])
    await client.query('DELETE FROM payments WHERE user_id = $1', [userId])
    await client.query('DELETE FROM attendance WHERE user_id = $1', [userId])
    await client.query('DELETE FROM session_notes WHERE user_id = $1', [userId])
    await client.query('DELETE FROM extra_sessions WHERE user_id = $1', [userId])
    await client.query('DELETE FROM session_exceptions WHERE user_id = $1', [userId])
    await client.query('DELETE FROM schedule_rules WHERE user_id = $1', [userId])
    await client.query('DELETE FROM school_schedule WHERE user_id = $1', [userId])
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
      `INSERT INTO students (id, class_id, name, parent_name, parent_phone, custom_price, status, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      (payload.students || []).map((row) => [
        str(row.id),
        str(row.class_id),
        str(row.name),
        row.parent_name ?? null,
        row.parent_phone ?? null,
        row.custom_price == null || row.custom_price === '' ? null : num(row.custom_price),
        str(row.status, 'active'),
        row.note ?? null,
        row.created_at || new Date().toISOString(),
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
      `INSERT INTO school_schedule (id, weekday, period, start_time, end_time, class_name, subject, room, valid_from, valid_to, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      (payload.schoolSchedule || []).map((row) => [
        str(row.id),
        num(row.weekday),
        str(row.period),
        str(row.start_time),
        str(row.end_time),
        str(row.class_name),
        str(row.subject),
        str(row.room),
        toDateString(row.valid_from),
        toDateString(row.valid_to),
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

    const settings = payload.settings || {}
    await client.query(
      `INSERT INTO settings (id, user_id, notify_enabled, notify_time, notify_email, notify_content, weekly_summary, gemini_api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         notify_enabled = EXCLUDED.notify_enabled,
         notify_time = EXCLUDED.notify_time,
         notify_email = EXCLUDED.notify_email,
         notify_content = EXCLUDED.notify_content,
         weekly_summary = EXCLUDED.weekly_summary,
         gemini_api_key = EXCLUDED.gemini_api_key`,
      [
        str(settings.id, userId === 'local' ? 'default' : `settings-${userId}`),
        userId,
        bool(settings.notify_enabled),
        str(settings.notify_time, '06:00'),
        str(settings.notify_email),
        str(settings.notify_content, 'both'),
        bool(settings.weekly_summary),
        str(settings.gemini_api_key),
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
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
