import type {
  AccountStatus,
  AuthSessionRecord,
  AuthStoreData,
  Env,
  StoredUser,
  UserProfile,
} from '../types/index'
import { kvGet, kvSet } from './kv.service'
import { generateId, hashPassword, randomHex, sha256Hex } from './crypto.util'

export const AUTH_STORE_KEY = 'v3_clean_auth_store'
export const AUDIT_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

export function getAdminEmail(env: Env): string {
  return normalizeEmail(env.ADMIN_EMAIL || env.DEFAULT_ADMIN_EMAIL || '')
}

export function toPublicProfile(user: StoredUser): UserProfile {
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

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) return 'Mật khẩu phải có tối thiểu 8 ký tự.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Mật khẩu phải bao gồm cả chữ cái và chữ số.'
  }
  return null
}

export function pruneAuditLogsLast30Days(store: AuthStoreData): boolean {
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

export async function loadAuthStore(env: Env): Promise<AuthStoreData> {
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
    if (!Array.isArray(store.sessions)) {
      store.sessions = []
      dirty = true
    }
    if (!Array.isArray(store.tokens)) {
      store.tokens = []
      dirty = true
    }
    if (!Array.isArray(store.invites)) {
      store.invites = []
      dirty = true
    }
    if (!Array.isArray(store.auditLogs)) {
      store.auditLogs = []
      dirty = true
    }
    if (pruneAuditLogsLast30Days(store)) {
      dirty = true
    }
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

export async function saveAuthStore(env: Env, store: AuthStoreData): Promise<void> {
  await kvSet(env.DB, AUTH_STORE_KEY, store)
}

export function appendAuditLog(
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
): void {
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

export async function createSession(
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

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return null
}

export async function getAuthenticatedUser(
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

