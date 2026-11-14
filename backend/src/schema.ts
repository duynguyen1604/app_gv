import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from './db.js'

const FALLBACK_SQL = `
CREATE TABLE IF NOT EXISTS student_enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'primary',
    schedule_rule_ids JSONB DEFAULT '[]'::jsonb,
    price_override INTEGER,
    from_date DATE NOT NULL,
    to_date DATE,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS student_status_history (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrollment_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    effective_from DATE NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS session_guests (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    host_class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'extra',
    home_class_id TEXT,
    home_session_key TEXT,
    billing_mode TEXT NOT NULL DEFAULT 'free',
    custom_amount INTEGER,
    billed_class_id TEXT,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS school_week_configs (
    id TEXT PRIMARY KEY,
    week_start DATE NOT NULL,
    afternoon_long_break BOOLEAN DEFAULT FALSE,
    afternoon_long_break_minutes INTEGER DEFAULT 20,
    teacher_name TEXT DEFAULT '',
    declared_period_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS school_periods (
    id TEXT PRIMARY KEY,
    period_code TEXT NOT NULL,
    session TEXT NOT NULL DEFAULT 'morning',
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    schedule_name TEXT DEFAULT 'Giờ chuẩn',
    valid_from DATE NOT NULL DEFAULT '2020-01-01',
    valid_to DATE,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL,
    method TEXT NOT NULL DEFAULT 'transfer',
    note TEXT DEFAULT '',
    group_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS month_locks (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (class_id, month)
);

CREATE TABLE IF NOT EXISTS change_log (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS calendar_event_map (
    id TEXT PRIMARY KEY,
    session_key TEXT NOT NULL,
    google_event_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'local',
    UNIQUE (user_id, session_key)
);

CREATE TABLE IF NOT EXISTS calendar_sync_log (
    id TEXT PRIMARY KEY,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    error TEXT,
    user_id TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS gcal_tokens (
    user_id TEXT PRIMARY KEY,
    encrypted_tokens TEXT NOT NULL,
    calendar_id TEXT DEFAULT '',
    account_email TEXT DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'oauth',
    token_expired BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS left_date DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS trial_price INTEGER;

ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS week_start DATE DEFAULT '2026-01-05';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS period_code TEXT DEFAULT 'S1';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS session TEXT DEFAULT 'morning';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS cell_type TEXT DEFAULT 'class';
ALTER TABLE school_schedule ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

ALTER TABLE settings ADD COLUMN IF NOT EXISTS afternoon_start TEXT DEFAULT '12:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS evening_start TEXT DEFAULT '17:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_session_overlay BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_duty_in_email BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_duty_in_gcal BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS period_duration_minutes INTEGER DEFAULT 45;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS morning_long_break_minutes INTEGER DEFAULT 20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS duty_end_time TEXT DEFAULT '16:30';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_trial_sessions INTEGER DEFAULT 2;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_calendar_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_account_email TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_token_expired BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_content TEXT DEFAULT 'both';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_reminders JSONB DEFAULT '[30]'::jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_school_reminders JSONB DEFAULT '[30]'::jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_extra_reminders JSONB DEFAULT '[30]'::jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_weeks_ahead INTEGER DEFAULT 8;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_travel_reminder BOOLEAN DEFAULT TRUE;

ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_user_date_uidx ON holidays (user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS settings_user_id_uidx ON settings (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS session_notes_lookup_uidx ON session_notes (class_id, date, start_time);
`

function resolveSqlPaths(): string[] {
  const dirs = [
    path.resolve(process.cwd(), 'sql'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql'),
  ]
  const foundDir = dirs.find((d) => fs.existsSync(d))
  if (!foundDir) return []
  const files = ['init.sql', '002_supabase_auth_profiles.sql']
  return files
    .map((f) => path.join(foundDir, f))
    .filter((p) => fs.existsSync(p))
}

export async function waitForDatabase(retries = 20, delayMs = 1500): Promise<void> {
  let lastError: unknown
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (err) {
      lastError = err
      console.warn(`[DB] Waiting for PostgreSQL (${i}/${retries})...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
}

export async function ensureSchema(): Promise<void> {
  const sqlPaths = resolveSqlPaths()
  if (sqlPaths.length > 0) {
    for (const sqlPath of sqlPaths) {
      const sql = fs.readFileSync(sqlPath, 'utf8')
      await pool.query(sql)
      console.log(`[DB] Applied schema from ${sqlPath}`)
    }
  } else {
    console.warn('[DB] SQL files not found next to process; applying compatibility indexes only')
  }
  await pool.query(FALLBACK_SQL)
}
