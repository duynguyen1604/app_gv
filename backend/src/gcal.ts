import crypto from 'node:crypto'
import pool from './db.js'

const ENCRYPTION_SECRET =
  process.env.GCAL_TOKEN_SECRET ||
  process.env.GEMINI_API_KEY ||
  'app-gv-default-256-bit-secret-key-2026'

function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
}

export interface StoredOAuthTokens {
  access_token: string
  refresh_token?: string
  expiry_date?: number
  mode: 'oauth' | 'local_sandbox'
}

export function encryptTokenPayload(payload: StoredOAuthTokens): string {
  const iv = crypto.randomBytes(12)
  const key = getEncryptionKey()
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const json = JSON.stringify(payload)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptTokenPayload(cipherText: string): StoredOAuthTokens {
  const parts = cipherText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }
  const [ivHex, authTagHex, encryptedHex] = parts
  const key = getEncryptionKey()
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString('utf8')) as StoredOAuthTokens
}

export interface ResolvedGCalEvent {
  sessionKey: string
  title: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  location: string
  description: string
  colorId: string // Google Calendar colorId ('9' = blue, '6' = orange, '3' = purple, '7' = cyan)
  reminders: number[] // minutes before start
  contentHash: string
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map((n) => parseInt(n, 10) || 0)
  return h * 60 + m
}

function computeContentHash(ev: Omit<ResolvedGCalEvent, 'contentHash'>): string {
  const canonical = JSON.stringify({
    title: ev.title,
    date: ev.date,
    startTime: ev.startTime,
    endTime: ev.endTime,
    location: ev.location,
    description: ev.description,
    colorId: ev.colorId,
    reminders: [...ev.reminders].sort((a, b) => a - b),
  })
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const status = err?.status || err?.statusCode || 0
      const isRateLimitOrServer = status === 429 || status === 403 || status >= 500
      if (attempt < retries && isRateLimitOrServer) {
        const waitMs = baseDelayMs * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      throw err
    }
  }
  throw lastErr
}

function getVietnamTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd))
  return dt.toISOString().slice(0, 10)
}

function getIsoWeekdayFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = dt.getUTCDay()
  return day === 0 ? 7 : day
}

function getMondayOfDateStr(dateStr: string): string {
  const weekday = getIsoWeekdayFromDateStr(dateStr)
  return addDaysToDateStr(dateStr, -(weekday - 1))
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Resolves all actual teaching events for `userId` over the next `weeksAhead` weeks
 * following all rules in Mục 2.10 & Nhóm B:
 * - Holidays skipped
 * - School schedule filtered by `week_start` (only weeks that have school timetable data)
 * - Afternoon "Trực" merged into a single block 13:30–16:30 (duty_end_time)
 * - Cancelled exceptions skipped
 * - Moved exceptions placed at new_date / new_start / new_end
 * - Extra & makeup sessions included
 * - Consecutive sessions at different locations < 20 mins apart get travel reminder
 */
export async function resolveUserGCalEvents(userId: string): Promise<ResolvedGCalEvent[]> {
  const [
    settingsRes,
    classesRes,
    rulesRes,
    exRes,
    extraRes,
    periodsRes,
    schoolRes,
    weekCfgRes,
    holidaysRes,
    notesRes,
  ] = await Promise.all([
    pool.query('SELECT * FROM settings WHERE user_id = $1 LIMIT 1', [userId]),
    pool.query('SELECT * FROM classes WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM schedule_rules WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM session_exceptions WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM extra_sessions WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM school_periods WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM school_schedule WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM school_week_configs WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM holidays WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM session_notes WHERE user_id = $1', [userId]),
  ])

  const settings = settingsRes.rows[0] || {}
  const contentScope: 'school' | 'extra' | 'both' = settings.gcal_content || 'both'
  const weeksAhead = Math.max(1, Math.min(24, Number(settings.gcal_weeks_ahead) || 8))
  const showDuty = settings.show_duty_in_gcal !== false
  const dutyEndTime = String(settings.duty_end_time || '16:30')
  const travelReminderEnabled = settings.gcal_travel_reminder !== false

  const parseReminders = (val: unknown, fallback = [30]): number[] => {
    if (Array.isArray(val) && val.length > 0) {
      return val.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0)
    }
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        if (Array.isArray(parsed)) return parsed.map(Number)
      } catch {
        // ignore
      }
    }
    return fallback
  }

  const baseReminders = parseReminders(settings.gcal_reminders, [30])
  const schoolReminders = parseReminders(settings.gcal_school_reminders, baseReminders)
  const extraReminders = parseReminders(settings.gcal_extra_reminders, baseReminders)

  const classMap = new Map<string, any>()
  for (const c of classesRes.rows) {
    classMap.set(String(c.id), c)
  }

  const periodMap = new Map<string, { start_time: string; end_time: string }>()
  for (const p of periodsRes.rows) {
    periodMap.set(String(p.period_code).toUpperCase(), {
      start_time: String(p.start_time),
      end_time: String(p.end_time),
    })
  }

  const weekConfigMap = new Map<string, { afternoon_long_break: boolean; afternoon_long_break_minutes: number }>()
  for (const w of weekCfgRes.rows) {
    const wStr =
      w.week_start instanceof Date ? w.week_start.toISOString().slice(0, 10) : String(w.week_start || '').slice(0, 10)
    if (wStr) {
      weekConfigMap.set(wStr, {
        afternoon_long_break: Boolean(w.afternoon_long_break),
        afternoon_long_break_minutes: Number(w.afternoon_long_break_minutes) || 20,
      })
    }
  }

  const holidayMap = new Set<string>()
  for (const h of holidaysRes.rows) {
    const dStr =
      h.date instanceof Date ? h.date.toISOString().slice(0, 10) : String(h.date).slice(0, 10)
    holidayMap.add(dStr)
  }

  const noteLookup = new Map<string, string>()
  for (const n of notesRes.rows) {
    const dStr =
      n.date instanceof Date ? n.date.toISOString().slice(0, 10) : String(n.date).slice(0, 10)
    noteLookup.set(`${n.class_id}:${dStr}:${n.start_time}`, String(n.content || ''))
  }

  const toDateStr = (v: unknown): string => {
    if (!v) return ''
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    return String(v).slice(0, 10)
  }

  const todayStr = getVietnamTodayStr()
  const totalDays = weeksAhead * 7
  const endWindowStr = addDaysToDateStr(todayStr, totalDays)

  const rawByDate = new Map<string, Omit<ResolvedGCalEvent, 'contentHash'>[]>()
  const pushForDate = (dateStr: string, item: Omit<ResolvedGCalEvent, 'contentHash'>) => {
    const arr = rawByDate.get(dateStr) || []
    arr.push(item)
    rawByDate.set(dateStr, arr)
  }

  for (let offset = 0; offset < totalDays; offset++) {
    const dateStr = addDaysToDateStr(todayStr, offset)
    if (holidayMap.has(dateStr)) {
      continue // Ngày nghỉ không có sự kiện
    }
    const weekday = getIsoWeekdayFromDateStr(dateStr)
    const weekMonday = getMondayOfDateStr(dateStr)
    const weekCfg = weekConfigMap.get(weekMonday)

    // 1. School Schedule (Group B3: only for weeks that have school timetable data)
    if (contentScope === 'both' || contentScope === 'school') {
      const daySchoolRows = schoolRes.rows.filter((s) => {
        if (Number(s.weekday) !== weekday) return false
        const rowWeekStart = toDateStr(s.week_start)
        if (rowWeekStart) {
          return rowWeekStart === weekMonday
        }
        const vFrom = toDateStr(s.valid_from)
        const vTo = toDateStr(s.valid_to)
        if (vFrom && vFrom > dateStr) return false
        if (vTo && vTo < dateStr) return false
        return true
      })

      let afternoonDutyEmitted = false
      for (const s of daySchoolRows) {
        const cellType = String(s.cell_type || 'class')
        if (cellType === 'duty' && !showDuty) continue

        const pCode = String(s.period_code || s.period || 'S1').toUpperCase()
        const isAfternoon = pCode.startsWith('C') || String(s.session) === 'afternoon'
        const isDuty = cellType === 'duty'

        // Group B2: Afternoon "Trực" occupies the entire afternoon 13:30–dutyEndTime (default 16:30)
        if (isDuty && isAfternoon) {
          if (afternoonDutyEmitted) continue
          afternoonDutyEmitted = true
          const startTime = '13:30'
          const endTime = dutyEndTime
          const title = `[Trực] Trực chiều${s.subject ? ' - ' + s.subject : ''}`
          const location = s.room ? `Phòng ${s.room} - Trường` : 'Trường học'
          const noteText = String(s.note || '').trim()
          const descLines = [
            `Trực chiều (${startTime} - ${endTime})`,
            noteText ? `Ghi chú: ${noteText}` : '',
            'Tạo từ app - sửa trong app, không sửa ở đây',
          ].filter(Boolean)

          pushForDate(dateStr, {
            sessionKey: `duty-afternoon:${dateStr}`,
            title,
            date: dateStr,
            startTime,
            endTime,
            location,
            description: descLines.join('\n'),
            colorId: '7',
            reminders: [...schoolReminders],
          })
          continue
        }

        const matchedPeriod = periodMap.get(pCode)
        let startTime = matchedPeriod?.start_time || String(s.start_time || '07:00')
        let endTime = matchedPeriod?.end_time || String(s.end_time || '07:45')

        // Group B1: Shift C3..C5 if afternoon_long_break is enabled for this week
        if (weekCfg?.afternoon_long_break && ['C3', 'C4', 'C5'].includes(pCode)) {
          const shiftMins = weekCfg.afternoon_long_break_minutes || 20
          startTime = minutesToTime(timeToMinutes(startTime) + shiftMins)
          endTime = minutesToTime(timeToMinutes(endTime) + shiftMins)
        }

        const title = isDuty
          ? `[Trực] ${s.class_name || 'Trực trường'}${s.subject ? ' - ' + s.subject : ''}`
          : `[Trường] ${s.class_name}${s.subject ? ' - ' + s.subject : ''} (${pCode})`
        const location = s.room ? `Phòng ${s.room} - Trường` : 'Trường học'
        const noteText = String(s.note || '').trim()
        const descLines = [
          `Tiết ${pCode} (${startTime} - ${endTime})`,
          noteText ? `Ghi chú: ${noteText}` : '',
          'Tạo từ app - sửa trong app, không sửa ở đây',
        ].filter(Boolean)

        pushForDate(dateStr, {
          sessionKey: `school:${s.id}:${dateStr}:${pCode}`,
          title,
          date: dateStr,
          startTime,
          endTime,
          location,
          description: descLines.join('\n'),
          colorId: isDuty ? '7' : '9',
          reminders: [...schoolReminders],
        })
      }
    }

    // 2. Fixed Tutoring Rules
    if (contentScope === 'both' || contentScope === 'extra') {
      for (const r of rulesRes.rows) {
        if (Number(r.weekday) !== weekday) continue
        const vFrom = toDateStr(r.valid_from)
        const vTo = toDateStr(r.valid_to)
        if (vFrom && vFrom > dateStr) continue
        if (vTo && vTo < dateStr) continue

        const ex = exRes.rows.find(
          (e) => String(e.rule_id) === String(r.id) && toDateStr(e.original_date) === dateStr
        )
        if (ex && (ex.action === 'cancelled' || ex.action === 'moved')) {
          continue
        }

        const cls = classMap.get(String(r.class_id))
        if (!cls) continue
        const startTime = String(r.start_time)
        const endTime = String(r.end_time)
        const sessionNote = noteLookup.get(`${cls.id}:${dateStr}:${startTime}`) || ''
        const descLines = [
          sessionNote ? `Ghi chú buổi học: ${sessionNote}` : '',
          'Tạo từ app - sửa trong app, không sửa ở đây',
        ].filter(Boolean)

        pushForDate(dateStr, {
          sessionKey: `rule:${r.id}:${dateStr}`,
          title: `[Dạy thêm] ${cls.name}`,
          date: dateStr,
          startTime,
          endTime,
          location: String(cls.location || ''),
          description: descLines.join('\n'),
          colorId: '6', // Orange
          reminders: [...extraReminders],
        })
      }
    }
  }

  // 3. Moved Tutoring Sessions landing in window & Extra Sessions
  if (contentScope === 'both' || contentScope === 'extra') {
    for (const ex of exRes.rows) {
      if (ex.action !== 'moved') continue
      const newDate = toDateStr(ex.new_date)
      if (!newDate || newDate < todayStr || newDate >= endWindowStr) continue
      if (holidayMap.has(newDate)) continue

      const rule = rulesRes.rows.find((r) => String(r.id) === String(ex.rule_id))
      if (!rule) continue
      const cls = classMap.get(String(rule.class_id))
      if (!cls) continue

      const startTime = String(ex.new_start || rule.start_time)
      const endTime = String(ex.new_end || rule.end_time)
      const sessionNote = noteLookup.get(`${cls.id}:${newDate}:${startTime}`) || ''
      const descLines = [
        `Buổi dời từ ngày ${toDateStr(ex.original_date)}${ex.reason ? ` (${ex.reason})` : ''}`,
        sessionNote ? `Ghi chú buổi học: ${sessionNote}` : '',
        'Tạo từ app - sửa trong app, không sửa ở đây',
      ].filter(Boolean)

      pushForDate(newDate, {
        sessionKey: `rule:${rule.id}:${toDateStr(ex.original_date)}`,
        title: `[Dạy thêm] ${cls.name} (Đã dời)`,
        date: newDate,
        startTime,
        endTime,
        location: String(cls.location || ''),
        description: descLines.join('\n'),
        colorId: '6',
        reminders: [...extraReminders],
      })
    }

    for (const extra of extraRes.rows) {
      const dateStr = toDateStr(extra.date)
      if (!dateStr || dateStr < todayStr || dateStr >= endWindowStr) continue
      if (holidayMap.has(dateStr)) continue

      const cls = classMap.get(String(extra.class_id))
      if (!cls) continue
      const startTime = String(extra.start_time)
      const endTime = String(extra.end_time)
      const sessionNote = noteLookup.get(`${cls.id}:${dateStr}:${startTime}`) || ''
      const descLines = [
        extra.makeup_for ? `Dạy bù cho buổi nghỉ` : 'Buổi học phát sinh',
        extra.note ? `Ghi chú: ${extra.note}` : '',
        sessionNote ? `Ghi chú buổi học: ${sessionNote}` : '',
        'Tạo từ app - sửa trong app, không sửa ở đây',
      ].filter(Boolean)

      pushForDate(dateStr, {
        sessionKey: `extra:${extra.id}`,
        title: `[Phát sinh] ${cls.name}`,
        date: dateStr,
        startTime,
        endTime,
        location: String(cls.location || ''),
        description: descLines.join('\n'),
        colorId: '3', // Purple
        reminders: [...extraReminders],
      })
    }
  }

  // 4. Sort each day's events & apply Travel Buffer Check (< 20 minutes between different locations)
  const resolved: ResolvedGCalEvent[] = []
  const sortedDates = Array.from(rawByDate.keys()).sort()

  for (const dateStr of sortedDates) {
    const dayEvents = rawByDate.get(dateStr) || []
    dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime))

    for (let i = 0; i < dayEvents.length; i++) {
      const ev = dayEvents[i]
      if (travelReminderEnabled && i > 0) {
        const prev = dayEvents[i - 1]
        const prevLoc = prev.location.trim().toLowerCase()
        const currLoc = ev.location.trim().toLowerCase()
        if (prevLoc && currLoc && prevLoc !== currLoc) {
          const gapMinutes = timeToMinutes(ev.startTime) - timeToMinutes(prev.endTime)
          if (gapMinutes >= 0 && gapMinutes < 20) {
            ev.description = `⚠️ Đi sớm để kịp di chuyển (cách ca trước ${gapMinutes} phút từ ${prev.location})\n${ev.description}`
            const maxReminder = Math.max(...ev.reminders, 15)
            if (!ev.reminders.includes(maxReminder + 15)) {
              ev.reminders.push(maxReminder + 15)
            }
          }
        }
      }

      resolved.push({
        ...ev,
        contentHash: computeContentHash(ev),
      })
    }
  }

  return resolved
}

/**
 * Refresh access token using refresh_token if expired
 */
async function ensureValidAccessToken(
  userId: string,
  tokens: StoredOAuthTokens
): Promise<string | null> {
  if (tokens.mode === 'local_sandbox') {
    return null
  }
  const now = Date.now()
  if (tokens.access_token && (!tokens.expiry_date || tokens.expiry_date > now + 60_000)) {
    return tokens.access_token
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!tokens.refresh_token || !clientId || !clientSecret) {
    return tokens.access_token || null
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    const err: any = new Error(`OAuth token refresh failed (${resp.status}): ${errText}`)
    err.status = resp.status
    throw err
  }

  const data = (await resp.json()) as { access_token: string; expires_in?: number }
  const updated: StoredOAuthTokens = {
    ...tokens,
    access_token: data.access_token,
    expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
  }
  await pool.query(
    `UPDATE gcal_tokens SET encrypted_tokens = $1, token_expired = false, updated_at = NOW() WHERE user_id = $2`,
    [encryptTokenPayload(updated), userId]
  )
  return updated.access_token
}

/**
 * Ensures secondary calendar "Lịch dạy" exists on the user's Google Calendar account
 */
export async function ensureSecondaryTeachingCalendar(
  accessToken: string,
  existingCalendarId?: string
): Promise<string> {
  if (existingCalendarId && !existingCalendarId.startsWith('local-cal-')) {
    const checkResp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(existingCalendarId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    if (checkResp.ok) {
      return existingCalendarId
    }
  }

  const createResp = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: 'Lịch dạy',
      description: 'Lịch dạy trường và dạy thêm tự động đồng bộ một chiều từ ứng dụng Quản lý Lịch dạy.',
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
  })

  if (!createResp.ok) {
    const errText = await createResp.text()
    const err: any = new Error(`Failed to create secondary calendar 'Lịch dạy': ${errText}`)
    err.status = createResp.status
    throw err
  }

  const created = (await createResp.json()) as { id: string }
  return created.id
}

function toGoogleCalendarEventResource(ev: ResolvedGCalEvent) {
  return {
    summary: ev.title,
    location: ev.location || undefined,
    description: ev.description,
    colorId: ev.colorId,
    start: {
      dateTime: `${ev.date}T${ev.startTime}:00+07:00`,
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    end: {
      dateTime: `${ev.date}T${ev.endTime}:00+07:00`,
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    reminders: {
      useDefault: false,
      overrides: ev.reminders.map((minutes) => ({
        method: 'popup',
        minutes,
      })),
    },
  }
}

export interface GCalSyncResult {
  synced_at: string
  created: number
  updated: number
  deleted: number
  unchanged: number
  status: 'success' | 'partial' | 'error'
  error: string | null
  calendar_id: string
}

/**
 * Performs idempotent one-way sync to Google Calendar for `userId`.
 * Compares resolved events against `calendar_event_map` using `content_hash`.
 */
export async function syncUserGoogleCalendar(
  userId: string,
  options: { forceEvenIfDisabled?: boolean } = {}
): Promise<GCalSyncResult> {
  const syncedAt = new Date().toISOString()
  let created = 0
  let updated = 0
  let deleted = 0
  let unchanged = 0
  const errors: string[] = []

  const [settingsRes, tokenRes, existingMapRes] = await Promise.all([
    pool.query('SELECT * FROM settings WHERE user_id = $1 LIMIT 1', [userId]),
    pool.query('SELECT * FROM gcal_tokens WHERE user_id = $1 LIMIT 1', [userId]),
    pool.query('SELECT * FROM calendar_event_map WHERE user_id = $1', [userId]),
  ])

  const settings = settingsRes.rows[0] || {}
  const tokenRow = tokenRes.rows[0]

  if (!tokenRow && !settings.gcal_connected) {
    throw new Error('Chưa kết nối Google Calendar. Hãy bấm "Kết nối Google Calendar" trước.')
  }

  if (!options.forceEvenIfDisabled && settings.gcal_enabled === false) {
    return {
      synced_at: syncedAt,
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: existingMapRes.rows.length,
      status: 'success',
      error: null,
      calendar_id: settings.gcal_calendar_id || tokenRow?.calendar_id || 'local-cal-lich-day',
    }
  }

  let storedTokens: StoredOAuthTokens = {
    access_token: '',
    mode: 'local_sandbox',
  }
  if (tokenRow?.encrypted_tokens) {
    try {
      storedTokens = decryptTokenPayload(tokenRow.encrypted_tokens)
    } catch {
      storedTokens = { access_token: '', mode: 'local_sandbox' }
    }
  }

  let accessToken: string | null = null
  let calendarId = String(tokenRow?.calendar_id || settings.gcal_calendar_id || 'local-cal-lich-day')

  try {
    accessToken = await ensureValidAccessToken(userId, storedTokens)
    if (accessToken) {
      calendarId = await ensureSecondaryTeachingCalendar(accessToken, calendarId)
      await pool.query(
        `UPDATE settings SET gcal_calendar_id = $1, gcal_token_expired = false WHERE user_id = $2`,
        [calendarId, userId]
      )
      await pool.query(
        `UPDATE gcal_tokens SET calendar_id = $1, token_expired = false WHERE user_id = $2`,
        [calendarId, userId]
      )
    }
  } catch (authErr: any) {
    const status = authErr?.status || 0
    if (status === 401 || status === 403 || String(authErr?.message).includes('invalid_grant')) {
      await pool.query(
        `UPDATE settings SET gcal_token_expired = true WHERE user_id = $1`,
        [userId]
      )
      await pool.query(
        `UPDATE gcal_tokens SET token_expired = true WHERE user_id = $1`,
        [userId]
      )
      const expiredMsg = 'Quyền truy cập Google Calendar đã hết hạn. Cần kết nối lại.'
      await pool.query(
        `INSERT INTO calendar_sync_log (id, synced_at, created, updated, deleted, status, error, user_id)
         VALUES ($1, $2, 0, 0, 0, 'error', $3, $4)`,
        [`synclog-${Date.now()}`, syncedAt, expiredMsg, userId]
      )
      throw new Error(expiredMsg)
    }
    throw authErr
  }

  const desiredEvents = await resolveUserGCalEvents(userId)
  const desiredByKey = new Map<string, ResolvedGCalEvent>()
  for (const ev of desiredEvents) {
    desiredByKey.set(ev.sessionKey, ev)
  }

  const existingByKey = new Map<
    string,
    { id: string; session_key: string; google_event_id: string; content_hash: string }
  >()
  for (const row of existingMapRes.rows) {
    existingByKey.set(String(row.session_key), {
      id: String(row.id),
      session_key: String(row.session_key),
      google_event_id: String(row.google_event_id),
      content_hash: String(row.content_hash),
    })
  }

  // 1. Delete events that are no longer in desiredEvents (cancelled, moved away, or outside window)
  for (const [sessionKey, existing] of existingByKey.entries()) {
    if (!desiredByKey.has(sessionKey)) {
      try {
        if (accessToken && !existing.google_event_id.startsWith('gcal-sim-')) {
          await retryWithBackoff(async () => {
            const resp = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                calendarId
              )}/events/${encodeURIComponent(existing.google_event_id)}`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            )
            if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
              const e: any = new Error(`Delete event failed (${resp.status})`)
              e.status = resp.status
              throw e
            }
          })
        }
        await pool.query('DELETE FROM calendar_event_map WHERE id = $1 AND user_id = $2', [
          existing.id,
          userId,
        ])
        deleted++
      } catch (err: any) {
        errors.push(`Xóa ${sessionKey}: ${err?.message || err}`)
      }
    }
  }

  // 2. Create or update desired events
  for (const [sessionKey, ev] of desiredByKey.entries()) {
    const existing = existingByKey.get(sessionKey)
    if (!existing) {
      // CREATE
      try {
        let googleEventId = `gcal-sim-${crypto.randomBytes(6).toString('hex')}`
        if (accessToken) {
          const createdData = await retryWithBackoff(async () => {
            const resp = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                calendarId
              )}/events`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(toGoogleCalendarEventResource(ev)),
              }
            )
            if (!resp.ok) {
              const e: any = new Error(`Create event failed (${resp.status})`)
              e.status = resp.status
              throw e
            }
            return (await resp.json()) as { id: string }
          })
          googleEventId = createdData.id
        }

        await pool.query(
          `INSERT INTO calendar_event_map (id, session_key, google_event_id, content_hash, last_synced_at, user_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, session_key) DO UPDATE SET
             google_event_id = EXCLUDED.google_event_id,
             content_hash = EXCLUDED.content_hash,
             last_synced_at = EXCLUDED.last_synced_at`,
          [
            `evmap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sessionKey,
            googleEventId,
            ev.contentHash,
            syncedAt,
            userId,
          ]
        )
        created++
      } catch (err: any) {
        errors.push(`Tạo ${ev.title} (${ev.date}): ${err?.message || err}`)
      }
    } else if (existing.content_hash !== ev.contentHash) {
      // UPDATE (content changed)
      try {
        if (accessToken && !existing.google_event_id.startsWith('gcal-sim-')) {
          await retryWithBackoff(async () => {
            const resp = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                calendarId
              )}/events/${encodeURIComponent(existing.google_event_id)}`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(toGoogleCalendarEventResource(ev)),
              }
            )
            if (!resp.ok) {
              const e: any = new Error(`Update event failed (${resp.status})`)
              e.status = resp.status
              throw e
            }
          })
        }

        await pool.query(
          `UPDATE calendar_event_map
           SET content_hash = $1, last_synced_at = $2
           WHERE id = $3 AND user_id = $4`,
          [ev.contentHash, syncedAt, existing.id, userId]
        )
        updated++
      } catch (err: any) {
        errors.push(`Cập nhật ${ev.title} (${ev.date}): ${err?.message || err}`)
      }
    } else {
      unchanged++
    }
  }

  const status: 'success' | 'partial' | 'error' =
    errors.length === 0
      ? 'success'
      : created + updated + deleted > 0
      ? 'partial'
      : 'error'
  const errorStr = errors.length > 0 ? errors.slice(0, 3).join('; ') : null

  await pool.query(
    `INSERT INTO calendar_sync_log (id, synced_at, created, updated, deleted, status, error, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      `synclog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      syncedAt,
      created,
      updated,
      deleted,
      status,
      errorStr,
      userId,
    ]
  )

  return {
    synced_at: syncedAt,
    created,
    updated,
    deleted,
    unchanged,
    status,
    error: errorStr,
    calendar_id: calendarId,
  }
}

/**
 * Deletes all synced events from Google Calendar and clears `calendar_event_map`
 */
export async function clearAllSyncedGCalEvents(userId: string): Promise<{ deleted: number }> {
  const [tokenRes, mapRes, settingsRes] = await Promise.all([
    pool.query('SELECT * FROM gcal_tokens WHERE user_id = $1 LIMIT 1', [userId]),
    pool.query('SELECT * FROM calendar_event_map WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM settings WHERE user_id = $1 LIMIT 1', [userId]),
  ])

  const tokenRow = tokenRes.rows[0]
  const settings = settingsRes.rows[0] || {}
  const calendarId = String(tokenRow?.calendar_id || settings.gcal_calendar_id || 'local-cal-lich-day')

  let accessToken: string | null = null
  if (tokenRow?.encrypted_tokens) {
    try {
      const tokens = decryptTokenPayload(tokenRow.encrypted_tokens)
      accessToken = await ensureValidAccessToken(userId, tokens)
    } catch {
      accessToken = null
    }
  }

  let deleted = 0
  for (const row of mapRes.rows) {
    const gId = String(row.google_event_id)
    if (accessToken && !gId.startsWith('gcal-sim-')) {
      try {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events/${encodeURIComponent(gId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        )
      } catch {
        // Ignore individual delete failure during clear
      }
    }
    deleted++
  }

  await pool.query('DELETE FROM calendar_event_map WHERE user_id = $1', [userId])

  await pool.query(
    `INSERT INTO calendar_sync_log (id, synced_at, created, updated, deleted, status, error, user_id)
     VALUES ($1, NOW(), 0, 0, $2, 'success', NULL, $3)`,
    [`synclog-${Date.now()}`, deleted, userId]
  )

  return { deleted }
}

/**
 * Connects Google Calendar for `userId` (either with an OAuth access token or local/sandbox mode)
 * and creates the dedicated "Lịch dạy" calendar.
 */
export async function connectUserGoogleCalendar(
  userId: string,
  params: {
    accessToken?: string
    refreshToken?: string
    accountEmail?: string
  }
): Promise<{
  connected: boolean
  calendar_id: string
  account_email: string
  mode: 'oauth' | 'local_sandbox'
  initialSync: GCalSyncResult
}> {
  const hasRealToken = Boolean(params.accessToken && params.accessToken.trim())
  const mode: 'oauth' | 'local_sandbox' = hasRealToken ? 'oauth' : 'local_sandbox'

  let calendarId = `local-cal-lich-day-${userId}`
  let accountEmail = params.accountEmail?.trim() || 'giaovien@gmail.com'

  if (hasRealToken && params.accessToken) {
    calendarId = await ensureSecondaryTeachingCalendar(params.accessToken.trim())
  }

  const encrypted = encryptTokenPayload({
    access_token: params.accessToken?.trim() || 'sandbox-token',
    refresh_token: params.refreshToken?.trim(),
    expiry_date: Date.now() + 3600 * 1000,
    mode,
  })

  await pool.query(
    `INSERT INTO gcal_tokens (user_id, encrypted_tokens, calendar_id, account_email, mode, token_expired, updated_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       encrypted_tokens = EXCLUDED.encrypted_tokens,
       calendar_id = EXCLUDED.calendar_id,
       account_email = EXCLUDED.account_email,
       mode = EXCLUDED.mode,
       token_expired = false,
       updated_at = NOW()`,
    [userId, encrypted, calendarId, accountEmail, mode]
  )

  await pool.query(
    `UPDATE settings
     SET gcal_connected = true,
         gcal_enabled = true,
         gcal_calendar_id = $1,
         gcal_account_email = $2,
         gcal_token_expired = false
     WHERE user_id = $3`,
    [calendarId, accountEmail, userId]
  )

  const initialSync = await syncUserGoogleCalendar(userId, { forceEvenIfDisabled: true })

  return {
    connected: true,
    calendar_id: calendarId,
    account_email: accountEmail,
    mode,
    initialSync,
  }
}

/**
 * Disconnects Google Calendar for `userId`
 */
export async function disconnectUserGoogleCalendar(userId: string): Promise<void> {
  await pool.query('DELETE FROM gcal_tokens WHERE user_id = $1', [userId])
  await pool.query(
    `UPDATE settings
     SET gcal_connected = false,
         gcal_enabled = false,
         gcal_token_expired = false
     WHERE user_id = $1`,
    [userId]
  )
}

/**
 * Builds a standard RFC 5545 iCalendar (.ics) feed for read-only subscription (secondary option)
 */
export async function buildUserIcsFeed(userId: string): Promise<string> {
  const events = await resolveUserGCalEvents(userId)
  const nowUtc = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const escapeIcs = (str: string) =>
    (str || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n')

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuanLyLichDay//LichDayApp//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lịch dạy',
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
  ]

  for (const ev of events) {
    const dtStart = `${ev.date.replace(/-/g, '')}T${ev.startTime.replace(/:/g, '')}00`
    const dtEnd = `${ev.date.replace(/-/g, '')}T${ev.endTime.replace(/:/g, '')}00`
    const uid = `${ev.sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}@lichday.app`

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${nowUtc}`)
    lines.push(`DTSTART;TZID=Asia/Ho_Chi_Minh:${dtStart}`)
    lines.push(`DTEND;TZID=Asia/Ho_Chi_Minh:${dtEnd}`)
    lines.push(`SUMMARY:${escapeIcs(ev.title)}`)
    if (ev.location) {
      lines.push(`LOCATION:${escapeIcs(ev.location)}`)
    }
    lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

// Debounced background sync triggers per user (runs 3.5s after last schedule change)
const debounceTimers = new Map<string, NodeJS.Timeout>()

export function debounceTriggerGCalSync(userId: string, delayMs = 3500): void {
  const prev = debounceTimers.get(userId)
  if (prev) clearTimeout(prev)

  const timer = setTimeout(async () => {
    debounceTimers.delete(userId)
    try {
      const res = await pool.query(
        'SELECT gcal_connected, gcal_enabled FROM settings WHERE user_id = $1 LIMIT 1',
        [userId]
      )
      const row = res.rows[0]
      if (row?.gcal_connected && row?.gcal_enabled) {
        await syncUserGoogleCalendar(userId)
      }
    } catch (err) {
      console.warn(`[GCAL] Background sync skipped/failed for user ${userId}:`, err)
    }
  }, delayMs)

  debounceTimers.set(userId, timer)
}

