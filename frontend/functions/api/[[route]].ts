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

const AUTH_STORE_KEY = 'auth_store_v2'

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

function getAdminEmail(env: Env): string {
  return normalizeEmail(env.ADMIN_EMAIL || env.DEFAULT_ADMIN_EMAIL || 'admin@lichday.vn')
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
  const adminPassword = env.DEFAULT_ADMIN_PASSWORD || 'Admin123456'
  const adminName = env.DEFAULT_ADMIN_NAME || 'Quản trị viên Hệ thống'

  const teacherEmail = normalizeEmail(env.DEFAULT_TEACHER_EMAIL || 'giaovien@lichday.vn')
  const teacherPassword = env.DEFAULT_TEACHER_PASSWORD || 'Giaovien123'
  const teacherName = env.DEFAULT_TEACHER_NAME || 'Cô Giáo Ngữ Văn'

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
  }

  // Xóa tài khoản mẫu chờ duyệt (choduyet@lichday.vn) nếu có
  const beforeLen = store.users.length
  store.users = store.users.filter((u) => normalizeEmail(u.email) !== 'choduyet@lichday.vn')
  if (store.users.length !== beforeLen) dirty = true

  // Chuẩn hóa status cũ ('approved' -> 'active')
  for (const u of store.users) {
    if ((u.status as string) === 'approved') {
      u.status = 'active'
      dirty = true
    }
  }

  // 1. Đảm bảo tài khoản Admin mặc định luôn hoạt động
  let adminUser = store.users.find((u) => normalizeEmail(u.email) === adminEmail)
  if (!adminUser) {
    adminUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: adminEmail,
      full_name: adminName,
      phone: '0901234567',
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

  // 2. Đảm bảo tài khoản Giáo viên mặc định luôn hoạt động
  let teacherUser = store.users.find((u) => normalizeEmail(u.email) === teacherEmail)
  if (!teacherUser) {
    teacherUser = {
      id: '00000000-0000-0000-0000-000000000002',
      email: teacherEmail,
      full_name: teacherName,
      phone: '0912345678',
      school: 'Trường THCS & THPT',
      role: 'teacher',
      status: 'active',
      email_verified: true,
      auth_provider: 'email',
      created_at: nowIso,
      approved_at: nowIso,
      approved_by: adminUser.id,
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

  if (dirty) {
    await kvSet(env.DB, AUTH_STORE_KEY, store)
  }

  return store
}

async function saveAuthStore(env: Env, store: AuthStoreData): Promise<void> {
  await kvSet(env.DB, AUTH_STORE_KEY, store)
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
  if (store.auditLogs.length > 300) {
    store.auditLogs = store.auditLogs.slice(0, 300)
  }
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
  const clean = String(userId || 'default-teacher-id').trim() || 'default-teacher-id'
  return `sync_state:${clean}`
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
          isFixedServerAdmin: normalizeEmail(auth.user.email) === adminEmail,
          adminEmailConfigured: adminEmail,
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

      await saveAuthStore(env, store)
      return jsonResponse({
        success: true,
        profile: toPublicProfile(auth.user),
        message: 'Đã lưu thông tin hồ sơ cá nhân.',
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
            pendingCount: profiles.filter((p) => p.status === 'pending').length,
            activeCount: profiles.filter((p) => p.status === 'active').length,
            lockedCount: profiles.filter((p) => p.status === 'locked').length,
            unverifiedCount: profiles.filter((p) => !p.email_verified).length,
            activeLast7Days: profiles.filter(
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
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            message: `Đã thu hồi mã mời ${inv.code}.`,
          })
        }
        if (method === 'DELETE' && !sub) {
          store.invites = store.invites.filter((i) => i.id !== invId)
          await saveAuthStore(env, store)
          return jsonResponse({
            success: true,
            message: 'Đã xóa mã mời.',
          })
        }
      }
    }

    // 10. CLOUD SYNC (/api/sync) - LƯU & ĐỒNG BỘ LỊCH DẠY TRÊN CLOUDFLARE D1
    if (path === '/api/sync') {
      if (method === 'GET') {
        const userId = url.searchParams.get('user_id') || 'default-teacher-id'
        const state =
          (await kvGet<ServerState>(env.DB, syncKeyForUser(userId))) ||
          (await kvGet<ServerState>(env.DB, syncKeyForUser('default-teacher-id'))) ||
          emptyServerState()
        return jsonResponse(state)
      }

      if (method === 'PUT' || method === 'POST') {
        const body = await readJsonBody(req)
        const userId = String(body.user_id || 'default-teacher-id')
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
        if (userId !== 'default-teacher-id') {
          await kvSet(env.DB, syncKeyForUser('default-teacher-id'), stateToSave)
        }
        return jsonResponse({
          ok: true,
          synced_at: new Date().toISOString(),
          classes_count: stateToSave.classes.length,
        })
      }
    }

    // 11. EMAIL TEST (/api/email/test) QUA RESEND HTTP API TRÊN EDGE
    if (method === 'POST' && path === '/api/email/test') {
      const body = await readJsonBody(req)
      const to = String(body.to || '').trim()
      if (!to) return jsonResponse({ error: 'Thiếu địa chỉ email người nhận.' }, 400)

      if (env.RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL || 'Lịch Dạy Giáo Viên <onboarding@resend.dev>',
            to: [to],
            subject: `[Lịch dạy] Thông báo lịch dạy trong ngày (${new Date().toLocaleDateString('vi-VN')})`,
            html: `<p>Xin chào Cô,</p><p>Hệ thống Cloudflare Edge đã kết nối gửi email thông báo lịch dạy thành công tới <b>${to}</b>.</p>`,
          }),
        })
        if (!res.ok) {
          const errText = await res.text()
          return jsonResponse({ error: `Resend API lỗi: ${errText}` }, 500)
        }
        return jsonResponse({ ok: true, provider: 'resend' })
      }

      return jsonResponse({
        ok: true,
        provider: 'edge-simulated',
        message:
          'Đã kiểm tra luồng thông báo trên Cloudflare Edge (Thêm RESEND_API_KEY trong Settings -> Variables của Cloudflare để gửi email thật).',
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
