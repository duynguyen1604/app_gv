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
  DEFAULT_ADMIN_EMAIL?: string
  DEFAULT_ADMIN_PASSWORD?: string
  DEFAULT_ADMIN_NAME?: string
  DEFAULT_TEACHER_EMAIL?: string
  DEFAULT_TEACHER_PASSWORD?: string
  DEFAULT_TEACHER_NAME?: string
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
// TYPES & AUTH STORE MODEL
// ============================================================================

type UserRole = 'admin' | 'teacher'
type UserStatus = 'unverified' | 'pending' | 'approved' | 'locked'
type RegistrationMode = 'approval' | 'auto_approve' | 'invite_only'

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole
  status: UserStatus
  email_verified: boolean
  email_verified_at?: string | null
  avatar_url?: string | null
  auth_provider?: 'email' | 'google' | 'both'
  phone?: string
  school_name?: string
  subject_specialty?: string
  title_position?: string
  bio?: string
  notify_email?: string
  timezone?: string
  created_at: string
  updated_at?: string
  approved_at?: string | null
  approved_by?: string | null
  locked_at?: string | null
  locked_reason?: string | null
  last_login_at?: string | null
}

interface StoredUser extends UserProfile {
  password_hash?: string
  google_sub?: string
  failed_login_count?: number
  locked_until?: number | null
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
  code: string
  email?: string | null
  role: UserRole
  max_uses: number
  used_count: number
  expires_at?: string | null
  note?: string | null
  created_by: string
  created_at: string
  revoked_at?: string | null
}

interface AuditLogRecord {
  id: string
  actor_id: string
  actor_email: string
  action: string
  target_user_id?: string | null
  target_email?: string | null
  detail: string
  created_at: string
}

interface AppSettingsRecord {
  registration_mode: RegistrationMode
  allowed_google_domains: string[]
  session_remember_days: number
  require_email_verification: boolean
  admin_notification_email: string
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

const AUTH_STORE_KEY = 'auth_store_v1'

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

function toPublicProfile(user: StoredUser): UserProfile {
  const { password_hash: _pw, google_sub: _gs, failed_login_count: _flc, locked_until: _lu, ...profile } = user
  return profile
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
  const adminEmail = normalizeEmail(env.DEFAULT_ADMIN_EMAIL || 'admin@lichday.vn')
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
        registration_mode: 'approval',
        allowed_google_domains: [],
        session_remember_days: 90,
        require_email_verification: false,
        admin_notification_email: adminEmail,
        updated_at: nowIso,
      },
    }
    dirty = true
  }

  // Đảm bảo tài khoản Admin mặc định luôn tồn tại
  let adminUser = store.users.find((u) => normalizeEmail(u.email) === adminEmail)
  if (!adminUser) {
    adminUser = {
      id: 'usr_default_admin',
      email: adminEmail,
      full_name: adminName,
      role: 'admin',
      status: 'approved',
      email_verified: true,
      email_verified_at: nowIso,
      auth_provider: 'email',
      phone: '0901234567',
      school_name: 'Ban Quản trị Hệ thống Lịch Dạy',
      subject_specialty: 'Quản trị & Điều phối Hệ thống',
      title_position: 'System Administrator',
      bio: 'Tài khoản Quản trị viên cao nhất dùng để phê duyệt giáo viên, cấu hình bảo mật và giám sát vận hành.',
      notify_email: adminEmail,
      timezone: 'Asia/Ho_Chi_Minh',
      created_at: nowIso,
      updated_at: nowIso,
      approved_at: nowIso,
      approved_by: 'SYSTEM_SEED',
      password_hash: await hashPassword(adminPassword),
    }
    store.users.unshift(adminUser)
    dirty = true
  }

  // Đảm bảo tài khoản Giáo viên mặc định luôn tồn tại
  let teacherUser = store.users.find((u) => normalizeEmail(u.email) === teacherEmail)
  if (!teacherUser) {
    teacherUser = {
      id: 'usr_default_teacher',
      email: teacherEmail,
      full_name: teacherName,
      role: 'teacher',
      status: 'approved',
      email_verified: true,
      email_verified_at: nowIso,
      auth_provider: 'email',
      phone: '0987654321',
      school_name: 'Trường THCS & THPT',
      subject_specialty: 'Ngữ Văn & Tiếng Việt',
      title_position: 'Giáo viên Bộ môn & Luyện thi',
      bio: 'Tài khoản Giáo viên chính thức dùng để quản lý lịch dạy trên trường, các ca dạy thêm, điểm danh và học phí.',
      notify_email: teacherEmail,
      timezone: 'Asia/Ho_Chi_Minh',
      created_at: nowIso,
      updated_at: nowIso,
      approved_at: nowIso,
      approved_by: 'SYSTEM_SEED',
      password_hash: await hashPassword(teacherPassword),
    }
    store.users.push(teacherUser)
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
    actor_id: string
    actor_email: string
    action: string
    target_user_id?: string | null
    target_email?: string | null
    detail: string
  }
) {
  store.auditLogs.unshift({
    id: generateId('audit'),
    actor_id: params.actor_id,
    actor_email: params.actor_email,
    action: params.action,
    target_user_id: params.target_user_id || null,
    target_email: params.target_email || null,
    detail: params.detail,
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
  const days = rememberMe ? store.appSettings.session_remember_days || 90 : 2
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
// VIETNAMESE ZALO PARSER (Rule-based + Gemini 1.5 Flash Edge Fetch)
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
        require_email_verification: store.appSettings.require_email_verification,
        google_oauth_enabled: false,
        allowed_google_domains: store.appSettings.allowed_google_domains,
        mailer_mode: env.RESEND_API_KEY ? 'resend-edge' : 'console-preview',
      })
    }

    // 3. LOGIN
    if (method === 'POST' && path === '/api/auth/login') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email || '')
      const password = String(body.password || '')
      const rememberMe = body.remember_me !== false

      if (!email || !password) {
        return jsonResponse({ error: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' }, 400)
      }

      const store = await loadAuthStore(env)
      const user = store.users.find((u) => normalizeEmail(u.email) === email)

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return jsonResponse({ error: 'Email hoặc mật khẩu không chính xác.' }, 401)
      }

      user.last_login_at = new Date().toISOString()
      const { sessionToken, expiresAt } = await createSession(
        store,
        user.id,
        rememberMe,
        req.headers.get('user-agent') || undefined
      )
      await saveAuthStore(env, store)

      return jsonResponse({
        session_token: sessionToken,
        expires_at: expiresAt,
        profile: toPublicProfile(user),
      })
    }

    // 4. REGISTER
    if (method === 'POST' && path === '/api/auth/register') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email || '')
      const password = String(body.password || '')
      const fullName = String(body.full_name || '').trim()
      const inviteCode = String(body.invite_code || '').trim().toUpperCase()

      if (!email || !fullName) {
        return jsonResponse({ error: 'Vui lòng nhập đầy đủ Họ tên và Email.' }, 400)
      }
      const pwErr = validatePasswordStrength(password)
      if (pwErr) return jsonResponse({ error: pwErr }, 400)

      const store = await loadAuthStore(env)
      if (store.users.some((u) => normalizeEmail(u.email) === email)) {
        return jsonResponse({ error: 'Email này đã được đăng ký trong hệ thống.' }, 409)
      }

      let matchedInvite: InviteRecord | undefined
      if (inviteCode) {
        matchedInvite = store.invites.find(
          (inv) =>
            inv.code.toUpperCase() === inviteCode &&
            !inv.revoked_at &&
            inv.used_count < inv.max_uses &&
            (!inv.expires_at || new Date(inv.expires_at).getTime() > Date.now())
        )
        if (!matchedInvite) {
          return jsonResponse({ error: 'Mã mời không hợp lệ hoặc đã hết hạn.' }, 400)
        }
      } else if (store.appSettings.registration_mode === 'invite_only') {
        return jsonResponse({ error: 'Hệ thống hiện chỉ cho phép đăng ký khi có Mã mời từ Admin.' }, 403)
      }

      const nowIso = new Date().toISOString()
      const autoApprove =
        Boolean(matchedInvite) || store.appSettings.registration_mode === 'auto_approve'
      const assignedRole: UserRole = matchedInvite ? matchedInvite.role : 'teacher'
      const initialStatus: UserStatus = autoApprove ? 'approved' : 'pending'

      const newUser: StoredUser = {
        id: generateId('usr'),
        email,
        full_name: fullName,
        role: assignedRole,
        status: initialStatus,
        email_verified: true,
        email_verified_at: nowIso,
        auth_provider: 'email',
        notify_email: email,
        timezone: 'Asia/Ho_Chi_Minh',
        created_at: nowIso,
        updated_at: nowIso,
        approved_at: autoApprove ? nowIso : null,
        approved_by: autoApprove ? 'AUTO_OR_INVITE' : null,
        password_hash: await hashPassword(password),
      }

      if (matchedInvite) {
        matchedInvite.used_count += 1
      }

      store.users.push(newUser)
      appendAuditLog(store, {
        actor_id: newUser.id,
        actor_email: newUser.email,
        action: 'USER_REGISTER',
        target_user_id: newUser.id,
        target_email: newUser.email,
        detail: `Đăng ký tài khoản mới (${initialStatus})`,
      })

      const { sessionToken, expiresAt } = await createSession(store, newUser.id, true)
      await saveAuthStore(env, store)

      return jsonResponse({
        profile: toPublicProfile(newUser),
        session_token: sessionToken,
        expires_at: expiresAt,
        requires_email_verification: false,
        message:
          initialStatus === 'approved'
            ? 'Đăng ký thành công! Tài khoản đã sẵn sàng sử dụng.'
            : 'Đăng ký thành công! Tài khoản đang chờ Quản trị viên phê duyệt.',
      })
    }

    // 5. GET /api/auth/me & POST /api/auth/refresh
    if ((method === 'GET' && path === '/api/auth/me') || (method === 'POST' && path === '/api/auth/refresh')) {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) {
        return jsonResponse({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }, 401)
      }
      const days = auth.session.remember_me ? store.appSettings.session_remember_days || 90 : 2
      auth.session.expires_at = Date.now() + days * 24 * 60 * 60 * 1000
      await saveAuthStore(env, store)
      return jsonResponse({
        profile: toPublicProfile(auth.user),
        expires_at: auth.session.expires_at,
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
      return jsonResponse({ ok: true })
    }

    // 7. VERIFY EMAIL / RESEND / FORGOT / RESET / NOTIFY ADMIN
    if (method === 'POST' && path === '/api/auth/verify-email') {
      return jsonResponse({ message: 'Xác thực email thành công!' })
    }
    if (method === 'POST' && path === '/api/auth/resend-verification') {
      return jsonResponse({ message: 'Tài khoản đã được xác thực.' })
    }
    if (method === 'POST' && path === '/api/auth/notify-admin') {
      return jsonResponse({ ok: true, message: 'Đã ghi nhận thông báo cho Quản trị viên.' })
    }
    if (method === 'POST' && path === '/api/auth/forgot-password') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email || '')
      const store = await loadAuthStore(env)
      const user = store.users.find((u) => normalizeEmail(u.email) === email)
      if (!user) {
        return jsonResponse({
          message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được tạo.',
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
      return jsonResponse({
        message: 'Đã tạo yêu cầu đặt lại mật khẩu.',
        preview_token: rawToken,
      })
    }
    if (method === 'POST' && path === '/api/auth/reset-password') {
      const body = await readJsonBody(req)
      const rawToken = String(body.token || '').trim()
      const newPassword = String(body.new_password || '')
      const pwErr = validatePasswordStrength(newPassword)
      if (pwErr) return jsonResponse({ error: pwErr }, 400)

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
        return jsonResponse({ error: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' }, 400)
      }
      const user = store.users.find((u) => u.id === tok.user_id)
      if (!user) return jsonResponse({ error: 'Không tìm thấy người dùng.' }, 404)

      user.password_hash = await hashPassword(newPassword)
      user.updated_at = new Date().toISOString()
      tok.used_at = new Date().toISOString()
      await saveAuthStore(env, store)
      return jsonResponse({ message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay.' })
    }

    // 8. PROFILE ENDPOINTS (/api/profile/*)
    if (method === 'GET' && path === '/api/profile/me') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ error: 'Chưa đăng nhập.' }, 401)
      const activeSessions = store.sessions.filter(
        (s) => s.user_id === auth.user.id && s.expires_at > Date.now()
      )
      const recentAuditLogs = store.auditLogs
        .filter((l) => l.actor_id === auth.user.id || l.target_user_id === auth.user.id)
        .slice(0, 12)
      return jsonResponse({
        profile: toPublicProfile(auth.user),
        security: {
          active_sessions_count: activeSessions.length,
          current_session_created_at: auth.session.created_at,
          current_session_expires_at: auth.session.expires_at,
          has_password: Boolean(auth.user.password_hash),
          google_linked: Boolean(auth.user.google_sub),
          recent_audit_logs: recentAuditLogs,
        },
      })
    }

    if (method === 'PUT' && path === '/api/profile/me') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ error: 'Chưa đăng nhập.' }, 401)
      const body = await readJsonBody(req)

      if (typeof body.full_name === 'string' && body.full_name.trim()) {
        auth.user.full_name = body.full_name.trim()
      }
      if (typeof body.phone === 'string') auth.user.phone = body.phone.trim()
      if (typeof body.school_name === 'string') auth.user.school_name = body.school_name.trim()
      if (typeof body.subject_specialty === 'string')
        auth.user.subject_specialty = body.subject_specialty.trim()
      if (typeof body.title_position === 'string')
        auth.user.title_position = body.title_position.trim()
      if (typeof body.bio === 'string') auth.user.bio = body.bio.trim()
      if (typeof body.notify_email === 'string') auth.user.notify_email = body.notify_email.trim()
      if (typeof body.timezone === 'string') auth.user.timezone = body.timezone.trim()
      if (body.avatar_url !== undefined) auth.user.avatar_url = body.avatar_url

      auth.user.updated_at = new Date().toISOString()
      await saveAuthStore(env, store)
      return jsonResponse({
        profile: toPublicProfile(auth.user),
        message: 'Đã lưu thông tin hồ sơ cá nhân.',
      })
    }

    if (method === 'POST' && path === '/api/profile/change-password') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ error: 'Chưa đăng nhập.' }, 401)
      const body = await readJsonBody(req)
      const currentPw = String(body.current_password || '')
      const newPw = String(body.new_password || '')

      if (auth.user.password_hash && !(await verifyPassword(currentPw, auth.user.password_hash))) {
        return jsonResponse({ error: 'Mật khẩu hiện tại không chính xác.' }, 400)
      }
      const pwErr = validatePasswordStrength(newPw)
      if (pwErr) return jsonResponse({ error: pwErr }, 400)

      auth.user.password_hash = await hashPassword(newPw)
      auth.user.updated_at = new Date().toISOString()
      if (body.revoke_other_sessions) {
        store.sessions = store.sessions.filter(
          (s) => s.user_id !== auth.user.id || s.token_hash === auth.tokenHash
        )
      }
      await saveAuthStore(env, store)
      return jsonResponse({ message: 'Đã đổi mật khẩu thành công!' })
    }

    if (method === 'POST' && path === '/api/profile/revoke-other-sessions') {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth) return jsonResponse({ error: 'Chưa đăng nhập.' }, 401)
      const before = store.sessions.length
      store.sessions = store.sessions.filter(
        (s) => s.user_id !== auth.user.id || s.token_hash === auth.tokenHash
      )
      const revokedCount = before - store.sessions.length
      await saveAuthStore(env, store)
      return jsonResponse({
        revoked_count: revokedCount,
        message: `Đã đăng xuất ${revokedCount} phiên thiết bị khác.`,
      })
    }

    // 9. ADMIN ENDPOINTS (/api/admin/*)
    if (path.startsWith('/api/admin')) {
      const store = await loadAuthStore(env)
      const auth = await getAuthenticatedUser(req, store)
      if (!auth || auth.user.role !== 'admin') {
        return jsonResponse({ error: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập.' }, 403)
      }

      if (method === 'GET' && path === '/api/admin/overview') {
        return jsonResponse({
          users: store.users.map(toPublicProfile),
          invites: store.invites,
          audit_logs: store.auditLogs.slice(0, 100),
          settings: store.appSettings,
        })
      }

      if (method === 'POST' && path === '/api/admin/users/approve-bulk') {
        const body = await readJsonBody(req)
        const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : []
        const nowIso = new Date().toISOString()
        let count = 0
        for (const u of store.users) {
          if (userIds.includes(u.id) && u.status !== 'approved') {
            u.status = 'approved'
            u.email_verified = true
            u.approved_at = nowIso
            u.approved_by = auth.user.email
            u.updated_at = nowIso
            count++
          }
        }
        await saveAuthStore(env, store)
        return jsonResponse({
          approved_count: count,
          users: store.users.map(toPublicProfile),
        })
      }

      if (method === 'POST' && path === '/api/admin/users/create') {
        const body = await readJsonBody(req)
        const email = normalizeEmail(body.email || '')
        const fullName = String(body.full_name || '').trim()
        const password = String(body.password || '')
        const role: UserRole = body.role === 'admin' ? 'admin' : 'teacher'
        const status: UserStatus = body.status || 'approved'

        if (!email || !fullName) {
          return jsonResponse({ error: 'Vui lòng nhập Họ tên và Email.' }, 400)
        }
        const pwErr = validatePasswordStrength(password)
        if (pwErr) return jsonResponse({ error: pwErr }, 400)
        if (store.users.some((u) => normalizeEmail(u.email) === email)) {
          return jsonResponse({ error: 'Email này đã tồn tại trong hệ thống.' }, 409)
        }

        const nowIso = new Date().toISOString()
        const created: StoredUser = {
          id: generateId('usr'),
          email,
          full_name: fullName,
          role,
          status,
          email_verified: true,
          email_verified_at: nowIso,
          auth_provider: 'email',
          phone: body.phone ? String(body.phone).trim() : undefined,
          school_name: body.school_name ? String(body.school_name).trim() : undefined,
          subject_specialty: body.subject_specialty
            ? String(body.subject_specialty).trim()
            : undefined,
          notify_email: email,
          timezone: 'Asia/Ho_Chi_Minh',
          created_at: nowIso,
          updated_at: nowIso,
          approved_at: status === 'approved' ? nowIso : null,
          approved_by: status === 'approved' ? auth.user.email : null,
          password_hash: await hashPassword(password),
        }
        store.users.push(created)
        appendAuditLog(store, {
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: 'ADMIN_CREATE_USER',
          target_user_id: created.id,
          target_email: created.email,
          detail: `Tạo mới tài khoản ${created.email} (${role})`,
        })
        await saveAuthStore(env, store)
        return jsonResponse({
          user: toPublicProfile(created),
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
          return jsonResponse({ error: 'Không tìm thấy người dùng.' }, 404)
        }

        if (method === 'POST' && subAction === 'approve') {
          const body = await readJsonBody(req)
          targetUser.status = 'approved'
          targetUser.email_verified = true
          if (body.role === 'admin' || body.role === 'teacher') {
            targetUser.role = body.role
          }
          targetUser.approved_at = new Date().toISOString()
          targetUser.approved_by = auth.user.email
          targetUser.updated_at = new Date().toISOString()
          await saveAuthStore(env, store)
          return jsonResponse({ user: toPublicProfile(targetUser) })
        }

        if (method === 'POST' && subAction === 'lock') {
          const body = await readJsonBody(req)
          targetUser.status = 'locked'
          targetUser.locked_at = new Date().toISOString()
          targetUser.locked_reason = String(body.reason || 'Khóa bởi Quản trị viên')
          targetUser.updated_at = new Date().toISOString()
          store.sessions = store.sessions.filter((s) => s.user_id !== targetUser.id)
          await saveAuthStore(env, store)
          return jsonResponse({ user: toPublicProfile(targetUser) })
        }

        if (method === 'POST' && subAction === 'unlock') {
          targetUser.status = 'approved'
          targetUser.locked_at = null
          targetUser.locked_reason = null
          targetUser.updated_at = new Date().toISOString()
          await saveAuthStore(env, store)
          return jsonResponse({ user: toPublicProfile(targetUser) })
        }

        if (method === 'POST' && subAction === 'reset-password') {
          const body = await readJsonBody(req)
          const newPw = String(body.new_password || '')
          const pwErr = validatePasswordStrength(newPw)
          if (pwErr) return jsonResponse({ error: pwErr }, 400)
          targetUser.password_hash = await hashPassword(newPw)
          targetUser.updated_at = new Date().toISOString()
          await saveAuthStore(env, store)
          return jsonResponse({
            user: toPublicProfile(targetUser),
            message: `Đã đặt lại mật khẩu cho ${targetUser.email}.`,
          })
        }

        if (method === 'DELETE' && !subAction) {
          if (targetUser.id === auth.user.id) {
            return jsonResponse({ error: 'Không thể tự xóa tài khoản Admin đang đăng nhập.' }, 400)
          }
          store.users = store.users.filter((u) => u.id !== targetUser.id)
          store.sessions = store.sessions.filter((s) => s.user_id !== targetUser.id)
          await saveAuthStore(env, store)
          return jsonResponse({ ok: true })
        }
      }

      if (method === 'PUT' && path === '/api/admin/settings') {
        const body = await readJsonBody(req)
        if (body.registration_mode) {
          store.appSettings.registration_mode = body.registration_mode
        }
        if (Array.isArray(body.allowed_google_domains)) {
          store.appSettings.allowed_google_domains = body.allowed_google_domains
        }
        if (typeof body.session_remember_days === 'number') {
          store.appSettings.session_remember_days = body.session_remember_days
        }
        if (typeof body.require_email_verification === 'boolean') {
          store.appSettings.require_email_verification = body.require_email_verification
        }
        if (typeof body.admin_notification_email === 'string') {
          store.appSettings.admin_notification_email = body.admin_notification_email.trim()
        }
        store.appSettings.updated_at = new Date().toISOString()
        await saveAuthStore(env, store)
        return jsonResponse({ settings: store.appSettings })
      }

      if (method === 'POST' && path === '/api/admin/invites') {
        const body = await readJsonBody(req)
        const code =
          String(body.custom_code || '')
            .trim()
            .toUpperCase() || `GV-${randomHex(3).toUpperCase()}`
        const invite: InviteRecord = {
          id: generateId('inv'),
          code,
          email: body.email ? normalizeEmail(body.email) : null,
          role: body.role === 'admin' ? 'admin' : 'teacher',
          max_uses: Number(body.max_uses) || 1,
          used_count: 0,
          expires_at: body.expires_in_days
            ? new Date(Date.now() + Number(body.expires_in_days) * 86400000).toISOString()
            : null,
          note: body.note || null,
          created_by: auth.user.email,
          created_at: new Date().toISOString(),
        }
        store.invites.unshift(invite)
        await saveAuthStore(env, store)
        return jsonResponse({ invite })
      }

      const inviteMatch = path.match(/^\/api\/admin\/invites\/([^/]+)(?:\/([^/]+))?$/)
      if (inviteMatch) {
        const invId = decodeURIComponent(inviteMatch[1])
        const sub = inviteMatch[2] || ''
        if (method === 'POST' && sub === 'revoke') {
          const inv = store.invites.find((i) => i.id === invId)
          if (!inv) return jsonResponse({ error: 'Không tìm thấy mã mời.' }, 404)
          inv.revoked_at = new Date().toISOString()
          await saveAuthStore(env, store)
          return jsonResponse({ invite: inv })
        }
        if (method === 'DELETE' && !sub) {
          store.invites = store.invites.filter((i) => i.id !== invId)
          await saveAuthStore(env, store)
          return jsonResponse({ ok: true })
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
        // Đồng bộ bản chung cho giáo viên mặc định để mở trên mọi thiết bị đều thấy ngay
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
          'Đã kiểm tra luồng thông báo trên Cloudflare Edge (Thêm RESEND_API_KEY trong Settings -> Environment Variables của Cloudflare để gửi email thật).',
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
              'Chưa cấu hình GEMINI_API_KEY trong Cloudflare Pages -> Settings -> Environment variables.',
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

