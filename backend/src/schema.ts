import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from './db.js'

const FALLBACK_SQL = `
ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_user_date_uidx ON holidays (user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS settings_user_id_uidx ON settings (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS session_notes_lookup_uidx ON session_notes (class_id, date, start_time);
`

function resolveInitSqlPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'sql', 'init.sql'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'init.sql'),
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? null
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
  const sqlPath = resolveInitSqlPath()
  if (sqlPath) {
    const sql = fs.readFileSync(sqlPath, 'utf8')
    await pool.query(sql)
    console.log(`[DB] Applied schema from ${sqlPath}`)
  } else {
    console.warn('[DB] init.sql not found next to process; applying compatibility indexes only')
  }
  await pool.query(FALLBACK_SQL)
}
