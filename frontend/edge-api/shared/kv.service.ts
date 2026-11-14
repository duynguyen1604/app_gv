import type { D1Database } from '../types/index'

// Bộ nhớ dự phòng trong trường hợp người dùng chưa kịp gắn D1 Database
const memoryKv = new Map<string, string>()
let d1Initialized = false

export async function ensureD1Table(db?: D1Database): Promise<void> {
  if (!db || d1Initialized) return
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      )
      .run()
    // Tự động dọn sạch dữ liệu cũ trước đợt Reset DB v3_clean
    await db.prepare(`DELETE FROM kv_store WHERE key NOT LIKE 'v3_clean_%'`).run()
    d1Initialized = true
  } catch (err) {
    console.warn('[Cloudflare D1] Auto-init table warning:', err)
  }
}

export async function kvGet<T>(db: D1Database | undefined, key: string): Promise<T | null> {
  if (db) {
    try {
      await ensureD1Table(db)
      const row = await db
        .prepare('SELECT value FROM kv_store WHERE key = ?1')
        .bind(key)
        .first<{ value: string }>()
      if (row && typeof row.value === 'string') {
        return JSON.parse(row.value) as T
      }
      return null
    } catch (err) {
      console.warn('[Cloudflare D1] kvGet fallback to memory:', err)
    }
  }
  const raw = memoryKv.get(key)
  return raw ? (JSON.parse(raw) as T) : null
}

export async function kvSet(db: D1Database | undefined, key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value)
  memoryKv.set(key, serialized)
  if (db) {
    try {
      await ensureD1Table(db)
      const now = new Date().toISOString()
      await db
        .prepare(
          `INSERT INTO kv_store (key, value, updated_at)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(key, serialized, now)
        .run()
    } catch (err) {
      console.warn('[Cloudflare D1] kvSet warning:', err)
    }
  }
}

export async function kvListByPrefix<T>(
  db: D1Database | undefined,
  prefix: string
): Promise<Array<{ key: string; value: T }>> {
  const results: Array<{ key: string; value: T }> = []
  if (db) {
    try {
      await ensureD1Table(db)
      const rows = await db
        .prepare('SELECT key, value FROM kv_store WHERE key LIKE ?1')
        .bind(`${prefix}%`)
        .all<{ key: string; value: string }>()
      for (const row of rows.results || []) {
        try {
          results.push({ key: row.key, value: JSON.parse(row.value) as T })
        } catch {
          // ignore malformed json
        }
      }
      return results
    } catch (err) {
      console.warn('[Cloudflare D1] kvListByPrefix fallback to memory:', err)
    }
  }
  for (const [key, raw] of memoryKv.entries()) {
    if (key.startsWith(prefix)) {
      try {
        results.push({ key, value: JSON.parse(raw) as T })
      } catch {
        // ignore
      }
    }
  }
  return results
}

