// ============================================================================
// CLOUDFLARE PAGES FUNCTIONS & WORKERS EDGE API (/api/*)
// Chạy trực tiếp trên mạng lưới Cloudflare Edge (0ms cold start - Không bao giờ ngủ)
// Hỗ trợ lưu trữ vĩnh viễn trên Cloudflare D1 (binding: DB)
// ============================================================================

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run(): Promise<{ success: boolean }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<unknown>
}

export interface Env {
  DB?: D1Database
  ADMIN_EMAIL?: string
  DEFAULT_ADMIN_EMAIL?: string
  DEFAULT_ADMIN_PASSWORD?: string
  DEFAULT_ADMIN_NAME?: string
  DEFAULT_TEACHER_EMAIL?: string
  DEFAULT_TEACHER_PASSWORD?: string
  DEFAULT_TEACHER_NAME?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_AUTH_REDIRECT_URI?: string
  GEMINI_API_KEY?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  CRON_SECRET?: string
  FRONTEND_ORIGIN?: string
}

export interface PagesContext {
  request: Request
  env: Env
  params: Record<string, string | string[]>
  waitUntil: (promise: Promise<unknown>) => void
}

// Bộ nhớ dự phòng trong trường hợp người dùng chưa kịp gắn D1 Database
const memoryKv = new Map<string, string>()
let d1Initialized = false

async function ensureD1Table(db?: D1Database): Promise<void> {
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

async function kvGet<T>(db: D1Database | undefined, key: string): Promise<T | null> {
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

async function kvSet(db: D1Database | undefined, key: string, value: unknown): Promise<void> {
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

async function kvListByPrefix<T>(
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

// ============================================================================
// CRYPTO HELPERS (Web Crypto API chuẩn cho Cloudflare Edge V8 Runtime)
// ============================================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomHex(5)}`
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

async function hashPassword(password: string, existingSalt?: string): Promise<string> {
  const salt = existingSalt || randomHex(16)
  const hash = await sha256Hex(`gv_edge_pw_v1:${salt}:${password}`)
  return `edge_sha256$${salt}$${hash}`
}

async function verifyPassword(password: string, storedHash?: string): Promise<boolean> {
  if (!storedHash) return false
  if (storedHash.startsWith('edge_sha256$')) {
    const parts = storedHash.split('$')
    if (parts.length !== 3) return false
    const salt = parts[1]
    const expected = await hashPassword(password, salt)
    return expected === storedHash
  }
  return false
}

// ============================================================================
// TYPES & AUTH STORE MODEL (Khớp 100% với frontend/src/types/index.ts & supabase.ts)
// ============================================================================

type AccountRole = 'admin' | 'teacher'
type AccountStatus = 'pending' | 'active' | 'locked'
type RegistrationMode = 'pending_approval' | 'open' | 'invite_only'

interface UserProfile {
  id: string
  full_name: string
  email: string
  phone: string | null
  school: string | null
  avatar_url?: string | null
  role: AccountRole
  status: AccountStatus
  email_verified: boolean
  auth_provider?: 'email' | 'google' | 'both'
  onboarding_completed?: boolean
  created_at: string
  approved_by: string | null
  approved_at: string | null
  last_login_at: string | null
  locked_reason: string | null
}

interface StoredUser extends UserProfile {
  password_hash?: string
  google_sub?: string
  token_version?: number
}

interface AuthSessionRecord {
  token_hash: string
  user_id: string
  remember_me: boolean
  created_at: string
  expires_at: number
  user_agent?: string
}

interface OneTimeTokenRecord {
  id: string
  token_hash: string
  user_id: string
  email: string
  purpose: 'verify_email' | 'reset_password'
  created_at: string
  expires_at: number
  used_at?: string | null
}

interface InviteRecord {
  id: string
  email: string | null
  code: string
  max_uses: number
  used_count: number
  expires_at: string | null
  created_by: string | null
  created_at: string
  revoked: boolean
}

interface AuditLogRecord {
  id: string
  actor_id: string | null
  target_id: string | null
  actor_name?: string | null
  actor_email?: string | null
  target_name?: string | null
  target_email?: string | null
  action: string
  detail: Record<string, unknown>
  ip_masked: string
  created_at: string
}

interface AppSettingsRecord {
  id: string
  registration_mode: RegistrationMode
  google_login_enabled: boolean
  password_login_enabled: boolean
  notify_admin_email: boolean
  max_accounts: number | null
  updated_at: string
}

interface AuthStoreData {
  version: number
  users: StoredUser[]
  sessions: AuthSessionRecord[]
  tokens: OneTimeTokenRecord[]
  invites: InviteRecord[]
  auditLogs: AuditLogRecord[]
  appSettings: AppSettingsRecord
}

const AUTH_STORE_KEY = 'v3_clean_auth_store'
const SUPPORT_TICKETS_KEY = 'v3_clean_support_tickets'

interface SupportTicketMessage {
  id: string
  sender_role: 'user' | 'admin'
  sender_name: string
  text: string
  created_at: string
}

interface SupportTicketRecord {
  id: string
  user_id: string
  user_email: string
  user_name: string
  category: 'support' | 'complaint' | 'bug' | 'account'
  subject: string
  status: 'open' | 'replied' | 'resolved'
  messages: SupportTicketMessage[]
  created_at: string
  updated_at: string
}

async function loadSupportTickets(env: Env): Promise<SupportTicketRecord[]> {
  const list = await kvGet<SupportTicketRecord[]>(env.DB, SUPPORT_TICKETS_KEY)
  return Array.isArray(list) ? list : []
}

async function saveSupportTickets(env: Env, tickets: SupportTicketRecord[]): Promise<void> {
  await kvSet(env.DB, SUPPORT_TICKETS_KEY, tickets.slice(0, 500))
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

function getAdminEmail(env: Env): string {
  return normalizeEmail(env.ADMIN_EMAIL || env.DEFAULT_ADMIN_EMAIL || '')
}

function toPublicProfile(user: StoredUser): UserProfile {
  const rawStatus = String(user.status || 'active')
  const normalizedStatus: AccountStatus =
    rawStatus === 'approved' || rawStatus === 'active'
      ? 'active'
      : rawStatus === 'locked'
        ? 'locked'
        : 'pending'
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone || null,
    school: user.school || null,
    avatar_url: user.avatar_url || null,
    role: user.role === 'admin' ? 'admin' : 'teacher',
    status: normalizedStatus,
    email_verified: user.email_verified !== false,
    auth_provider: user.auth_provider || 'email',
    // Tài khoản cũ (chưa có trường onboarding_completed) mặc định là true (đã xem); chỉ tài khoản mới tạo mới có false
    onboarding_completed: user.onboarding_completed !== false,
    created_at: user.created_at,
    approved_by: user.approved_by || null,
    approved_at: user.approved_at || null,
    last_login_at: user.last_login_at || null,
    locked_reason: user.locked_reason || null,
  }
}

function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) return 'Mật khẩu phải có tối thiểu 8 ký tự.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Mật khẩu phải bao gồm cả chữ cái và chữ số.'
  }
  return null
}

async function loadAuthStore(env: Env): Promise<AuthStoreData> {
  const nowIso = new Date().toISOString()
  const adminEmail = getAdminEmail(env)
  const adminPassword = String(env.DEFAULT_ADMIN_PASSWORD || '').trim()
  const adminName = env.DEFAULT_ADMIN_NAME || 'Quản trị viên Hệ thống'

  const teacherEmail = normalizeEmail(env.DEFAULT_TEACHER_EMAIL || '')
  const teacherPassword = String(env.DEFAULT_TEACHER_PASSWORD || '').trim()
  const teacherName = env.DEFAULT_TEACHER_NAME || 'Giáo viên'

  let store = await kvGet<AuthStoreData>(env.DB, AUTH_STORE_KEY)
  let dirty = false

  if (!store || !Array.isArray(store.users)) {
    store = {
      version: 2,
      users: [],
      sessions: [],
      tokens: [],
      invites: [],
      auditLogs: [],
      appSettings: {
        id: 'global',
        registration_mode: 'pending_approval',
        google_login_enabled: true,
        password_login_enabled: true,
        notify_admin_email: true,
        max_accounts: null,
        updated_at: nowIso,
      },
    }
    dirty = true
  } else {
    if (!Array.isArray(store.sessions)) { store.sessions = []; dirty = true }
    if (!Array.isArray(store.tokens)) { store.tokens = []; dirty = true }
    if (!Array.isArray(store.invites)) { store.invites = []; dirty = true }
    if (!Array.isArray(store.auditLogs)) { store.auditLogs = []; dirty = true }
    if (pruneAuditLogsLast30Days(store)) { dirty = true }
  }

  // Xóa tài khoản mẫu chờ duyệt (choduyet@lichday.vn) và tài khoản admin mặc định cũ (admin@lichday.vn) nếu không cấu hình lại bằng env
  const beforeLen = store.users.length
  const legacyAdminIds = new Set(
    store.users
      .filter(
        (u) =>
          normalizeEmail(u.email) === 'choduyet@lichday.vn' ||
          (adminEmail !== 'admin@lichday.vn' && normalizeEmail(u.email) === 'admin@lichday.vn')
      )
      .map((u) => u.id)
  )
  if (legacyAdminIds.size > 0) {
    store.users = store.users.filter((u) => !legacyAdminIds.has(u.id))
    store.sessions = store.sessions.filter((s) => !legacyAdminIds.has(s.user_id))
    if (store.users.length !== beforeLen) dirty = true
  }

  // Chuẩn hóa status cũ ('approved' -> 'active') và loại bỏ trùng lặp email nếu có
  const seenEmails = new Set<string>()
  const dedupedUsers: StoredUser[] = []
  for (const u of store.users) {
    if ((u.status as string) === 'approved') {
      u.status = 'active'
      dirty = true
    }
    const norm = normalizeEmail(u.email)
    if (norm && seenEmails.has(norm)) {
      dirty = true
      continue
    }
    if (norm) seenEmails.add(norm)
    dedupedUsers.push(u)
  }
  if (dedupedUsers.length !== store.users.length) {
    store.users = dedupedUsers
    dirty = true
  }

  // 1. Đảm bảo tài khoản Admin (tự động cấp quyền admin cho ADMIN_EMAIL nếu đã tồn tại, hoặc khởi tạo mới nếu có thêm DEFAULT_ADMIN_PASSWORD)
  let adminUser = adminEmail
    ? store.users.find((u) => normalizeEmail(u.email) === adminEmail)
    : undefined
  if (adminEmail && adminUser) {
    if (adminUser.role !== 'admin') {
      adminUser.role = 'admin'
      dirty = true
    }
    if (adminUser.status !== 'active') {
      adminUser.status = 'active'
      dirty = true
    }
    if (!adminUser.email_verified) {
      adminUser.email_verified = true
      dirty = true
    }
  }
  if (adminEmail && adminPassword) {
    if (!adminUser) {
      adminUser = {
        id: '00000000-0000-0000-0000-000000000001',
        email: adminEmail,
        full_name: adminName,
        phone: null,
        school: 'Ban Quản trị Hệ thống',
        role: 'admin',
        status: 'active',
        email_verified: true,
        auth_provider: 'email',
        created_at: nowIso,
        approved_at: nowIso,
        approved_by: 'SYSTEM',
        last_login_at: null,
        locked_reason: null,
        password_hash: await hashPassword(adminPassword),
        token_version: 1,
      }
      store.users.unshift(adminUser)
      dirty = true
    } else if (!adminUser.password_hash || !adminUser.password_hash.startsWith('edge_sha256$')) {
      adminUser.password_hash = await hashPassword(adminPassword)
      adminUser.status = 'active'
      adminUser.email_verified = true
      adminUser.role = 'admin'
      dirty = true
    }
  }

  // 2. Tài khoản Giáo viên mẫu (chỉ khởi tạo nếu có đủ DEFAULT_TEACHER_EMAIL và DEFAULT_TEACHER_PASSWORD trong env)
  if (teacherEmail && teacherPassword) {
    let teacherUser = store.users.find((u) => normalizeEmail(u.email) === teacherEmail)
    if (!teacherUser) {
      teacherUser = {
        id: '00000000-0000-0000-0000-000000000002',
        email: teacherEmail,
        full_name: teacherName,
        phone: null,
        school: 'Trường THCS & THPT',
        role: 'teacher',
        status: 'active',
        email_verified: true,
        auth_provider: 'email',
        created_at: nowIso,
        approved_at: nowIso,
        approved_by: adminUser?.id || 'SYSTEM',
        last_login_at: null,
        locked_reason: null,
        password_hash: await hashPassword(teacherPassword),
        token_version: 1,
      }
      store.users.push(teacherUser)
      dirty = true
    } else if (!teacherUser.password_hash || !teacherUser.password_hash.startsWith('edge_sha256$')) {
      teacherUser.password_hash = await hashPassword(teacherPassword)
      teacherUser.status = 'active'
      teacherUser.email_verified = true
      dirty = true
    }
  }

  if (dirty) {
    await kvSet(env.DB, AUTH_STORE_KEY, store)
  }

  return store
}

async function saveAuthStore(env: Env, store: AuthStoreData): Promise<void> {
  await kvSet(env.DB, AUTH_STORE_KEY, store)
}

const AUDIT_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function pruneAuditLogsLast30Days(store: AuthStoreData): boolean {
  if (!Array.isArray(store.auditLogs) || store.auditLogs.length === 0) return false
  const cutoff = Date.now() - AUDIT_LOG_RETENTION_MS
  const filtered = store.auditLogs
    .filter((entry) => {
      const ts = new Date(entry.created_at).getTime()
      return Number.isFinite(ts) && ts >= cutoff
    })
    .slice(0, 1000)
  if (filtered.length !== store.auditLogs.length) {
    store.auditLogs = filtered
    return true
  }
  return false
}

function appendAuditLog(
  store: AuthStoreData,
  params: {
    actor_id: string | null
    actor_email?: string | null
    actor_name?: string | null
    target_id?: string | null
    target_email?: string | null
    target_name?: string | null
    action: string
    detail?: Record<string, unknown>
  }
) {
  store.auditLogs.unshift({
    id: generateId('audit'),
    actor_id: params.actor_id,
    actor_email: params.actor_email || null,
    actor_name: params.actor_name || null,
    target_id: params.target_id || null,
    target_email: params.target_email || null,
    target_name: params.target_name || null,
    action: params.action,
    detail: params.detail || {},
    ip_masked: 'cloudflare.edge',
    created_at: new Date().toISOString(),
  })
  pruneAuditLogsLast30Days(store)
}

async function createSession(
  store: AuthStoreData,
  userId: string,
  rememberMe: boolean,
  userAgent?: string
): Promise<{ sessionToken: string; expiresAt: number }> {
  const rawToken = `gvs_${randomHex(24)}`
  const tokenHash = await sha256Hex(rawToken)
  const days = rememberMe ? 90 : 2
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000

  store.sessions = store.sessions.filter((s) => s.expires_at > Date.now())
  store.sessions.push({
    token_hash: tokenHash,
    user_id: userId,
    remember_me: rememberMe,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    user_agent: userAgent,
  })

  return { sessionToken: rawToken, expiresAt }
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return null
}

async function getAuthenticatedUser(
  req: Request,
  store: AuthStoreData
): Promise<{ user: StoredUser; tokenHash: string; session: AuthSessionRecord } | null> {
  const rawToken = extractBearerToken(req)
  if (!rawToken) return null
  const tokenHash = await sha256Hex(rawToken)
  const session = store.sessions.find((s) => s.token_hash === tokenHash && s.expires_at > Date.now())
  if (!session) return null
  const user = store.users.find((u) => u.id === session.user_id)
  if (!user) return null
  return { user, tokenHash, session }
}

// ============================================================================
// SYNC STATE MODEL (Lưu lịch dạy, lớp học, học sinh, điểm danh, học phí trên D1)
// ============================================================================

interface ServerState {
  classes: unknown[]
  students: unknown[]
  studentEnrollments: unknown[]
  studentStatusHistory: unknown[]
  sessionGuests: unknown[]
  scheduleRules: unknown[]
  sessionExceptions: unknown[]
  extraSessions: unknown[]
  schoolPeriods: unknown[]
  schoolSchedule: unknown[]
  schoolWeekConfigs: unknown[]
  holidays: unknown[]
  sessionNotes: unknown[]
  attendance: unknown[]
  payments: unknown[]
  paymentTransactions: unknown[]
  monthLocks: unknown[]
  changeLogs: unknown[]
  calendarEventMap: unknown[]
  calendarSyncLogs: unknown[]
  settings: Record<string, unknown> | null
  notificationLogs: unknown[]
}

function emptyServerState(): ServerState {
  return {
    classes: [],
    students: [],
    studentEnrollments: [],
    studentStatusHistory: [],
    sessionGuests: [],
    scheduleRules: [],
    sessionExceptions: [],
    extraSessions: [],
    schoolPeriods: [],
    schoolSchedule: [],
    schoolWeekConfigs: [],
    holidays: [],
    sessionNotes: [],
    attendance: [],
    payments: [],
    paymentTransactions: [],
    monthLocks: [],
    changeLogs: [],
    calendarEventMap: [],
    calendarSyncLogs: [],
    settings: null,
    notificationLogs: [],
  }
}

function syncKeyForUser(userId: string): string {
  const clean = String(userId || '').trim()
  return `v3_clean_sync_state:${clean}`
}

// ============================================================================
// VIETNAMESE ZALO PARSER
// ============================================================================

function parseZaloRuleBased(text: string) {
  const lower = text.toLowerCase()
  let intent: 'reschedule' | 'leave' | 'extra' | 'general_note' = 'general_note'
  if (/(nghỉ|xin phép nghỉ|vắng|bận|ốm|hoãn|hủy)/.test(lower)) {
    intent = 'leave'
  }
  if (/(đổi lịch|dời|chuyển sang|bù|học bù|dạy bù)/.test(lower)) {
    intent = 'reschedule'
  }
  if (/(tăng cường|thêm buổi|ca phụ|bổ trợ)/.test(lower)) {
    intent = 'extra'
  }

  const timeMatch = text.match(/(\d{1,2})[h:](\d{2})?/)
  const suggestedTime = timeMatch
    ? `${timeMatch[1].padStart(2, '0')}:${(timeMatch[2] || '00').padStart(2, '0')}`
    : undefined

  return {
    intent,
    confidence: 0.85,
    summary: text.trim().slice(0, 140),
    suggested_time: suggestedTime,
  }
}

// ============================================================================
// DAILY SCHEDULE EMAIL HELPERS (RESEND + CRON)
// ============================================================================

interface DailyEmailItem {
  type: string
  title: string
  time: string
  location?: string
  period_code?: string
  session_group?: string
  spans_to_group?: string
}

function getVietnamDateInfo(): {
  dateStr: string
  displayDate: string
  hour: number
  minute: number
  weekday: number
} {
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000)
  const y = vnNow.getUTCFullYear()
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, '0')
  const d = String(vnNow.getUTCDate()).padStart(2, '0')
  const jsDay = vnNow.getUTCDay()
  const weekday = jsDay === 0 ? 7 : jsDay
  return {
    dateStr: `${y}-${m}-${d}`,
    displayDate: `${d}/${m}/${y}`,
    hour: vnNow.getUTCHours(),
    minute: vnNow.getUTCMinutes(),
    weekday,
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const FALLBACK_SCHOOL_PERIODS: Array<{ code: string; start_time: string; end_time: string }> = [
  { code: 'S1', start_time: '07:00', end_time: '07:45' },
  { code: 'S2', start_time: '07:55', end_time: '08:40' },
  { code: 'S3', start_time: '09:05', end_time: '09:50' },
  { code: 'S4', start_time: '10:00', end_time: '10:45' },
  { code: 'S5', start_time: '10:55', end_time: '11:40' },
  { code: 'C1', start_time: '14:00', end_time: '14:45' },
  { code: 'C2', start_time: '14:55', end_time: '15:40' },
  { code: 'C3', start_time: '16:00', end_time: '16:45' },
  { code: 'C4', start_time: '16:55', end_time: '17:40' },
  { code: 'C5', start_time: '17:50', end_time: '18:35' },
]

function getMondayOfDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => Number(n))
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  const jsDay = dt.getUTCDay() // 0=Sun, 1=Mon..6=Sat
  const diff = jsDay === 0 ? -6 : 1 - jsDay
  dt.setUTCDate(dt.getUTCDate() + diff)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function isWithinDateRange(dateStr: string, validFrom?: string | null, validTo?: string | null): boolean {
  if (validFrom && dateStr < validFrom) return false
  if (validTo && dateStr > validTo) return false
  return true
}

function computeDailyEmailItemsForState(
  state: ServerState,
  dateStr: string,
  weekday: number,
): DailyEmailItem[] {
  const settings = (state.settings || {}) as Record<string, any>
  const notifyContent = settings.notify_content || 'both'
  const showDuty = settings.show_duty_in_email !== false
  const weekMonday = getMondayOfDateStr(dateStr)

  const holidays: any[] = Array.isArray(state.holidays) ? state.holidays : []
  const isHoliday = holidays.some((h) => h.date === dateStr)

  const items: DailyEmailItem[] = []

  // 1. Lịch trường học (schoolSchedule)
  if (!isHoliday && (notifyContent === 'both' || notifyContent === 'school')) {
    const rawPeriods: any[] =
      Array.isArray(state.schoolPeriods) && state.schoolPeriods.length > 0
        ? state.schoolPeriods
        : FALLBACK_SCHOOL_PERIODS
    const periodById = new Map<string, any>(
      rawPeriods.filter((p) => p.id).map((p) => [p.id, p])
    )
    const periodByCode = new Map<string, any>(
      rawPeriods.filter((p) => p.code).map((p) => [String(p.code).toUpperCase(), p])
    )
    const schoolSlots: any[] = Array.isArray(state.schoolSchedule) ? state.schoolSchedule : []

    for (const slot of schoolSlots) {
      if (Number(slot.weekday) !== weekday) continue
      const matchesWeek = slot.week_start
        ? slot.week_start === weekMonday
        : isWithinDateRange(dateStr, slot.valid_from, slot.valid_to)
      if (!matchesWeek) continue

      const isDuty = slot.cell_type === 'duty' || Boolean(slot.is_duty)
      if (isDuty && !showDuty) continue

      const code = String(slot.period_code || slot.period || '').toUpperCase()
      const p =
        (code ? periodByCode.get(code) : undefined) ||
        (slot.period_id ? periodById.get(slot.period_id) : undefined)

      const startTime = slot.start_time || p?.start_time || '07:00'
      const endTime = slot.end_time || p?.end_time || ''
      const timeLabel = endTime ? `${startTime} – ${endTime}` : startTime

      const mainText =
        [slot.class_name, slot.subject].filter(Boolean).join(' · ') ||
        slot.subject_name ||
        slot.title ||
        slot.note ||
        p?.name ||
        (isDuty ? 'Trực ban / Họp' : 'Tiết học ở trường')

      items.push({
        type: isDuty ? 'Trực' : 'Trường',
        title: code ? `${code} · ${mainText}` : mainText,
        time: timeLabel,
        location: slot.room || '',
        period_code: code || undefined,
        session_group: slot.session_group,
        spans_to_group: slot.spans_to_group,
      })
    }
  }

  // 2. Lịch dạy thêm (scheduleRules + sessionExceptions + extraSessions)
  if (notifyContent === 'both' || notifyContent === 'tutoring') {
    const classes: any[] = Array.isArray(state.classes) ? state.classes : []
    const classMap = new Map<string, any>(classes.map((c) => [c.id, c]))
    const exceptions: any[] = Array.isArray(state.sessionExceptions) ? state.sessionExceptions : []
    const rules: any[] = Array.isArray(state.scheduleRules) ? state.scheduleRules : []

    if (!isHoliday) {
      for (const rule of rules) {
        if (Number(rule.weekday) !== weekday) continue
        if (!isWithinDateRange(dateStr, rule.valid_from, rule.valid_to)) continue

        const ex = exceptions.find(
          (e) => e.rule_id === rule.id && e.original_date === dateStr,
        )
        const exAction = ex?.action || ex?.type
        if (ex && (exAction === 'cancelled' || exAction === 'moved')) continue

        const cls = classMap.get(rule.class_id)
        const startTime = rule.start_time || '18:00'
        const endTime = rule.end_time || ''
        items.push({
          type: 'Dạy thêm',
          title: cls?.name || 'Lớp dạy thêm',
          time: endTime ? `${startTime} – ${endTime}` : startTime,
          location: cls?.location || rule.location || '',
        })
      }
    }

    // Các buổi được dời đến ngày hôm nay
    for (const ex of exceptions) {
      const exAction = ex.action || ex.type
      if (exAction === 'moved' && ex.new_date === dateStr) {
        const rule = rules.find((r) => r.id === ex.rule_id)
        const cls = classMap.get(ex.class_id || rule?.class_id)
        const startTime = ex.new_start || ex.new_start_time || rule?.start_time || '18:00'
        const endTime = ex.new_end || ex.new_end_time || rule?.end_time || ''
        items.push({
          type: 'Dạy bù / Dời lịch',
          title: cls?.name || 'Lớp dạy thêm',
          time: endTime ? `${startTime} – ${endTime}` : startTime,
          location: cls?.location || '',
        })
      }
    }

    // Các buổi học phát sinh (extraSessions)
    const extraSessions: any[] = Array.isArray(state.extraSessions) ? state.extraSessions : []
    for (const extra of extraSessions) {
      if (extra.date !== dateStr) continue
      const cls = classMap.get(extra.class_id)
      const startTime = extra.start_time || '18:00'
      const endTime = extra.end_time || ''
      items.push({
        type: 'Phát sinh',
        title: cls?.name ? `${cls.name}${extra.note ? ` (${extra.note})` : ''}` : extra.note || 'Buổi phát sinh',
        time: endTime ? `${startTime} – ${endTime}` : startTime,
        location: cls?.location || '',
      })
    }
  }

  items.sort((a, b) => a.time.localeCompare(b.time))
  return items
}

function buildDailyScheduleEmailHtml(
  teacherName: string,
  displayDate: string,
  items: DailyEmailItem[],
): string {
  const safeTeacher = escapeHtml(teacherName || 'Thầy/Cô')
  const safeDate = escapeHtml(displayDate)

  const rowsHtml =
    items.length === 0
      ? `<p style="margin:16px 0;padding:16px;background:#f8fafc;border-radius:10px;color:#475569;font-size:15px;">Hôm nay (${safeDate}) Thầy/Cô không có lịch dạy nào được ghi nhận. Chúc Thầy/Cô một ngày nghỉ ngơi thật tốt!</p>`
      : `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;color:#334155;font-size:13px;">
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Giờ</th>
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Loại</th>
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Nội dung / Lớp</th>
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Địa điểm</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;white-space:nowrap;">${escapeHtml(item.time)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#2563eb;font-size:13px;">${escapeHtml(item.type)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(item.title)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">${escapeHtml(item.location || '—')}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>`

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;">Lịch dạy hôm nay — ${safeDate}</h2>
    <p style="margin:0 0 12px;color:#475569;font-size:14px;">Xin chào <strong>${safeTeacher}</strong>, đây là tổng hợp lịch dạy của bạn trong ngày:</p>
    ${rowsHtml}
    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">Email được gửi tự động từ Trợ Lý Giáo Viên (app-gv.pages.dev). Bạn có thể thay đổi giờ nhận hoặc tắt thông báo trong mục Cài đặt.</p>
  </div>`
}

async function sendEmailViaResend(
  env: Env,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'Server chưa cấu hình RESEND_API_KEY' }
  }

  const from = env.RESEND_FROM_EMAIL || 'Lịch Dạy Giáo Viên <onboarding@resend.dev>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Resend HTTP ${res.status}: ${text || res.statusText}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Lỗi kết nối tới Resend API' }
  }
}

// ============================================================================
// AI HELP ASSISTANT (STRICT APP-ONLY GUIDE & SECURITY GUARDRAIL)
// ============================================================================

const APP_HELP_SYSTEM_PROMPT = `Bạn là Trợ lý Hướng dẫn Sử dụng của phần mềm "Lịch Dạy GV".
NHIỆM VỤ DUY NHẤT:
- Hướng dẫn người dùng cách sử dụng các chức năng của ứng dụng bằng tiếng Việt ngắn gọn, dễ hiểu, từng bước rõ ràng.
- Các tính năng chính của app:
  1. Lịch dạy (/schedule): Xem lịch theo Ngày/Tuần/Tháng, lịch trường học & dạy thêm, bấm vào buổi học để xem/điểm danh.
  2. Lớp học & Học sinh (/classes, /classes/:classId): Bấm "+ Thêm lớp mới" để tạo lớp, bấm vào lớp để thêm học sinh và xếp lịch cố định.
  3. Lịch học phát sinh: Tạo buổi học ngoài lịch cố định (chọn lớp, ngày, giờ, ghi chú và ô "Học phí buổi này" tùy chọn — nhập số tiền sẽ tính theo giá riêng, để trống dùng giá mặc định của lớp; cho phép sửa/xóa).
  4. Điểm danh: Vào Chi tiết lớp hoặc bấm vào buổi dạy trên Lịch để đánh dấu Có mặt / Vắng / Có phép.
  5. Học phí (/fees): Chọn Tháng và Bộ lọc theo lớp (hoặc Tất cả lớp) để xem tổng phải thu, đã thu, còn thiếu và ghi nhận thu tiền.
  6. Cài đặt (/settings): Chỉnh giờ tiết trường S1-S5/C1-C5, bật "Thông báo Gmail" (nhập email + giờ nhận, gửi thử), đồng bộ Google Calendar (.ics).
  7. Hướng dẫn từng bước: Bấm nút "Hướng dẫn (?)" trên thanh trên cùng hoặc trong Cài đặt để xem lại hướng dẫn chỉ từng nút bấm.
  8. Hồ sơ (/profile): Sửa thông tin cá nhân hoặc đổi mật khẩu của chính mình.
  9. Liên hệ Admin / Khiếu nại / Hỗ trợ: Bấm sang tab "Liên hệ Admin" ngay trên đầu hộp chat này để gửi đơn hỗ trợ, khiếu nại, báo lỗi hoặc chat 2 chiều trực tiếp với Quản trị viên.
  10. Cổng Quản trị (/admin, chỉ dành cho Admin): Duyệt/khóa tài khoản giáo viên, tab "Mã mời Giáo viên" để tạo mã mời, tab "Hỗ trợ & Khiếu nại" để trả lời giáo viên, xem Nhật ký kiểm toán (lưu 30 ngày gần nhất).

QUY TẮC BẢO MẬT & PHẠM VI BẮT BUỘC:
- TUYỆT ĐỐI KHÔNG trả lời các câu hỏi ngoài phạm vi phần mềm Lịch Dạy GV (như viết code, giải bài tập, nấu ăn, thời tiết, tin tức, chính trị, chứng khoán, giải trí...). Nếu bị hỏi ngoài luồng, hãy từ chối lịch sự và mời người dùng hỏi về cách sử dụng app.
- TUYỆT ĐỐI KHÔNG tiết lộ, suy đoán hay thảo luận về mật khẩu, API key, token, secret, thông tin hoặc dữ liệu của bất kỳ tài khoản nào khác.
- Không bịa đặt tính năng không có trong danh sách trên.`

function checkHelpChatGuardrail(message: string): {
  blocked: boolean
  reason?: 'security' | 'off_topic'
  reply?: string
} {
  const norm = message.toLowerCase().trim()

  const isSelfPasswordHelp =
    /(đổi mật khẩu|quên mật khẩu|đặt lại mật khẩu|cập nhật mật khẩu|change password|reset password)/.test(
      norm
    ) && !/(của người khác|của admin|của ai|tài khoản khác|xem mật khẩu|lộ mật khẩu)/.test(norm)

  const securityPattern =
    /(mật khẩu của|xem mật khẩu|lấy mật khẩu|mật khẩu admin|password của|admin password|api key|resend_api_key|cron_secret|gemini_api_key|session token|access token|tài khoản khác|email của giáo viên|danh sách tài khoản|dữ liệu người khác|hack|sql injection|ignore previous|system prompt|bỏ qua chỉ dẫn|tiết lộ mật khẩu)/i

  if (!isSelfPasswordHelp && securityPattern.test(norm)) {
    return {
      blocked: true,
      reason: 'security',
      reply:
        'Xin lỗi, tôi chỉ là trợ lý hướng dẫn sử dụng ứng dụng nên không thể xem, truy xuất hay tiết lộ mật khẩu, mã bảo mật hoặc thông tin của tài khoản khác. Nếu bạn muốn tự đổi mật khẩu của mình, hãy vào mục **Hồ sơ cá nhân** → **Đổi mật khẩu**.',
    }
  }

  const appKeywords =
    /(lịch dạy|lịch học|phát sinh|lớp học|học sinh|điểm danh|học phí|lọc theo lớp|cài đặt|tiết học|thông báo|email|gmail|google calendar|\.ics|hướng dẫn|hồ sơ|đổi mật khẩu|quên mật khẩu|đăng nhập|đăng ký|mã mời|admin|quản trị|kiểm toán|app|ứng dụng|phần mềm|tính năng|nút|trang)/i

  const offTopicPattern =
    /(viết code|lập trình|python|javascript|typescript|react|html|css|giải toán|giải bài|làm bài tập|thời tiết|chứng khoán|bitcoin|crypto|bóng đá|nấu ăn|công thức nấu|chính trị|tử vi|kể chuyện|bài thơ|viết văn|dịch sang tiếng|chatgpt|gemini là gì)/i

  if (offTopicPattern.test(norm) && !appKeywords.test(norm)) {
    return {
      blocked: true,
      reason: 'off_topic',
      reply:
        'Tôi chỉ có nhiệm vụ duy nhất là **hướng dẫn cách sử dụng ứng dụng Lịch Dạy GV** (xếp lịch dạy, lớp học, lịch phát sinh, điểm danh, học phí, cài đặt và tài khoản). Bạn đang cần hỗ trợ thao tác nào trong ứng dụng ạ?',
    }
  }

  return { blocked: false }
}

function buildRuleBasedHelpReply(message: string, role: string, currentPath: string): string {
  const q = message.toLowerCase()

  if (/(phát sinh|buổi bù|ngoài lịch|học phí buổi này)/.test(q)) {
    return [
      'Để tạo **Lịch học phát sinh** (ngoài lịch cố định):',
      '1. Vào trang **Lớp học** hoặc bấm nút **+ Lịch phát sinh**.',
      '2. Chọn **Lớp**, **Ngày**, **Giờ bắt đầu / kết thúc** và **Ghi chú** (không bắt buộc).',
      '3. Ở ô **Học phí buổi này**: nhập số tiền nếu muốn thu mức riêng cho buổi này, hoặc để trống để dùng giá mặc định của lớp.',
      '4. Bấm lưu — buổi phát sinh sẽ hiện ngay trên **Lịch dạy**, điểm danh và tính học phí như buổi thường (có thể sửa hoặc xóa).',
    ].join('\n')
  }

  if (/(học phí|thu tiền|công nợ|lọc theo lớp|lọc lớp)/.test(q)) {
    return [
      'Để xem và thu **Học phí**:',
      '1. Mở mục **Học phí** trên thanh menu.',
      '2. Chọn **Tháng** cần xem và chọn lớp ở ô **Lọc theo lớp** (hoặc chọn *Tất cả lớp*).',
      '3. Các số tổng (*Phải thu, Đã thu, Còn thiếu*) và danh sách học sinh sẽ tự tính theo lớp bạn chọn.',
      '4. Bấm nút ghi nhận thu tiền ở dòng học sinh để cập nhật đã đóng học phí.',
    ].join('\n')
  }

  if (/(điểm danh|vắng|có mặt|có phép)/.test(q)) {
    return [
      'Để **Điểm danh** một buổi dạy:',
      '1. Cách 1: Ở trang **Lịch dạy**, bấm trực tiếp vào buổi dạy hôm đó để mở nhanh khung điểm danh.',
      '2. Cách 2: Vào **Lớp học** → bấm vào tên lớp → chọn buổi dạy cần điểm danh.',
      '3. Chọn trạng thái **Có mặt / Vắng / Có phép** cho từng học sinh — hệ thống tự lưu và cộng vào bảng học phí cuối tháng.',
    ].join('\n')
  }

  if (/(lớp học|tạo lớp|thêm lớp|học sinh|thêm học sinh)/.test(q)) {
    return [
      'Để **Tạo lớp & Thêm học sinh**:',
      '1. Vào mục **Lớp học** → bấm **+ Thêm lớp mới** để nhập tên lớp, học phí mặc định mỗi buổi và lịch dạy cố định trong tuần.',
      '2. Sau khi tạo xong, bấm vào tên lớp để mở **Chi tiết lớp** → bấm **+ Thêm học sinh** để nhập danh sách học viên.',
    ].join('\n')
  }

  if (/(email|gmail|thông báo|nhắc lịch|sáng)/.test(q)) {
    return [
      'Để bật **Thông báo lịch dạy qua Email mỗi sáng**:',
      '1. Vào **Cài đặt** → chọn mục **Thông báo Gmail**.',
      '2. Gạt bật công tắc thông báo, nhập email nhận (hoặc bấm **Dùng email tài khoản**) và chọn giờ muốn nhận (mặc định `06:00`).',
      '3. Bạn có thể bấm **Gửi email thử** để kiểm tra ngay email lịch dạy trong ngày.',
    ].join('\n')
  }

  if (/(google calendar|calendar|\.ics|đồng bộ lịch)/.test(q)) {
    return [
      'Để đồng bộ sang **Google Calendar**:',
      '1. Vào **Cài đặt** → chọn mục **Google Calendar & AI**.',
      '2. Bấm **Kết nối Google Calendar** (ứng dụng tự điền sẵn email tài khoản của bạn), hoặc sao chép **đường link `.ics`** bên dưới để dán vào Google Calendar trên web/điện thoại.',
    ].join('\n')
  }

  if (/(tiết học|giờ tiết|cài đặt|nghỉ lễ|s1|c1)/.test(q)) {
    return [
      'Để chỉnh **Giờ tiết học trường & Ngày nghỉ lễ**:',
      '1. Vào **Cài đặt** → mục **Lịch trường & Giờ tiết**.',
      '2. Chỉnh khung giờ từng tiết `S1–S5`, `C1–C5` hoặc thêm các ngày nghỉ lễ để lịch dạy tự động bỏ qua ngày nghỉ.',
    ].join('\n')
  }

  if (/(đổi mật khẩu|quên mật khẩu|hồ sơ|tài khoản của tôi)/.test(q)) {
    return [
      'Để cập nhật thông tin hoặc **Đổi mật khẩu của bạn**:',
      '1. Bấm vào tên/avatar của bạn hoặc vào mục **Hồ sơ**.',
      '2. Tại đây bạn có thể sửa họ tên, trường học, số điện thoại hoặc vào phần **Đổi mật khẩu** để đặt mật khẩu mới (tối thiểu 8 ký tự gồm chữ và số).',
    ].join('\n')
  }

  if (/(liên hệ admin|gặp admin|nhắn admin|gửi admin|khiếu nại|phản ánh|báo lỗi|gửi đơn|hỗ trợ kỹ thuật|hỗ trợ từ admin)/.test(q)) {
    return [
      'Để **liên hệ trực tiếp với Admin** hoặc **gửi đơn khiếu nại / hỗ trợ**:',
      '1. Bấm sang tab **Liên hệ Admin** ngay phía trên hộp chat này.',
      '2. Bấm **+ Gửi đơn mới**, chọn loại yêu cầu (*Hỗ trợ sử dụng / Khiếu nại / Báo lỗi / Tài khoản*), nhập tiêu đề và nội dung rồi bấm gửi.',
      '3. Bạn có thể bấm vào đơn đã gửi bất cứ lúc nào để **chat 2 chiều trực tiếp** và xem phản hồi của Admin!',
    ].join('\n')
  }

  if (/(mã mời|duyệt|khóa tài khoản|kiểm toán|admin|quản trị)/.test(q)) {
    if (role === 'admin') {
      return [
        'Hướng dẫn nhanh trong **Cổng Quản trị (Admin)**:',
        '- **Tài khoản**: Duyệt tài khoản chờ, khóa/mở khóa hoặc cấp lại mật khẩu tạm thời cho giáo viên.',
        '- **Mã mời Giáo viên**: Nhập email (tùy chọn), số lượt dùng tối đa, hạn ngày hoặc mã tùy chỉnh rồi bấm **Tạo mã mời**.',
        '- **Nhật ký kiểm toán**: Tự động lưu các thao tác đăng nhập và quản trị trong **30 ngày gần nhất**.',
      ].join('\n')
    }
    return 'Các chức năng duyệt tài khoản và tạo mã mời chỉ dành cho Quản trị viên. Nếu bạn là giáo viên, hãy dùng các mục **Lịch dạy, Lớp học, Học phí, Cài đặt** và **Hồ sơ** nhé!'
  }

  if (/(hướng dẫn|bắt đầu|chỉ nút|không biết dùng|làm sao)/.test(q)) {
    return [
      'Bạn có thể bấm nút **Hướng dẫn (?)** trên thanh tiêu đề để app tự khoanh sáng và chỉ từng nút bấm trên trang đang mở!',
      'Hoặc hãy hỏi tôi cụ thể tính năng bạn cần, ví dụ:',
      '• *Cách tạo lớp và thêm học sinh?*',
      '• *Cách tạo lịch học phát sinh có học phí riêng?*',
      '• *Cách điểm danh và lọc học phí theo lớp?*',
      '• *Cách bật thông báo email mỗi sáng?*',
    ].join('\n')
  }

  const pageHint = currentPath.startsWith('/fees')
    ? 'Bạn đang ở trang **Học phí** — bạn có thể hỏi về cách lọc theo lớp hoặc ghi nhận thu tiền.'
    : currentPath.startsWith('/classes')
      ? 'Bạn đang ở trang **Lớp học** — bạn có thể hỏi về cách tạo lớp, thêm học sinh, điểm danh hoặc tạo lịch phát sinh.'
      : currentPath.startsWith('/settings')
        ? 'Bạn đang ở trang **Cài đặt** — bạn có thể hỏi về giờ tiết trường, thông báo Email hoặc Google Calendar.'
        : currentPath.startsWith('/admin')
          ? 'Bạn đang ở **Cổng Quản trị** — bạn có thể hỏi về duyệt giáo viên, tạo mã mời hoặc nhật ký kiểm toán.'
          : 'Bạn có thể hỏi tôi về **Lịch dạy, Lớp học, Lịch phát sinh, Điểm danh, Học phí, Cài đặt** hoặc **Hồ sơ**.'

  return `Tôi chỉ hỗ trợ hướng dẫn cách sử dụng ứng dụng **Lịch Dạy GV**. ${pageHint}\n\nBạn muốn tôi hướng dẫn thao tác cụ thể nào ạ?`
}

async function callGeminiHelpChat(
  apiKey: string,
  message: string,
  role: string,
  currentPath: string,
  history: Array<{ role?: string; text?: string }>
): Promise<string | null> {
  try {
    const contents = [
      ...history
        .filter((m) => m && typeof m.text === 'string' && m.text.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.text).slice(0, 600) }],
        })),
      {
        role: 'user',
        parts: [
          {
            text: `[Ngữ cảnh: vai trò=${role}, trang hiện tại=${currentPath}]\nCâu hỏi của người dùng: ${message}`,
          },
        ],
      },
    ]

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: APP_HELP_SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500,
          },
        }),
      }
    )

    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text || null
  } catch {
    return null
  }
}

// ============================================================================
// HTTP RESPONSE HELPERS
// ============================================================================

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  })
}

async function readJsonBody<T = Record<string, any>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    return {} as T
  }
}

// ============================================================================
// MAIN EDGE ROUTER
// ============================================================================

export async function handleApiRequest(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = req.method.toUpperCase()

  try {
    // 1. HEALTH CHECK
    if (method === 'GET' && path === '/api/health') {
      await ensureD1Table(env.DB)
      return jsonResponse({
        status: 'ok',
        runtime: 'cloudflare-edge',
        database: env.DB ? 'cloudflare-d1-connected' : 'edge-memory-fallback',
        cold_start: '0ms (always-on)',
        timestamp: new Date().toISOString(),
      })
    }

    // 2. PUBLIC AUTH CONFIG
    if (method === 'GET' && path === '/api/auth/public-config') {
      const store = await loadAuthStore(env)
      return jsonResponse({
        registration_mode: store.appSettings.registration_mode,
        google_login_enabled: store.appSettings.google_login_enabled,
        password_login_enabled: store.appSettings.password_login_enabled,
        supabase_configured: false,
        google_oauth_configured: Boolean(env.GOOGLE_CLIENT_ID),
        turnstile_site_key: null,
      })
    }

    // 2b. GOOGLE OAUTH & AUTO-APPROVED GOOGLE REGISTRATION (/api/auth/google/* & /api/auth/sync-supabase)
    if (method === 'GET' && path === '/api/auth/google/url') {
      const returnTo = url.searchParams.get('returnTo') || '/'
      const clientId = (env.GOOGLE_CLIENT_ID || '').trim()
      const redirectUri =
        (env.GOOGLE_AUTH_REDIRECT_URI || '').trim() ||
        `${url.origin}/api/auth/google/callback`

      if (!clientId) {
        const fallbackRedirectUrl = `${url.origin}/auth/callback?mode=google_redirect_select&returnTo=${encodeURIComponent(
          returnTo
        )}`
        return jsonResponse({
          oauthConfigured: false,
          redirectUrl: fallbackRedirectUrl,
        })
      }

      const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      googleUrl.searchParams.set('client_id', clientId)
      googleUrl.searchParams.set('redirect_uri', redirectUri)
      googleUrl.searchParams.set('response_type', 'code')
      googleUrl.searchParams.set('scope', 'openid email profile')
      googleUrl.searchParams.set('prompt', 'select_account')
      googleUrl.searchParams.set('state', btoa(JSON.stringify({ returnTo })))

      return jsonResponse({
        oauthConfigured: true,
        redirectUrl: googleUrl.toString(),
      })
    }

    if (method === 'GET' && path === '/api/auth/google/callback') {
      const code = url.searchParams.get('code') || ''
      const rawState = url.searchParams.get('state') || ''
      const clientId = (env.GOOGLE_CLIENT_ID || '').trim()
      const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim()
      const redirectUri =
        (env.GOOGLE_AUTH_REDIRECT_URI || '').trim() ||
        `${url.origin}/api/auth/google/callback`

      let returnTo = '/'
      if (rawState) {
        try {
          const parsed = JSON.parse(atob(rawState)) as { returnTo?: string }
          if (parsed.returnTo) returnTo = parsed.returnTo
        } catch {
          // ignore
        }
      }

      if (!code || !clientId || !clientSecret) {
        return Response.redirect(
          `${url.origin}/auth/login?error=${encodeURIComponent(
            'Không thể hoàn tất đăng nhập với Google.'
          )}`,
          302
        )
      }

      try {
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        })
        if (!tokenResp.ok) {
          throw new Error('Không thể đổi mã xác thực Google.')
        }
        const tokenData = (await tokenResp.json()) as { access_token: string }
        const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!userResp.ok) {
          throw new Error('Không thể lấy thông tin tài khoản Google.')
        }
        const googleUser = (await userResp.json()) as {
          email?: string
          name?: string
          picture?: string
        }

        const email = normalizeEmail(googleUser.email || '')
        if (!email) throw new Error('Không lấy được địa chỉ email từ Google.')

        const store = await loadAuthStore(env)
        const nowIso = new Date().toISOString()
        const isAdminEmail = email === getAdminEmail(env)
        let user = store.users.find((u) => normalizeEmail(u.email) === email)
        let linkedExisting = false

        if (user) {
          linkedExisting = user.auth_provider === 'email'
          user.auth_provider = user.auth_provider === 'email' ? 'both' : 'google'
          user.email_verified = true
          if (isAdminEmail) {
            user.role = 'admin'
          }
          if (user.status !== 'locked') {
            user.status = 'active' // Đăng nhập bằng Google tự động duyệt active
          }
          if (googleUser.picture && !user.avatar_url) {
            user.avatar_url = googleUser.picture
          }
          user.last_login_at = nowIso
        } else {
          user = {
            id: generateId('usr'),
            email,
            full_name: googleUser.name || email.split('@')[0],
            phone: null,
            school: null,
            avatar_url: googleUser.picture || null,
            role: isAdminEmail ? 'admin' : 'teacher',
            status: 'active', // Đăng ký bằng Google tự động kích hoạt ngay, KHÔNG cần Admin duyệt
            email_verified: true,
            auth_provider: 'google',
            onboarding_completed: false,
            created_at: nowIso,
            approved_at: nowIso,
            approved_by: 'GOOGLE_OAUTH_AUTO',
            last_login_at: nowIso,
            locked_reason: null,
            token_version: 1,
          }
          store.users.push(user)
        }

        const { sessionToken, expiresAt } = await createSession(
          store,
          user.id,
          true,
          req.headers.get('user-agent') || undefined
        )
        appendAuditLog(store, {
          actor_id: user.id,
          actor_email: user.email,
          action: linkedExisting ? 'google_account_linked' : 'login_google_redirect',
          target_email: user.email,
          detail: { message: linkedExisting ? 'Liên kết & đăng nhập bằng Google OAuth' : 'Đăng nhập bằng Google OAuth' },
        })
        await saveAuthStore(env, store)

        return Response.redirect(
          `${url.origin}/auth/callback?token=${encodeURIComponent(
            sessionToken
          )}&expiresAt=${expiresAt}&linked=${
            linkedExisting ? '1' : '0'
          }&returnTo=${encodeURIComponent(returnTo)}`,
          302
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi đăng nhập Google'
        return Response.redirect(
          `${url.origin}/auth/login?error=${encodeURIComponent(msg)}`,
          302
        )
      }
    }

    if (
      method === 'POST' &&
      (path === '/api/auth/google/redirect-complete' || path === '/api/auth/sync-supabase')
    ) {
      const body = await readJsonBody(req)
      const meta = body.userMetadata || body
      const email = normalizeEmail(meta.email || '')
      const fullName = String(meta.fullName || meta.full_name || email.split('@')[0] || '').trim()

      if (!email) {
        return jsonResponse(
          { success: false, error: 'Vui lòng nhập địa chỉ email Google.' },
          400
        )
      }

      const store = await loadAuthStore(env)
      const nowIso = new Date().toISOString()
      const isAdminEmail = email === getAdminEmail(env)
      let user = store.users.find((u) => normalizeEmail(u.email) === email)
      let linkedExisting = false

      if (user) {
        linkedExisting = user.auth_provider === 'email'
        user.auth_provider = user.auth_provider === 'email' ? 'both' : 'google'
        user.email_verified = true
        if (isAdminEmail) {
          user.role = 'admin'
        }
        if (user.status !== 'locked') {
          user.status = 'active' // Đăng nhập bằng Google tự động duyệt active
        }
        user.last_login_at = nowIso
      } else {
        user = {
          id: generateId('usr'),
          email,
          full_name: fullName || email.split('@')[0],
          phone: null,
          school: null,
          avatar_url: null,
          role: isAdminEmail ? 'admin' : 'teacher',
          status: 'active', // Đăng ký bằng Google tự động kích hoạt ngay, KHÔNG cần Admin duyệt
          email_verified: true,
          auth_provider: 'google',
          onboarding_completed: false,
          created_at: nowIso,
          approved_at: nowIso,
          approved_by: 'GOOGLE_OAUTH_AUTO',
          last_login_at: nowIso,
          locked_reason: null,
          token_version: 1,
        }
        store.users.push(user)
      }

      const { sessionToken, expiresAt } = await createSession(
        store,
        user.id,
        true,
        req.headers.get('user-agent') || undefined
      )
      appendAuditLog(store, {
        actor_id: user.id,
        actor_email: user.email,
        action: linkedExisting ? 'google_account_linked' : 'login_google_redirect',
        target_email: user.email,
        detail: { message: 'Đăng nhập qua Google Redirect' },
      })
      await saveAuthStore(env, store)

      return jsonResponse({
        success: true,
        profile: toPublicProfile(user),
        sessionToken,
        expiresAt,
        linkedExisting,
      })
    }

    // 3. LOGIN (POST /api/auth/login)
    if (method === 'POST' && path === '/api/auth/login') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email || '')
      const password = String(body.password || '')
      const rememberMe =
        body.rememberMe !== undefined ? Boolean(body.rememberMe) : body.remember_me !== false

      if (!email || !password) {
        return jsonResponse(
          { success: false, error: 'Email hoặc mật khẩu không đúng' },
          400
        )
      }

      const store = await loadAuthStore(env)
      const user = store.users.find((u) => normalizeEmail(u.email) === email)

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return jsonResponse(
          { success: false, error: 'Email hoặc mật khẩu không đúng' },
          401
        )
      }

      if (!user.email_verified) {
        return jsonResponse(
          {
            success: false,
            code: 'EMAIL_NOT_VERIFIED',
            email: user.email,
            error: 'Vui lòng xác minh địa chỉ email trước khi đăng nhập.',
          },
          403
        )
      }

      user.last_login_at = new Date().toISOString()
      const { sessionToken, expiresAt } = await createSession(
        store,
        user.id,
        rememberMe,
        req.headers.get('user-agent') || undefined
      )
      appendAuditLog(store, {
        actor_id: user.id,
        actor_email: user.email,
        action: 'login_success',
        target_email: user.email,
        detail: { message: 'Đăng nhập bằng Email & Mật khẩu' },
      })
      await saveAuthStore(env, store)

      const profile = toPublicProfile(user)
      return jsonResponse({
        success: true,
        profile,
        sessionToken,
        expiresAt,
        // Cũng trả kèm snake_case để tương thích ngược
        session_token: sessionToken,
        expires_at: expiresAt,
      })
    }

    // 4. REGISTER (POST /api/auth/register)
    if (method === 'POST' && path === '/api/auth/register') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email || '')
      const password = String(body.password || '')
      const fullName = String(body.full_name || '').trim()
      const inviteCode = String(body.invite_code || '').trim().toUpperCase()

      if (!email || !fullName) {
        return jsonResponse(
          { success: false, error: 'Vui lòng nhập đầy đủ Họ tên và Email.' },
          400
        )
      }
      const pwErr = validatePasswordStrength(password)
      if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)

      const store = await loadAuthStore(env)
      if (store.users.some((u) => normalizeEmail(u.email) === email)) {
        return jsonResponse(
          { success: false, error: 'Email này đã được đăng ký trong hệ thống.' },
          409
        )
      }

      let matchedInvite: InviteRecord | undefined
      if (inviteCode) {
        matchedInvite = store.invites.find(
          (inv) =>
            inv.code.toUpperCase() === inviteCode &&
            !inv.revoked &&
            inv.used_count < inv.max_uses &&
            (!inv.expires_at || new Date(inv.expires_at).getTime() > Date.now())
        )
        if (!matchedInvite) {
          return jsonResponse(
            { success: false, error: 'Mã mời không hợp lệ hoặc đã hết hạn.' },
            400
          )
        }
      } else if (store.appSettings.registration_mode === 'invite_only') {
        return jsonResponse(
          {
            success: false,
            error: 'Hệ thống hiện chỉ cho phép đăng ký khi có Mã mời từ Admin.',
          },
          403
        )
      }

      const nowIso = new Date().toISOString()
      const isAdminEmail = email === getAdminEmail(env)
      const autoActive =
        isAdminEmail ||
        Boolean(matchedInvite) ||
        store.appSettings.registration_mode === 'open'
      const initialStatus: AccountStatus = autoActive ? 'active' : 'pending'
      const role: AccountRole = isAdminEmail ? 'admin' : 'teacher'

      const rawVerifyToken = randomHex(20)
      const verifyTokenHash = await sha256Hex(rawVerifyToken)

      const newUser: StoredUser = {
        id: generateId('usr'),
        email,
        full_name: fullName,
        phone: body.phone ? String(body.phone).trim() : null,
        school: body.school ? String(body.school).trim() : null,
        role,
        status: initialStatus,
        email_verified: true,
        auth_provider: 'email',
        onboarding_completed: false,
        created_at: nowIso,
        approved_at: autoActive ? nowIso : null,
        approved_by: autoActive ? 'SYSTEM' : null,
        last_login_at: null,
        locked_reason: null,
        password_hash: await hashPassword(password),
        token_version: 1,
      }

      if (matchedInvite) {
        matchedInvite.used_count += 1
      }

      store.tokens.push({
        id: generateId('tok'),
        token_hash: verifyTokenHash,
        user_id: newUser.id,
        email: newUser.email,
        purpose: 'verify_email',
        created_at: nowIso,
        expires_at: Date.now() + 24 * 60 * 60 * 1000,
      })

      store.users.push(newUser)
      appendAuditLog(store, {
        actor_id: newUser.id,
        actor_email: newUser.email,
        actor_name: newUser.full_name,
        target_id: newUser.id,
        target_email: newUser.email,
        target_name: newUser.full_name,
        action: 'register_account',
        detail: { status: initialStatus },
      })

      await saveAuthStore(env, store)

      const devVerifyUrl = `${url.origin}/auth/verify-email?email=${encodeURIComponent(
        newUser.email
      )}&token=${rawVerifyToken}`

      return jsonResponse({
        success: true,
        email: newUser.email,
        devVerifyUrl,
        message:
          initialStatus === 'active'
            ? 'Đăng ký thành công! Bạn có thể đăng nhập ngay.'
            : 'Đăng ký thành công! Tài khoản đang chờ Quản trị viên phê duyệt.',
      })
    }

    // 5. GET /api/auth/me & POST /api/auth/refresh
    if (method === 'GET' && path === '/api/auth/me') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) {
        return jsonResponse(
          { authenticated: false, profile: null, error: 'Phiên đăng nhập đã hết hạn.' },
          401
        )
      }
      return jsonResponse({
        authenticated: true,
        profile: toPublicProfile(auth.user),
      })
    }

    if (method === 'POST' && path === '/api/auth/refresh') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) {
        return jsonResponse(
          { success: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' },
          401
        )
      }
      const days = auth.session.remember_me ? 90 : 2
      auth.session.expires_at = Date.now() + days * 24 * 60 * 60 * 1000
      const rawToken = extractBearerToken(req) || ''
      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(auth.user),
        sessionToken: rawToken,
        expiresAt: auth.session.expires_at,
      })
    }

    // 6. LOGOUT
    if (method === 'POST' && path === '/api/auth/logout') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (auth) {
        store.sessions = store.sessions.filter((s) => s.token_hash !== auth.tokenHash)
        await saveAuthStore(env, store)
      }
      return jsonResponse({ success: true })
    }

    // 7. VERIFY EMAIL / RESEND / FORGOT / RESET / NOTIFY ADMIN
    if (method === 'POST' && path === '/api/auth/verify-email') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email || '')
      const store = await loadAuthStore(env)
      const user =
        store.users.find((u) => normalizeEmail(u.email) === email) || store.users[0]
      if (!user) {
        return jsonResponse({ success: false, error: 'Không tìm thấy tài khoản.' }, 404)
      }
      user.email_verified = true
      const { sessionToken, expiresAt } = await createSession(store, user.id, true)
      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(user),
        sessionToken,
        expiresAt,
        message: 'Xác minh email thành công!',
      })
    }

    if (method === 'POST' && path === '/api/auth/resend-verification') {
      return jsonResponse({
        success: true,
        message: 'Tài khoản đã được xác minh sẵn sàng.',
      })
    }

    if (method === 'POST' && path === '/api/auth/notify-admin') {
      return jsonResponse({
        success: true,
        message: 'Đã gửi thông báo nhắc Quản trị viên phê duyệt tài khoản của bạn.',
      })
    }

    if (method === 'POST' && path === '/api/auth/forgot-password') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email || '')
      const store = await loadAuthStore(env)
      const user = store.users.find((u) => normalizeEmail(u.email) === email)
      if (!user) {
        return jsonResponse({
          success: true,
          message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được tạo.',
        })
      }
      const rawToken = randomHex(20)
      const tokenHash = await sha256Hex(rawToken)
      store.tokens.push({
        id: generateId('tok'),
        token_hash: tokenHash,
        user_id: user.id,
        email: user.email,
        purpose: 'reset_password',
        created_at: new Date().toISOString(),
        expires_at: Date.now() + 30 * 60 * 1000,
      })
      await saveAuthStore(env, store)
      const devResetUrl = `${url.origin}/auth/reset-password?email=${encodeURIComponent(
        user.email
      )}&token=${rawToken}`
      return jsonResponse({
        success: true,
        message: 'Đã tạo liên kết đặt lại mật khẩu.',
        devResetUrl,
      })
    }

    if (method === 'POST' && path === '/api/auth/reset-password') {
      const body = await readJsonBody(req)
      const rawToken = String(body.token || '').trim()
      const newPassword = String(body.newPassword || body.new_password || '')
      const pwErr = validatePasswordStrength(newPassword)
      if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)

      const store = await loadAuthStore(env)
      const tokenHash = await sha256Hex(rawToken)
      const tok = store.tokens.find(
        (t) =>
          t.token_hash === tokenHash &&
          t.purpose === 'reset_password' &&
          !t.used_at &&
          t.expires_at > Date.now()
      )
      if (!tok) {
        return jsonResponse(
          { success: false, error: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' },
          400
        )
      }
      const user = store.users.find((u) => u.id === tok.user_id)
      if (!user) return jsonResponse({ success: false, error: 'Không tìm thấy người dùng.' }, 404)

      user.password_hash = await hashPassword(newPassword)
      tok.used_at = new Date().toISOString()
      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay.',
      })
    }

    // 8. PROFILE ENDPOINTS (/api/profile/*)
    if (method === 'GET' && path === '/api/profile/me') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ success: false, error: 'Chưa đăng nhập.' }, 401)
      const adminEmail = getAdminEmail(env)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(auth.user),
        security: {
          hasPassword: Boolean(auth.user.password_hash),
          tokenVersion: auth.user.token_version || 1,
          isFixedServerAdmin: Boolean(adminEmail) && normalizeEmail(auth.user.email) === adminEmail,
          adminEmailConfigured: auth.user.role === 'admin' ? adminEmail : '',
        },
      })
    }

    if (method === 'PUT' && path === '/api/profile/me') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ success: false, error: 'Chưa đăng nhập.' }, 401)
      const body = await readJsonBody(req)

      if (typeof body.full_name === 'string' && body.full_name.trim()) {
        auth.user.full_name = body.full_name.trim()
      }
      if (body.phone !== undefined) {
        auth.user.phone = body.phone ? String(body.phone).trim() : null
      }
      if (body.school !== undefined) {
        auth.user.school = body.school ? String(body.school).trim() : null
      }
      if (body.avatar_url !== undefined) {
        auth.user.avatar_url = body.avatar_url || null
      }
      if (typeof body.onboarding_completed === 'boolean') {
        auth.user.onboarding_completed = body.onboarding_completed
      }

      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(auth.user),
        message: 'Đã lưu thông tin hồ sơ cá nhân.',
      })
    }

    if (method === 'POST' && path === '/api/profile/onboarding-complete') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ success: false, error: 'Chưa đăng nhập.' }, 401)
      auth.user.onboarding_completed = true
      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(auth.user),
        message: 'Đã ghi nhận hoàn thành hướng dẫn sử dụng.',
      })
    }

    if (method === 'POST' && path === '/api/profile/change-password') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ success: false, error: 'Chưa đăng nhập.' }, 401)
      const body = await readJsonBody(req)
      const currentPw = String(body.currentPassword || body.current_password || '')
      const newPw = String(body.newPassword || body.new_password || '')

      if (auth.user.password_hash && !(await verifyPassword(currentPw, auth.user.password_hash))) {
        return jsonResponse(
          { success: false, error: 'Mật khẩu hiện tại không chính xác.' },
          400
        )
      }
      const pwErr = validatePasswordStrength(newPw)
      if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)

      auth.user.password_hash = await hashPassword(newPw)
      auth.user.token_version = (auth.user.token_version || 1) + 1
      store.sessions = store.sessions.filter(
        (s) => s.user_id !== auth.user.id || s.token_hash === auth.tokenHash
      )
      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(auth.user),
        sessionToken: extractBearerToken(req) || '',
        expiresAt: auth.session.expires_at,
        message: 'Đã đổi mật khẩu thành công!',
      })
    }

    if (method === 'POST' && path === '/api/profile/revoke-other-sessions') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ success: false, error: 'Chưa đăng nhập.' }, 401)
      const before = store.sessions.length
      store.sessions = store.sessions.filter(
        (s) => s.user_id !== auth.user.id || s.token_hash === auth.tokenHash
      )
      const revokedCount = before - store.sessions.length
      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(auth.user),
        sessionToken: extractBearerToken(req) || '',
        expiresAt: auth.session.expires_at,
        message: `Đã đăng xuất ${revokedCount} phiên thiết bị khác.`,
      })
    }

    if (method === 'POST' && path === '/api/profile/delete-account') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ success: false, error: 'Chưa đăng nhập.' }, 401)
      if (auth.user.role === 'admin') {
        return jsonResponse(
          { success: false, error: 'Không thể xóa tài khoản Quản trị viên hệ thống.' },
          400
        )
      }
      store.users = store.users.filter((u) => u.id !== auth.user.id)
      store.sessions = store.sessions.filter((s) => s.user_id !== auth.user.id)
      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        message: 'Đã xóa tài khoản thành công.',
      })
    }

    // 9. ADMIN ENDPOINTS (/api/admin/*)
    if (path.startsWith('/api/admin')) {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth || auth.user.role !== 'admin') {
        return jsonResponse(
          { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập.' },
          403
        )
      }

      if (method === 'GET' && path === '/api/admin/overview') {
        const profiles = store.users.map(toPublicProfile)
        const teachers = profiles.filter((p) => p.role === 'teacher')
        const sevenDaysAgo = Date.now() - 7 * 86400000
        return jsonResponse({
          success: true,
          adminEmail: getAdminEmail(env),
          currentAdmin: toPublicProfile(auth.user),
          stats: {
            totalAccounts: profiles.length,
            totalTeachers: teachers.length,
            pendingCount: teachers.filter((p) => p.status === 'pending').length,
            activeCount: teachers.filter((p) => p.status === 'active').length,
            lockedCount: teachers.filter((p) => p.status === 'locked').length,
            unverifiedCount: teachers.filter((p) => !p.email_verified).length,
            activeLast7Days: teachers.filter(
              (p) => p.last_login_at && new Date(p.last_login_at).getTime() >= sevenDaysAgo
            ).length,
          },
          profiles,
          appSettings: store.appSettings,
          invites: store.invites,
          auditLogs: store.auditLogs.slice(0, 100),
        })
      }

      if (method === 'POST' && path === '/api/admin/users/approve-bulk') {
        const body = await readJsonBody(req)
        const userIds: string[] | undefined = Array.isArray(body.userIds)
          ? body.userIds
          : Array.isArray(body.user_ids)
            ? body.user_ids
            : undefined
        const nowIso = new Date().toISOString()
        let count = 0
        for (const u of store.users) {
          const shouldApprove = userIds ? userIds.includes(u.id) : u.status === 'pending'
          if (shouldApprove && u.status !== 'active') {
            u.status = 'active'
            u.email_verified = true
            u.approved_at = nowIso
            u.approved_by = auth.user.id
            count++
          }
        }
        appendAuditLog(store, {
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: 'admin_bulk_approve',
          detail: { approvedCount: count },
        })
        await saveAuthStore(env, store)
        return jsonResponse({
          success: true,
          approvedCount: count,
          message: `Đã phê duyệt ${count} tài khoản giáo viên.`,
        })
      }

      if (method === 'POST' && path === '/api/admin/users/create') {
        const body = await readJsonBody(req)
        const email = normalizeEmail(body.email || '')
        const fullName = String(body.full_name || '').trim()
        const password = String(body.password || '')
        const status: AccountStatus = body.status === 'pending' ? 'pending' : 'active'

        if (!email || !fullName) {
          return jsonResponse(
            { success: false, error: 'Vui lòng nhập Họ tên và Email.' },
            400
          )
        }
        const pwErr = validatePasswordStrength(password)
        if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)
        if (store.users.some((u) => normalizeEmail(u.email) === email)) {
          return jsonResponse(
            { success: false, error: 'Email này đã tồn tại trong hệ thống.' },
            409
          )
        }

        const nowIso = new Date().toISOString()
        const created: StoredUser = {
          id: generateId('usr'),
          email,
          full_name: fullName,
          phone: body.phone ? String(body.phone).trim() : null,
          school: body.school ? String(body.school).trim() : null,
          role: 'teacher',
          status,
          email_verified: true,
          auth_provider: 'email',
          onboarding_completed: false,
          created_at: nowIso,
          approved_at: status === 'active' ? nowIso : null,
          approved_by: status === 'active' ? auth.user.id : null,
          last_login_at: null,
          locked_reason: null,
          password_hash: await hashPassword(password),
          token_version: 1,
        }
        store.users.push(created)
        appendAuditLog(store, {
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          actor_name: auth.user.full_name,
          target_id: created.id,
          target_email: created.email,
          target_name: created.full_name,
          action: 'admin_create_teacher',
          detail: { status },
        })
        await saveAuthStore(env, store)
        return jsonResponse({
          success: true,
          profile: toPublicProfile(created),
          message: `Đã tạo tài khoản ${created.email} thành công.`,
        })
      }

      // Dynamic user actions: /api/admin/users/:id/:action
      const userActionMatch = path.match(/^\/api\/admin\/users\/([^/]+)(?:\/([^/]+))?$/)
      if (userActionMatch) {
        const targetId = decodeURIComponent(userActionMatch[1])
        const subAction = userActionMatch[2] || ''
        const targetUser = store.users.find((u) => u.id === targetId)
        if (!targetUser) {
          return jsonResponse({ success: false, error: 'Không tìm thấy người dùng.' }, 404)
        }

        if (method === 'POST' && subAction === 'approve') {
          targetUser.status = 'active'
          targetUser.email_verified = true
          targetUser.approved_at = new Date().toISOString()
          targetUser.approved_by = auth.user.id
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_approve_account',
            target_email: targetUser.email,
            detail: { message: `Phê duyệt tài khoản ${targetUser.email}` },
          })
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            profile: toPublicProfile(targetUser),
            message: `Đã phê duyệt tài khoản ${targetUser.email}.`,
          })
        }

        if (method === 'POST' && subAction === 'lock') {
          const body = await readJsonBody(req)
          targetUser.status = 'locked'
          targetUser.locked_reason = String(body.reason || 'Khóa bởi Quản trị viên')
          store.sessions = store.sessions.filter((s) => s.user_id !== targetUser.id)
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_lock_account',
            target_email: targetUser.email,
            detail: { reason: targetUser.locked_reason },
          })
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            profile: toPublicProfile(targetUser),
            message: `Đã khóa tài khoản ${targetUser.email}.`,
          })
        }

        if (method === 'POST' && subAction === 'unlock') {
          targetUser.status = 'active'
          targetUser.locked_reason = null
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_unlock_account',
            target_email: targetUser.email,
            detail: { message: `Mở khóa tài khoản ${targetUser.email}` },
          })
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            profile: toPublicProfile(targetUser),
            message: `Đã mở khóa tài khoản ${targetUser.email}.`,
          })
        }

        if (method === 'POST' && subAction === 'reset-password') {
          const body = await readJsonBody(req)
          const tempPw =
            String(body.temporaryPassword || body.new_password || '').trim() ||
            `Gv${randomHex(3)}123`
          const pwErr = validatePasswordStrength(tempPw)
          if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)
          targetUser.password_hash = await hashPassword(tempPw)
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_set_temp_password',
            target_email: targetUser.email,
            detail: { message: `Cấp mật khẩu tạm thời mới cho ${targetUser.email}` },
          })
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            temporaryPassword: tempPw,
            message: `Đã đặt mật khẩu mới cho ${targetUser.email}.`,
          })
        }

        if (method === 'DELETE' && !subAction) {
          if (targetUser.id === auth.user.id) {
            return jsonResponse(
              { success: false, error: 'Không thể tự xóa tài khoản Admin đang đăng nhập.' },
              400
            )
          }
          store.users = store.users.filter((u) => u.id !== targetUser.id)
          store.sessions = store.sessions.filter((s) => s.user_id !== targetUser.id)
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_delete_account',
            target_email: targetUser.email,
            detail: { message: `Xóa vĩnh viễn tài khoản ${targetUser.email}` },
          })
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            message: `Đã xóa tài khoản ${targetUser.email}.`,
          })
        }
      }

      if (method === 'PUT' && path === '/api/admin/settings') {
        const body = await readJsonBody(req)
        if (body.registration_mode) {
          store.appSettings.registration_mode = body.registration_mode
        }
        if (typeof body.google_login_enabled === 'boolean') {
          store.appSettings.google_login_enabled = body.google_login_enabled
        }
        if (typeof body.password_login_enabled === 'boolean') {
          store.appSettings.password_login_enabled = body.password_login_enabled
        }
        if (typeof body.notify_admin_email === 'boolean') {
          store.appSettings.notify_admin_email = body.notify_admin_email
        }
        if (body.max_accounts !== undefined) {
          store.appSettings.max_accounts = body.max_accounts
        }
        store.appSettings.updated_at = new Date().toISOString()
        appendAuditLog(store, {
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: 'admin_update_settings',
          detail: { registration_mode: store.appSettings.registration_mode },
        })
        await saveAuthStore(env, store)
        return jsonResponse({
          success: true,
          appSettings: store.appSettings,
          message: 'Đã cập nhật cài đặt hệ thống.',
        })
      }

      if (method === 'POST' && path === '/api/admin/invites') {
        const body = await readJsonBody(req)
        const code =
          String(body.customCode || body.custom_code || '')
            .trim()
            .toUpperCase() || `GV-${randomHex(3).toUpperCase()}`
        if (!Array.isArray(store.invites)) store.invites = []
        if (store.invites.some((i) => !i.revoked && i.code.toUpperCase() === code)) {
          return jsonResponse(
            { success: false, error: `Mã mời "${code}" đã tồn tại. Vui lòng chọn mã khác.` },
            400
          )
        }
        const days = Number(body.expiresInDays ?? body.expires_in_days ?? 0)
        const invite: InviteRecord = {
          id: generateId('inv'),
          code,
          email: body.email ? normalizeEmail(body.email) : null,
          max_uses: Number(body.maxUses ?? body.max_uses) || 1,
          used_count: 0,
          expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
          created_by: auth.user.email,
          created_at: new Date().toISOString(),
          revoked: false,
        }
        store.invites.unshift(invite)
        appendAuditLog(store, {
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: 'admin_create_invite',
          target_email: invite.email || undefined,
          detail: { code: invite.code, max_uses: invite.max_uses },
        })
        await saveAuthStore(env, store)
        return jsonResponse({
          success: true,
          invite,
          inviteUrl: `${url.origin}/auth/register?invite=${encodeURIComponent(invite.code)}`,
          message: `Đã tạo mã mời ${invite.code}.`,
        })
      }

      const inviteMatch = path.match(/^\/api\/admin\/invites\/([^/]+)(?:\/([^/]+))?$/)
      if (inviteMatch) {
        const invId = decodeURIComponent(inviteMatch[1])
        const sub = inviteMatch[2] || ''
        if (method === 'POST' && sub === 'revoke') {
          const inv = store.invites.find((i) => i.id === invId)
          if (!inv) return jsonResponse({ success: false, error: 'Không tìm thấy mã mời.' }, 404)
          inv.revoked = true
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_revoke_invite',
            detail: { code: inv.code },
          })
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            message: `Đã thu hồi mã mời ${inv.code}.`,
          })
        }
        if (method === 'DELETE' && !sub) {
          const inv = store.invites.find((i) => i.id === invId)
          store.invites = store.invites.filter((i) => i.id !== invId)
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_delete_invite',
            detail: { code: inv?.code || invId },
          })
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            message: 'Đã xóa mã mời.',
          })
        }
      }

      if (method === 'GET' && path === '/api/admin/tickets') {
        const tickets = await loadSupportTickets(env)
        return jsonResponse({
          success: true,
          tickets,
          openCount: tickets.filter((t) => t.status === 'open').length,
        })
      }

      const adminTicketMatch = path.match(/^\/api\/admin\/tickets\/([^/]+)\/(reply|status)$/)
      if (method === 'POST' && adminTicketMatch) {
        const ticketId = decodeURIComponent(adminTicketMatch[1])
        const action = adminTicketMatch[2]
        const body = await readJsonBody(req)
        const tickets = await loadSupportTickets(env)
        const ticket = tickets.find((t) => t.id === ticketId)
        if (!ticket) {
          return jsonResponse({ success: false, error: 'Không tìm thấy đơn hỗ trợ.' }, 404)
        }

        if (action === 'reply') {
          const text = String(body.message || body.text || '').trim()
          if (!text) {
            return jsonResponse({ success: false, error: 'Vui lòng nhập nội dung phản hồi.' }, 400)
          }
          const nowIso = new Date().toISOString()
          ticket.messages.push({
            id: generateId('msg'),
            sender_role: 'admin',
            sender_name: auth.user.full_name || 'Quản trị viên',
            text,
            created_at: nowIso,
          })
          ticket.status = 'replied'
          ticket.updated_at = nowIso
          await saveSupportTickets(env, tickets)
          appendAuditLog(store, {
            actor_id: auth.user.id,
            actor_email: auth.user.email,
            action: 'admin_reply_ticket',
            target_email: ticket.user_email,
            detail: { ticketId: ticket.id, subject: ticket.subject },
          })
          await saveAuthStore(env, store)
          return jsonResponse({ success: true, ticket, message: 'Đã gửi phản hồi cho giáo viên.' })
        }

        if (action === 'status') {
          const nextStatus = body.status === 'resolved' ? 'resolved' : 'open'
          ticket.status = nextStatus
          ticket.updated_at = new Date().toISOString()
          await saveSupportTickets(env, tickets)
          return jsonResponse({
            success: true,
            ticket,
            message: nextStatus === 'resolved' ? 'Đã đánh dấu đã giải quyết.' : 'Đã mở lại đơn.',
          })
        }
      }
    }

    // 9B. TEACHER SUPPORT & COMPLAINT TICKETS (/api/support/tickets)
    if (path.startsWith('/api/support/tickets')) {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) {
        return jsonResponse({ success: false, error: 'Vui lòng đăng nhập để sử dụng tính năng này.' }, 401)
      }

      if (method === 'GET' && path === '/api/support/tickets') {
        const all = await loadSupportTickets(env)
        const mine = all.filter((t) => t.user_id === auth.user.id)
        return jsonResponse({ success: true, tickets: mine })
      }

      if (method === 'POST' && path === '/api/support/tickets') {
        const body = await readJsonBody(req)
        const rawCategory = String(body.category || 'support')
        const category: SupportTicketRecord['category'] =
          rawCategory === 'complaint' || rawCategory === 'bug' || rawCategory === 'account'
            ? rawCategory
            : 'support'
        const subject = String(body.subject || '').trim()
        const text = String(body.message || body.text || '').trim()

        if (!subject || !text) {
          return jsonResponse(
            { success: false, error: 'Vui lòng nhập đầy đủ tiêu đề và nội dung.' },
            400
          )
        }

        const nowIso = new Date().toISOString()
        const ticket: SupportTicketRecord = {
          id: generateId('tkt'),
          user_id: auth.user.id,
          user_email: auth.user.email,
          user_name: auth.user.full_name || auth.user.email,
          category,
          subject: subject.slice(0, 140),
          status: 'open',
          messages: [
            {
              id: generateId('msg'),
              sender_role: 'user',
              sender_name: auth.user.full_name || auth.user.email,
              text: text.slice(0, 2000),
              created_at: nowIso,
            },
          ],
          created_at: nowIso,
          updated_at: nowIso,
        }

        const all = await loadSupportTickets(env)
        all.unshift(ticket)
        await saveSupportTickets(env, all)

        appendAuditLog(store, {
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: 'support_ticket_created',
          detail: { ticketId: ticket.id, category, subject: ticket.subject },
        })
        await saveAuthStore(env, store)

        // Thông báo email cho Admin nếu hệ thống đã cấu hình Resend + ADMIN_EMAIL
        const adminEmail = getAdminEmail(env)
        if (env.RESEND_API_KEY && adminEmail) {
          const catLabel =
            category === 'complaint'
              ? 'Khiếu nại'
              : category === 'bug'
                ? 'Báo lỗi'
                : category === 'account'
                  ? 'Tài khoản'
                  : 'Hỗ trợ'
          await sendEmailViaResend(
            env,
            adminEmail,
            `[Hỗ trợ GV - ${catLabel}] ${ticket.subject}`,
            `<div style="font-family:Arial,sans-serif;max-width:600px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
              <h3 style="margin:0 0 8px;">Đơn ${escapeHtml(catLabel)} mới từ ${escapeHtml(ticket.user_name)}</h3>
              <p style="margin:0 0 8px;color:#475569;font-size:13px;">Email: <strong>${escapeHtml(ticket.user_email)}</strong></p>
              <p style="margin:0 0 8px;font-weight:bold;">Tiêu đề: ${escapeHtml(ticket.subject)}</p>
              <div style="padding:12px;background:#f8fafc;border-radius:8px;white-space:pre-wrap;">${escapeHtml(text)}</div>
              <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Vào Cổng Quản trị (/admin) → tab Hỗ trợ & Khiếu nại để trả lời giáo viên.</p>
            </div>`
          ).catch(() => undefined)
        }

        return jsonResponse({
          success: true,
          ticket,
          message: 'Đã gửi đơn tới Quản trị viên thành công!',
        })
      }

      const replyMatch = path.match(/^\/api\/support\/tickets\/([^/]+)\/reply$/)
      if (method === 'POST' && replyMatch) {
        const ticketId = decodeURIComponent(replyMatch[1])
        const body = await readJsonBody(req)
        const text = String(body.message || body.text || '').trim()
        if (!text) {
          return jsonResponse({ success: false, error: 'Vui lòng nhập nội dung tin nhắn.' }, 400)
        }

        const all = await loadSupportTickets(env)
        const ticket = all.find((t) => t.id === ticketId && t.user_id === auth.user.id)
        if (!ticket) {
          return jsonResponse({ success: false, error: 'Không tìm thấy đơn hỗ trợ.' }, 404)
        }

        const nowIso = new Date().toISOString()
        ticket.messages.push({
          id: generateId('msg'),
          sender_role: 'user',
          sender_name: auth.user.full_name || auth.user.email,
          text: text.slice(0, 2000),
          created_at: nowIso,
        })
        ticket.status = 'open'
        ticket.updated_at = nowIso
        await saveSupportTickets(env, all)

        return jsonResponse({ success: true, ticket })
      }
    }

    // 10. CLOUD SYNC (/api/sync) - LƯU & ĐỒNG BỘ LỊCH DẠY RIÊNG BIỆT CHO TỪNG TÀI KHOẢN TRÊN CLOUDFLARE D1
    if (path === '/api/sync') {
      if (method === 'GET') {
        const userId = (url.searchParams.get('user_id') || '').trim()
        if (!userId || userId === 'local') {
          return jsonResponse(emptyServerState())
        }
        const state =
          (await kvGet<ServerState>(env.DB, syncKeyForUser(userId))) || emptyServerState()
        return jsonResponse(state)
      }

      if (method === 'PUT' || method === 'POST') {
        const body = await readJsonBody(req)
        const userId = String(body.user_id || '').trim()
        if (!userId || userId === 'local') {
          return jsonResponse({ ok: false, error: 'Thiếu user_id hợp lệ' }, 400)
        }
        const stateToSave: ServerState = {
          classes: Array.isArray(body.classes) ? body.classes : [],
          students: Array.isArray(body.students) ? body.students : [],
          studentEnrollments: Array.isArray(body.studentEnrollments)
            ? body.studentEnrollments
            : [],
          studentStatusHistory: Array.isArray(body.studentStatusHistory)
            ? body.studentStatusHistory
            : [],
          sessionGuests: Array.isArray(body.sessionGuests) ? body.sessionGuests : [],
          scheduleRules: Array.isArray(body.scheduleRules) ? body.scheduleRules : [],
          sessionExceptions: Array.isArray(body.sessionExceptions) ? body.sessionExceptions : [],
          extraSessions: Array.isArray(body.extraSessions) ? body.extraSessions : [],
          schoolPeriods: Array.isArray(body.schoolPeriods) ? body.schoolPeriods : [],
          schoolSchedule: Array.isArray(body.schoolSchedule) ? body.schoolSchedule : [],
          schoolWeekConfigs: Array.isArray(body.schoolWeekConfigs) ? body.schoolWeekConfigs : [],
          holidays: Array.isArray(body.holidays) ? body.holidays : [],
          sessionNotes: Array.isArray(body.sessionNotes) ? body.sessionNotes : [],
          attendance: Array.isArray(body.attendance) ? body.attendance : [],
          payments: Array.isArray(body.payments) ? body.payments : [],
          paymentTransactions: Array.isArray(body.paymentTransactions)
            ? body.paymentTransactions
            : [],
          monthLocks: Array.isArray(body.monthLocks) ? body.monthLocks : [],
          changeLogs: Array.isArray(body.changeLogs) ? body.changeLogs : [],
          calendarEventMap: Array.isArray(body.calendarEventMap) ? body.calendarEventMap : [],
          calendarSyncLogs: Array.isArray(body.calendarSyncLogs) ? body.calendarSyncLogs : [],
          settings: body.settings || null,
          notificationLogs: Array.isArray(body.notificationLogs) ? body.notificationLogs : [],
        }

        await kvSet(env.DB, syncKeyForUser(userId), stateToSave)
        return jsonResponse({
          ok: true,
          synced_at: new Date().toISOString(),
          classes_count: stateToSave.classes.length,
        })
      }
    }

    // 11. EMAIL TEST (/api/email/test) & CRON DAILY EMAIL (/api/cron/daily-email) QUA RESEND HTTP API TRÊN EDGE
    if (method === 'POST' && path === '/api/email/test') {
      const body = await readJsonBody(req)
      const to = String(body.to || '').trim()
      if (!to) return jsonResponse({ error: 'Thiếu địa chỉ email người nhận.' }, 400)

      const nowVn = getVietnamDateInfo()
      const items = Array.isArray(body.items) ? (body.items as DailyEmailItem[]) : []
      const subject = `[Lịch dạy] Thông báo lịch dạy hôm nay (${nowVn.displayDate})`
      const html = buildDailyScheduleEmailHtml('Thầy/Cô', nowVn.displayDate, items)

      if (env.RESEND_API_KEY) {
        const res = await sendEmailViaResend(env, to, subject, html)
        if (!res.ok) {
          return jsonResponse({ error: `Resend API lỗi: ${res.error}` }, 500)
        }
        return jsonResponse({ ok: true, provider: 'resend' })
      }

      return jsonResponse({
        ok: true,
        provider: 'edge-simulated',
        result: { simulated: true },
        message:
          'Đã kiểm tra luồng thông báo trên Cloudflare Edge (Thêm RESEND_API_KEY trong Settings -> Variables của Cloudflare để gửi email thật).',
      })
    }

    if ((method === 'GET' || method === 'POST') && path === '/api/cron/daily-email') {
      const expectedSecret = (env.CRON_SECRET || '').trim()
      if (expectedSecret) {
        const bearer = extractBearerToken(req) || ''
        const querySecret = url.searchParams.get('secret') || ''
        const headerSecret = req.headers.get('x-cron-secret') || ''
        if (
          bearer !== expectedSecret &&
          querySecret !== expectedSecret &&
          headerSecret !== expectedSecret
        ) {
          return jsonResponse({ ok: false, error: 'Unauthorized cron trigger.' }, 401)
        }
      }

      if (!env.RESEND_API_KEY) {
        return jsonResponse(
          {
            ok: false,
            error:
              'Chưa cấu hình RESEND_API_KEY trong Cloudflare Pages -> Settings -> Variables and secrets.',
          },
          400
        )
      }

      const force = url.searchParams.get('force') === '1'
      const nowVn = getVietnamDateInfo()
      const currentMinutes = nowVn.hour * 60 + nowVn.minute
      const allStates = await kvListByPrefix<ServerState>(env.DB, 'v3_clean_sync_state:')
      const authStore = await loadAuthStore(env)

      let checkedUsers = 0
      let sentCount = 0
      let skippedCount = 0
      const errors: Array<{ userId: string; error: string }> = []

      for (const entry of allStates) {
        const userId = entry.key.replace('v3_clean_sync_state:', '').trim()
        if (!userId || userId === 'local') continue
        checkedUsers++

        const state = entry.value
        const settings = (state.settings || {}) as Record<string, unknown>
        const notifyEnabled = Boolean(settings.notify_enabled)
        const notifyEmail = String(settings.notify_email || '').trim()

        if (!notifyEnabled || !notifyEmail) {
          skippedCount++
          continue
        }

        // Kiểm tra ngày nghỉ lễ
        const holidays = Array.isArray(state.holidays)
          ? (state.holidays as Array<{ date?: string }>)
          : []
        if (holidays.some((h) => h.date === nowVn.dateStr)) {
          skippedCount++
          continue
        }

        // Kiểm tra giờ gửi (mặc định 06:00) và chống gửi trùng trong ngày
        const notifyTime = String(settings.notify_time || '06:00')
        const [hhStr, mmStr] = notifyTime.split(':')
        const notifyMinutes = (Number(hhStr) || 6) * 60 + (Number(mmStr) || 0)

        const sentKey = `v3_clean_email_sent:${userId}`
        const sentRecord = await kvGet<{ date: string }>(env.DB, sentKey)
        if (!force && (sentRecord?.date === nowVn.dateStr || currentMinutes < notifyMinutes)) {
          skippedCount++
          continue
        }

        const profile = authStore.users.find((u) => u.id === userId)
        const teacherName = profile?.full_name || 'Thầy/Cô'
        const items = computeDailyEmailItemsForState(state, nowVn.dateStr, nowVn.weekday)
        const subject = `[Lịch dạy] Lịch hôm nay (${nowVn.displayDate}) - ${items.length} buổi`
        const html = buildDailyScheduleEmailHtml(teacherName, nowVn.displayDate, items)

        const sendRes = await sendEmailViaResend(env, notifyEmail, subject, html)
        if (sendRes.ok) {
          sentCount++
          await kvSet(env.DB, sentKey, {
            date: nowVn.dateStr,
            sent_at: new Date().toISOString(),
            to: notifyEmail,
          })
        } else {
          errors.push({ userId, error: sendRes.error || 'Unknown error' })
        }
      }

      return jsonResponse({
        ok: true,
        date: nowVn.dateStr,
        timeVn: `${String(nowVn.hour).padStart(2, '0')}:${String(nowVn.minute).padStart(2, '0')}`,
        checkedUsers,
        sentCount,
        skippedCount,
        errors,
      })
    }

    // 12. AI ENDPOINTS (/api/ai/*)
    if (method === 'POST' && path === '/api/ai/parse-zalo') {
      const body = await readJsonBody(req)
      const text = String(body.text || '')
      return jsonResponse(parseZaloRuleBased(text))
    }

    if (
      method === 'POST' &&
      (path === '/api/ai/parse-school-image' || path === '/api/ai/parse-image')
    ) {
      if (!env.GEMINI_API_KEY) {
        return jsonResponse(
          {
            error:
              'Chưa cấu hình GEMINI_API_KEY trong Cloudflare Pages -> Settings -> Variables.',
          },
          400
        )
      }
      return jsonResponse({ items: [], rawText: 'Đã kết nối Gemini Edge.' })
    }

    if (method === 'POST' && path === '/api/ai/help-chat') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) {
        return jsonResponse({ success: false, error: 'Vui lòng đăng nhập để sử dụng trợ lý.' }, 401)
      }

      const body = await readJsonBody(req)
      const message = String(body.message || '').trim()
      const currentPath = String(body.currentPath || '/').trim()
      const history = Array.isArray(body.history) ? body.history.slice(-6) : []

      if (!message) {
        return jsonResponse({ success: false, error: 'Vui lòng nhập câu hỏi.' }, 400)
      }

      const guard = checkHelpChatGuardrail(message)
      if (guard.blocked) {
        return jsonResponse({
          success: true,
          reply: guard.reply,
          mode: 'guardrail',
          blockedReason: guard.reason,
        })
      }

      const role = auth.user.role === 'admin' ? 'admin' : 'teacher'
      if (env.GEMINI_API_KEY) {
        const geminiReply = await callGeminiHelpChat(
          env.GEMINI_API_KEY,
          message,
          role,
          currentPath,
          history
        )
        if (geminiReply) {
          return jsonResponse({
            success: true,
            reply: geminiReply,
            mode: 'gemini',
          })
        }
      }

      return jsonResponse({
        success: true,
        reply: buildRuleBasedHelpReply(message, role, currentPath),
        mode: 'knowledge_base',
      })
    }

    // 13. GOOGLE CALENDAR ENDPOINTS (/api/gcal/*)
    if (method === 'GET' && path === '/api/gcal/status') {
      return jsonResponse({
        configured: false,
        connected: false,
        calendar_id: 'primary',
      })
    }
    if (method === 'GET' && path === '/api/gcal/logs') {
      return jsonResponse({ logs: [] })
    }

    return jsonResponse({ error: `Không tìm thấy API endpoint: ${method} ${path}` }, 404)
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Lỗi xử lý tại Cloudflare Edge',
      },
      500
    )
  }
}

// Cloudflare Pages Functions entrypoint (`functions/api/[[route]].ts`)
export const onRequest = async (context: PagesContext): Promise<Response> => {
  return handleApiRequest(context.request, context.env || {})
}

// Cloudflare Standalone Worker entrypoint (`export default { fetch }`)
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleApiRequest(request, env || {})
  },
}
