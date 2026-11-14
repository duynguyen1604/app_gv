import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type express from 'express'
import pool from './db.js'
import {
  sendAuthEmail,
  buildVerifyEmailHtml,
  buildResetPasswordEmailHtml,
  buildAccountApprovedEmailHtml,
  buildAccountRejectedEmailHtml,
  buildAccountLockedUnlockedEmailHtml,
  buildPasswordChangedAlertEmailHtml,
  buildInviteTeacherEmailHtml,
  buildAdminNewPendingTeacherEmailHtml,
} from './authMailer.js'

export type AccountRole = 'admin' | 'teacher'
export type AccountStatus = 'pending' | 'active' | 'locked'
export type RegistrationMode = 'pending_approval' | 'open' | 'invite_only'

export interface UserProfileRecord {
  id: string
  full_name: string
  email: string
  phone: string | null
  school: string | null
  avatar_url: string | null
  role: AccountRole
  status: AccountStatus
  email_verified: boolean
  auth_provider: 'email' | 'google' | 'both'
  created_at: string
  approved_by: string | null
  approved_at: string | null
  last_login_at: string | null
  locked_reason: string | null
}

export interface LocalAuthUserRecord {
  id: string
  email: string
  password_hash: string | null
  email_verified: boolean
  verification_token: string | null
  verification_expires_at: string | null
  reset_token: string | null
  reset_expires_at: string | null
  failed_login_attempts: number
  locked_until: string | null
  last_verification_sent_at: string | null
  last_admin_notify_at: string | null
  token_version: number
  created_at: string
}

export interface AppSettingsRecord {
  id: string
  registration_mode: RegistrationMode
  google_login_enabled: boolean
  password_login_enabled: boolean
  notify_admin_email: boolean
  max_accounts: number | null
  updated_at: string
}

export interface AuditLogRecord {
  id: string
  actor_id: string | null
  target_id: string | null
  action: string
  detail: Record<string, unknown>
  ip_masked: string
  created_at: string
}

export interface InviteRecord {
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

interface AuthStoreData {
  profiles: UserProfileRecord[]
  authUsers: LocalAuthUserRecord[]
  appSettings: AppSettingsRecord
  auditLogs: AuditLogRecord[]
  invites: InviteRecord[]
}

const COMMON_WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password1',
  'password123',
  'qwerty123',
  'qwertyuiop',
  'abc12345',
  '11111111',
  '00000000',
  'matkhau1',
  'matkhau123',
  'iloveyou1',
  'zaq12wsx',
])

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || 'admin@lichday.vn').trim().toLowerCase()
}

function getJwtSecret(): string {
  return (
    process.env.AUTH_JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    'gv-app-server-secret-key-2026-asia-hcm'
  )
}

export function isVerifiedAdminEmail(email: string, emailVerified: boolean): boolean {
  const adminEmail = getAdminEmail()
  if (!adminEmail || !emailVerified) return false
  return email.trim().toLowerCase() === adminEmail
}

export function maskIpAddress(rawIp: string | undefined): string {
  if (!rawIp) return '0.0.0.x'
  const cleaned = rawIp.replace('::ffff:', '').trim()
  if (cleaned === '::1' || cleaned === '127.0.0.1') return '127.0.0.x'
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.x`
    }
  }
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':')
    return `${parts.slice(0, 3).join(':')}:xxxx`
  }
  return '0.0.0.x'
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${derived}`
}

export function verifyPasswordHash(password: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false
  const parts = storedHash.split('$')
  if (parts.length !== 3) return false
  const [, salt, originalHex] = parts
  const derivedHex = crypto.scryptSync(password, salt, 64).toString('hex')
  try {
    return crypto.timingSafeEqual(
      Buffer.from(originalHex, 'hex'),
      Buffer.from(derivedHex, 'hex')
    )
  } catch {
    return false
  }
}

export function validatePasswordStrength(password: string): {
  valid: boolean
  message?: string
} {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Mật khẩu phải có tối thiểu 8 ký tự.' }
  }
  if (!/[a-zA-ZÀ-ỹ]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải bao gồm ít nhất 1 chữ cái.' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải bao gồm ít nhất 1 chữ số.' }
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return {
      valid: false,
      message: 'Mật khẩu này quá phổ biến và dễ đoán, vui lòng chọn mật khẩu an toàn hơn.',
    }
  }
  return { valid: true }
}

// ============================================================================
// SERVER-SIDE PERSISTENT STORE (PostgreSQL + Local JSON Fallback with Backup)
// ============================================================================

function getStoreFilePath(): string {
  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }
  return path.join(baseDir, 'auth_store.json')
}

function createInitialStoreData(): AuthStoreData {
  const adminEmail = getAdminEmail()
  const now = new Date().toISOString()
  const adminId = 'usr-admin-fixed-001'
  const teacherActiveId = 'usr-teacher-active-002'
  const teacherPendingId = 'usr-teacher-pending-003'

  return {
    profiles: [
      {
        id: adminId,
        full_name: 'Quản trị viên Hệ thống',
        email: adminEmail,
        phone: '0901234567',
        school: 'THPT Chuyên Hà Nội',
        avatar_url: null,
        role: 'admin',
        status: 'active',
        email_verified: true,
        auth_provider: 'email',
        created_at: now,
        approved_by: adminId,
        approved_at: now,
        last_login_at: now,
        locked_reason: null,
      },
      {
        id: teacherActiveId,
        full_name: 'Cô Nguyễn Thu Hà',
        email: 'giaovien@lichday.vn',
        phone: '0912345678',
        school: 'THCS Cầu Giấy',
        avatar_url: null,
        role: 'teacher',
        status: 'active',
        email_verified: true,
        auth_provider: 'email',
        created_at: now,
        approved_by: adminId,
        approved_at: now,
        last_login_at: null,
        locked_reason: null,
      },
      {
        id: teacherPendingId,
        full_name: 'Thầy Trần Minh Quân',
        email: 'choduyet@lichday.vn',
        phone: '0987654321',
        school: 'THPT Yên Hòa',
        avatar_url: null,
        role: 'teacher',
        status: 'pending',
        email_verified: true,
        auth_provider: 'email',
        created_at: now,
        approved_by: null,
        approved_at: null,
        last_login_at: null,
        locked_reason: null,
      },
    ],
    authUsers: [
      {
        id: adminId,
        email: adminEmail,
        password_hash: hashPassword('Admin123456'),
        email_verified: true,
        verification_token: null,
        verification_expires_at: null,
        reset_token: null,
        reset_expires_at: null,
        failed_login_attempts: 0,
        locked_until: null,
        last_verification_sent_at: null,
        last_admin_notify_at: null,
        token_version: 1,
        created_at: now,
      },
      {
        id: teacherActiveId,
        email: 'giaovien@lichday.vn',
        password_hash: hashPassword('Giaovien123'),
        email_verified: true,
        verification_token: null,
        verification_expires_at: null,
        reset_token: null,
        reset_expires_at: null,
        failed_login_attempts: 0,
        locked_until: null,
        last_verification_sent_at: null,
        last_admin_notify_at: null,
        token_version: 1,
        created_at: now,
      },
      {
        id: teacherPendingId,
        email: 'choduyet@lichday.vn',
        password_hash: hashPassword('Giaovien123'),
        email_verified: true,
        verification_token: null,
        verification_expires_at: null,
        reset_token: null,
        reset_expires_at: null,
        failed_login_attempts: 0,
        locked_until: null,
        last_verification_sent_at: null,
        last_admin_notify_at: null,
        token_version: 1,
        created_at: now,
      },
    ],
    appSettings: {
      id: 'global',
      registration_mode: 'pending_approval',
      google_login_enabled: true,
      password_login_enabled: true,
      notify_admin_email: true,
      max_accounts: null,
      updated_at: now,
    },
    auditLogs: [
      {
        id: `aud-${Date.now()}`,
        actor_id: adminId,
        target_id: adminId,
        action: 'system_init',
        detail: { note: 'Khởi tạo hệ thống tài khoản và bảo vệ ADMIN_EMAIL phía server' },
        ip_masked: '127.0.0.x',
        created_at: now,
      },
    ],
    invites: [],
  }
}

function loadStoreFromDisk(): AuthStoreData {
  const filePath = getStoreFilePath()
  if (!fs.existsSync(filePath)) {
    const initial = createInitialStoreData()
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8')
    return initial
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as AuthStoreData
    return enforceServerAdminInvariantsOnStore(parsed)
  } catch (err) {
    console.error('[AUTH_STORE] Error reading auth_store.json, re-initializing:', err)
    const initial = createInitialStoreData()
    return initial
  }
}

function saveStoreToDisk(store: AuthStoreData): void {
  const filePath = getStoreFilePath()
  const enforced = enforceServerAdminInvariantsOnStore(store)
  fs.writeFileSync(filePath, JSON.stringify(enforced, null, 2), 'utf8')
}

/**
 * Enforces Section 2 invariants on the server:
 * - Only verified email === ADMIN_EMAIL has role = 'admin' and status = 'active'
 * - Every other profile has role = 'teacher'
 */
function enforceServerAdminInvariantsOnStore(store: AuthStoreData): AuthStoreData {
  const adminEmail = getAdminEmail()
  for (const p of store.profiles) {
    const normalizedEmail = p.email.trim().toLowerCase()
    p.email = normalizedEmail
    if (normalizedEmail === adminEmail && p.email_verified) {
      p.role = 'admin'
      p.status = 'active'
      p.locked_reason = null
    } else {
      p.role = 'teacher'
    }
  }
  return store
}

async function syncProfileToPostgresIfAvailable(
  profile: UserProfileRecord,
  authUser?: LocalAuthUserRecord
): Promise<void> {
  try {
    const client = await pool.connect()
    try {
      await client.query(`SELECT set_config('app.admin_email', $1, true)`, [getAdminEmail()])
      await client.query(
        `INSERT INTO profiles (
          id, full_name, email, phone, school, avatar_url, role, status,
          email_verified, auth_provider, created_at, approved_by, approved_at, last_login_at, locked_reason
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (email) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          school = EXCLUDED.school,
          avatar_url = EXCLUDED.avatar_url,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          email_verified = EXCLUDED.email_verified,
          auth_provider = EXCLUDED.auth_provider,
          approved_by = EXCLUDED.approved_by,
          approved_at = EXCLUDED.approved_at,
          last_login_at = EXCLUDED.last_login_at,
          locked_reason = EXCLUDED.locked_reason`,
        [
          profile.id,
          profile.full_name,
          profile.email,
          profile.phone,
          profile.school,
          profile.avatar_url,
          profile.role,
          profile.status,
          profile.email_verified,
          profile.auth_provider,
          profile.created_at,
          profile.approved_by,
          profile.approved_at,
          profile.last_login_at,
          profile.locked_reason,
        ]
      )
      if (authUser) {
        await client.query(
          `INSERT INTO auth_users_local (
            id, email, password_hash, email_verified, verification_token, verification_expires_at,
            reset_token, reset_expires_at, failed_login_attempts, locked_until, last_verification_sent_at,
            last_admin_notify_at, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (email) DO UPDATE SET
            password_hash = COALESCE(EXCLUDED.password_hash, auth_users_local.password_hash),
            email_verified = EXCLUDED.email_verified,
            verification_token = EXCLUDED.verification_token,
            verification_expires_at = EXCLUDED.verification_expires_at,
            reset_token = EXCLUDED.reset_token,
            reset_expires_at = EXCLUDED.reset_expires_at,
            failed_login_attempts = EXCLUDED.failed_login_attempts,
            locked_until = EXCLUDED.locked_until,
            last_verification_sent_at = EXCLUDED.last_verification_sent_at,
            last_admin_notify_at = EXCLUDED.last_admin_notify_at`,
          [
            authUser.id,
            authUser.email,
            authUser.password_hash,
            authUser.email_verified,
            authUser.verification_token,
            authUser.verification_expires_at,
            authUser.reset_token,
            authUser.reset_expires_at,
            authUser.failed_login_attempts,
            authUser.locked_until,
            authUser.last_verification_sent_at,
            authUser.last_admin_notify_at,
            authUser.created_at,
          ]
        )
      }
    } finally {
      client.release()
    }
  } catch {
    // PostgreSQL offline or deferred; local server store already persisted
  }
}

export async function recordAuditLog(params: {
  actorId: string | null
  targetId?: string | null
  action: string
  detail?: Record<string, unknown>
  req?: express.Request
}): Promise<void> {
  const store = loadStoreFromDisk()
  const ipRaw =
    (params.req?.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    params.req?.socket?.remoteAddress
  const entry: AuditLogRecord = {
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    actor_id: params.actorId,
    target_id: params.targetId || null,
    action: params.action,
    detail: params.detail || {},
    ip_masked: maskIpAddress(ipRaw),
    created_at: new Date().toISOString(),
  }
  store.auditLogs.unshift(entry)
  if (store.auditLogs.length > 1000) {
    store.auditLogs = store.auditLogs.slice(0, 1000)
  }
  saveStoreToDisk(store)

  try {
    await pool.query(
      `INSERT INTO audit_log (id, actor_id, target_id, action, detail, ip_masked, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.id,
        entry.actor_id,
        entry.target_id,
        entry.action,
        JSON.stringify(entry.detail),
        entry.ip_masked,
        entry.created_at,
      ]
    )
  } catch {
    // PostgreSQL offline fallback
  }
}

// ============================================================================
// SESSION JWT SIGNING & VERIFICATION (Supports 30-day Remember Me for iPhone PWA)
// ============================================================================

export interface SessionTokenPayload {
  sub: string
  email: string
  ver: number
  rem: boolean
  iat: number
  exp: number
}

export function signSessionToken(params: {
  userId: string
  email: string
  tokenVersion: number
  rememberMe: boolean
}): { token: string; expiresAt: number } {
  const nowSec = Math.floor(Date.now() / 1000)
  // Remember me = 35 days (>= 30 days per Section 4.1), otherwise 24 hours
  const ttlSec = params.rememberMe ? 35 * 24 * 3600 : 24 * 3600
  const exp = nowSec + ttlSec

  const payload: SessionTokenPayload = {
    sub: params.userId,
    email: params.email.trim().toLowerCase(),
    ver: params.tokenVersion,
    rem: params.rememberMe,
    iat: nowSec,
    exp,
  }

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  return {
    token: `${headerB64}.${payloadB64}.${signature}`,
    expiresAt: exp * 1000,
  }
}

export function verifySessionTokenString(token: string): SessionTokenPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sig] = parts
    const expectedSig = crypto
      .createHmac('sha256', getJwtSecret())
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url')
    if (sig !== expectedSig) return null

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SessionTokenPayload
    const nowSec = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < nowSec) return null
    return payload
  } catch {
    return null
  }
}

// ============================================================================
// PUBLIC CONFIG, REGISTER, VERIFY EMAIL, LOGIN, GOOGLE REDIRECT & TOKEN GUARD
// ============================================================================

export function getPublicAuthConfig() {
  const store = loadStoreFromDisk()
  return {
    registration_mode: store.appSettings.registration_mode,
    google_login_enabled: store.appSettings.google_login_enabled,
    password_login_enabled: store.appSettings.password_login_enabled,
    supabase_configured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ),
    google_oauth_configured: Boolean(process.env.GOOGLE_CLIENT_ID),
    turnstile_site_key: process.env.TURNSTILE_SITE_KEY || null,
  }
}

export async function registerAccount(params: {
  fullName: string
  email: string
  password: string
  school?: string
  phone?: string
  inviteCode?: string
  agreedToTerms: boolean
  req?: express.Request
}): Promise<{
  success: boolean
  email: string
  message: string
  devVerifyUrl?: string
}> {
  const store = loadStoreFromDisk()
  const email = (params.email || '').trim().toLowerCase()
  const fullName = (params.fullName || '').trim()

  if (!fullName) {
    throw new Error('Vui lòng nhập họ và tên.')
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Địa chỉ email không hợp lệ.')
  }
  if (!params.agreedToTerms) {
    throw new Error('Thầy/cô cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật.')
  }

  const pwCheck = validatePasswordStrength(params.password)
  if (!pwCheck.valid) {
    throw new Error(pwCheck.message || 'Mật khẩu chưa đạt yêu cầu bảo mật.')
  }

  const isTargetAdminEmail = email === getAdminEmail()

  // Check max_accounts if not admin email
  if (
    !isTargetAdminEmail &&
    store.appSettings.max_accounts &&
    store.profiles.length >= store.appSettings.max_accounts
  ) {
    throw new Error('Hệ thống đã đạt giới hạn số lượng tài khoản tối đa. Vui lòng liên hệ Quản trị viên.')
  }

  // Check registration_mode (Admin email bypasses registration_mode per Section 3.2)
  if (!isTargetAdminEmail && store.appSettings.registration_mode === 'invite_only') {
    const code = (params.inviteCode || '').trim().toUpperCase()
    if (!code) {
      throw new Error('Hệ thống đang ở chế độ Chỉ theo lời mời. Vui lòng nhập mã mời hợp lệ.')
    }
    const invite = store.invites.find(
      (inv) =>
        inv.code.toUpperCase() === code &&
        !inv.revoked &&
        inv.used_count < inv.max_uses &&
        (!inv.expires_at || new Date(inv.expires_at).getTime() > Date.now()) &&
        (!inv.email || inv.email.toLowerCase() === email)
    )
    if (!invite) {
      throw new Error('Mã mời không hợp lệ, đã hết hạn hoặc đã dùng hết số lượt.')
    }
    invite.used_count += 1
  }

  const existingProfile = store.profiles.find((p) => p.email === email)
  const existingAuth = store.authUsers.find((u) => u.email === email)

  const verificationToken = crypto.randomBytes(24).toString('hex')
  const verificationExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const now = new Date().toISOString()

  let userId: string

  if (existingProfile && existingAuth) {
    // If previously registered via Google only, link password after email verification
    if (existingProfile.auth_provider === 'google' && !existingAuth.password_hash) {
      existingAuth.password_hash = hashPassword(params.password)
      existingProfile.auth_provider = 'both'
      existingProfile.full_name = fullName || existingProfile.full_name
      if (params.school) existingProfile.school = params.school.trim()
      if (params.phone) existingProfile.phone = params.phone.trim()
      saveStoreToDisk(store)
      await syncProfileToPostgresIfAvailable(existingProfile, existingAuth)
      return {
        success: true,
        email,
        message:
          'Email này đã liên kết với Google. Mật khẩu mới đã được gán vào cùng tài khoản, thầy/cô có thể đăng nhập ngay.',
      }
    }

    if (existingProfile.email_verified) {
      // Do not leak sensitive details, tell user to login or use forgot password
      throw new Error(
        'Không thể hoàn tất đăng ký với email này. Nếu thầy/cô đã có tài khoản, vui lòng Đăng nhập hoặc chọn Quên mật khẩu.'
      )
    }

    // Update unverified registration & resend token
    userId = existingProfile.id
    existingProfile.full_name = fullName
    existingProfile.school = params.school?.trim() || null
    existingProfile.phone = params.phone?.trim() || null
    existingAuth.password_hash = hashPassword(params.password)
    existingAuth.verification_token = verificationToken
    existingAuth.verification_expires_at = verificationExpiresAt
    existingAuth.last_verification_sent_at = now
  } else {
    userId = `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    // Important (Section 2): Even if email === ADMIN_EMAIL, before email verification they have NO admin rights (`role = 'teacher'`, `status = 'pending'`)
    const initialStatus: AccountStatus =
      store.appSettings.registration_mode === 'open' ? 'active' : 'pending'

    const newProfile: UserProfileRecord = {
      id: userId,
      full_name: fullName,
      email,
      phone: params.phone?.trim() || null,
      school: params.school?.trim() || null,
      avatar_url: null,
      role: 'teacher',
      status: initialStatus,
      email_verified: false,
      auth_provider: 'email',
      created_at: now,
      approved_by: null,
      approved_at: null,
      last_login_at: null,
      locked_reason: null,
    }

    const newAuthUser: LocalAuthUserRecord = {
      id: userId,
      email,
      password_hash: hashPassword(params.password),
      email_verified: false,
      verification_token: verificationToken,
      verification_expires_at: verificationExpiresAt,
      reset_token: null,
      reset_expires_at: null,
      failed_login_attempts: 0,
      locked_until: null,
      last_verification_sent_at: now,
      last_admin_notify_at: null,
      token_version: 1,
      created_at: now,
    }

    store.profiles.push(newProfile)
    store.authUsers.push(newAuthUser)
    await syncProfileToPostgresIfAvailable(newProfile, newAuthUser)
  }

  saveStoreToDisk(store)

  await recordAuditLog({
    actorId: userId,
    targetId: userId,
    action: 'register',
    detail: { email, school: params.school || null },
    req: params.req,
  })

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const verifyUrl = `${frontendUrl}/auth/verify-email?token=${encodeURIComponent(
    verificationToken
  )}&email=${encodeURIComponent(email)}`

  const mailResult = await sendAuthEmail({
    to: email,
    subject: '[Lịch Dạy Giáo Viên] Xác minh địa chỉ email đăng ký tài khoản',
    html: buildVerifyEmailHtml({ fullName, verifyUrl }),
  })

  return {
    success: true,
    email,
    message:
      'Đăng ký thành công! Vui lòng kiểm tra hộp thư email để bấm vào liên kết xác minh trước khi đăng nhập.',
    devVerifyUrl: mailResult.simulated ? verifyUrl : undefined,
  }
}

export async function verifyEmailToken(params: {
  email?: string
  token: string
  req?: express.Request
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  sessionToken: string
  expiresAt: number
  message: string
}> {
  const store = loadStoreFromDisk()
  const cleanToken = (params.token || '').trim()
  if (!cleanToken) {
    throw new Error('Mã xác minh email không hợp lệ.')
  }

  const authUser = store.authUsers.find(
    (u) =>
      u.verification_token === cleanToken &&
      (!params.email || u.email === params.email.trim().toLowerCase())
  )

  if (!authUser) {
    throw new Error('Liên kết xác minh không hợp lệ hoặc đã được sử dụng.')
  }

  if (
    authUser.verification_expires_at &&
    new Date(authUser.verification_expires_at).getTime() < Date.now()
  ) {
    throw new Error('Liên kết xác minh đã hết hạn. Vui lòng bấm "Gửi lại thư xác minh".')
  }

  const profile = store.profiles.find((p) => p.id === authUser.id || p.email === authUser.email)
  if (!profile) {
    throw new Error('Không tìm thấy hồ sơ tài khoản.')
  }

  const now = new Date().toISOString()
  authUser.email_verified = true
  authUser.verification_token = null
  authUser.verification_expires_at = null

  profile.email_verified = true
  profile.last_login_at = now

  // Server-side ADMIN_EMAIL verification check (Section 2 & 3.2):
  // If verified email matches ADMIN_EMAIL, automatically becomes admin & active!
  if (isVerifiedAdminEmail(profile.email, true)) {
    profile.role = 'admin'
    profile.status = 'active'
    profile.approved_at = now
    profile.approved_by = profile.id
  } else {
    profile.role = 'teacher'
    if (store.appSettings.registration_mode === 'open' && profile.status === 'pending') {
      profile.status = 'active'
      profile.approved_at = now
    }
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'verify_email',
    detail: { email: profile.email, role: profile.role, status: profile.status },
    req: params.req,
  })

  // Notify ADMIN_EMAIL if a new teacher is pending approval and notify_admin_email is enabled
  if (
    profile.role === 'teacher' &&
    profile.status === 'pending' &&
    store.appSettings.notify_admin_email
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    await sendAuthEmail({
      to: getAdminEmail(),
      subject: `[Lịch Dạy Giáo Viên] Giáo viên mới chờ duyệt: ${profile.full_name}`,
      html: buildAdminNewPendingTeacherEmailHtml({
        teacherName: profile.full_name,
        teacherEmail: profile.email,
        teacherSchool: profile.school,
        teacherPhone: profile.phone,
        adminUrl: `${frontendUrl}/admin`,
      }),
    })
  }

  const { token: sessionToken, expiresAt } = signSessionToken({
    userId: profile.id,
    email: profile.email,
    tokenVersion: authUser.token_version || 1,
    rememberMe: true,
  })

  return {
    success: true,
    profile,
    sessionToken,
    expiresAt,
    message:
      profile.role === 'admin'
        ? 'Xác minh email thành công! Tài khoản Quản trị viên đã được kích hoạt.'
        : profile.status === 'active'
          ? 'Xác minh email thành công! Chào mừng thầy/cô đến với ứng dụng.'
          : 'Xác minh email thành công! Tài khoản của thầy/cô đang chờ Quản trị viên phê duyệt.',
  }
}

export async function resendVerificationEmail(params: {
  email: string
  req?: express.Request
}): Promise<{
  success: boolean
  message: string
  cooldownSeconds?: number
  devVerifyUrl?: string
}> {
  const store = loadStoreFromDisk()
  const email = (params.email || '').trim().toLowerCase()
  if (!email) {
    throw new Error('Vui lòng nhập địa chỉ email.')
  }

  const profile = store.profiles.find((p) => p.email === email)
  const authUser = store.authUsers.find((u) => u.email === email)

  // Always return generic friendly message if account doesn't exist to avoid enumeration
  if (!profile || !authUser) {
    return {
      success: true,
      message: 'Nếu địa chỉ email đang chờ xác minh, chúng tôi đã gửi lại liên kết xác minh mới.',
      cooldownSeconds: 60,
    }
  }

  if (profile.email_verified) {
    return {
      success: true,
      message: 'Địa chỉ email này đã được xác minh trước đó. Thầy/cô có thể đăng nhập ngay.',
    }
  }

  // Rate limit: 1 resend per 60 seconds
  if (authUser.last_verification_sent_at) {
    const elapsedSec = Math.floor(
      (Date.now() - new Date(authUser.last_verification_sent_at).getTime()) / 1000
    )
    if (elapsedSec < 60) {
      const waitSec = 60 - elapsedSec
      throw new Error(`Vui lòng đợi ${waitSec} giây trước khi yêu cầu gửi lại thư xác minh.`)
    }
  }

  const verificationToken = crypto.randomBytes(24).toString('hex')
  const now = new Date().toISOString()
  authUser.verification_token = verificationToken
  authUser.verification_expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  authUser.last_verification_sent_at = now

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const verifyUrl = `${frontendUrl}/auth/verify-email?token=${encodeURIComponent(
    verificationToken
  )}&email=${encodeURIComponent(email)}`

  const mailResult = await sendAuthEmail({
    to: email,
    subject: '[Lịch Dạy Giáo Viên] Gửi lại liên kết xác minh địa chỉ email',
    html: buildVerifyEmailHtml({ fullName: profile.full_name, verifyUrl }),
  })

  return {
    success: true,
    message: 'Đã gửi lại thư xác minh! Vui lòng kiểm tra hộp thư đến (hoặc mục Thư rác/Spam).',
    cooldownSeconds: 60,
    devVerifyUrl: mailResult.simulated ? verifyUrl : undefined,
  }
}

export async function loginWithPassword(params: {
  email: string
  password: string
  rememberMe?: boolean
  req?: express.Request
}): Promise<{
  success: boolean
  code?: 'EMAIL_NOT_VERIFIED'
  email?: string
  profile?: UserProfileRecord
  sessionToken?: string
  expiresAt?: number
  devVerifyUrl?: string
}> {
  const store = loadStoreFromDisk()

  if (!store.appSettings.password_login_enabled) {
    throw new Error('Đăng nhập bằng email và mật khẩu hiện đang tạm tắt. Vui lòng dùng Tiếp tục với Google.')
  }

  const email = (params.email || '').trim().toLowerCase()
  const password = params.password || ''

  if (!email || !password) {
    throw new Error('Email hoặc mật khẩu không đúng')
  }

  const profile = store.profiles.find((p) => p.email === email)
  const authUser = store.authUsers.find((u) => u.email === email)

  if (!profile || !authUser) {
    // Section 3.1: Do not reveal whether the email exists
    throw new Error('Email hoặc mật khẩu không đúng')
  }

  // Check temporary lockout from too many failed login attempts (Section 6.4)
  if (authUser.locked_until && new Date(authUser.locked_until).getTime() > Date.now()) {
    const remainingMin = Math.ceil(
      (new Date(authUser.locked_until).getTime() - Date.now()) / 60000
    )
    throw new Error(
      `Tài khoản tạm thời bị khóa đăng nhập do nhập sai quá nhiều lần. Vui lòng thử lại sau ${remainingMin} phút.`
    )
  }

  // If account only uses Google and has no password yet
  if (profile.auth_provider === 'google' && !authUser.password_hash) {
    throw new Error('Email hoặc mật khẩu không đúng')
  }

  const passwordValid = verifyPasswordHash(password, authUser.password_hash)
  if (!passwordValid) {
    authUser.failed_login_attempts = (authUser.failed_login_attempts || 0) + 1
    if (authUser.failed_login_attempts >= 5) {
      authUser.locked_until = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await recordAuditLog({
        actorId: profile.id,
        targetId: profile.id,
        action: 'login_failed_lockout',
        detail: { attempts: authUser.failed_login_attempts },
        req: params.req,
      })
    }
    saveStoreToDisk(store)
    throw new Error('Email hoặc mật khẩu không đúng')
  }

  // Reset failed login counter
  authUser.failed_login_attempts = 0
  authUser.locked_until = null

  // Must have verified email before logging in (Section 3.2)
  if (!profile.email_verified) {
    if (!authUser.verification_token) {
      authUser.verification_token = crypto.randomBytes(24).toString('hex')
      authUser.verification_expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    }
    saveStoreToDisk(store)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const verifyUrl = `${frontendUrl}/auth/verify-email?token=${encodeURIComponent(
      authUser.verification_token
    )}&email=${encodeURIComponent(email)}`
    return {
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      email: profile.email,
      devVerifyUrl: verifyUrl,
    }
  }

  // Server-side ADMIN_EMAIL verification check on every login
  if (isVerifiedAdminEmail(profile.email, profile.email_verified)) {
    profile.role = 'admin'
    profile.status = 'active'
  } else {
    profile.role = 'teacher'
  }

  profile.last_login_at = new Date().toISOString()
  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'login_success',
    detail: { provider: 'email', rememberMe: params.rememberMe !== false },
    req: params.req,
  })

  const { token: sessionToken, expiresAt } = signSessionToken({
    userId: profile.id,
    email: profile.email,
    tokenVersion: authUser.token_version || 1,
    rememberMe: params.rememberMe !== false,
  })

  return {
    success: true,
    profile,
    sessionToken,
    expiresAt,
  }
}

/**
 * Handles Google OAuth Redirect completion & Account Linking (Section 3.1 & 4.2)
 * - Links into the SAME profile if email matches an existing password account
 * - Sets role='admin', status='active' if verified Google email matches ADMIN_EMAIL
 */
export async function loginOrLinkGoogleAccount(params: {
  email: string
  fullName: string
  avatarUrl?: string | null
  req?: express.Request
}): Promise<{
  profile: UserProfileRecord
  sessionToken: string
  expiresAt: number
  linkedExisting: boolean
}> {
  const store = loadStoreFromDisk()
  if (!store.appSettings.google_login_enabled) {
    throw new Error('Đăng nhập bằng Google hiện đang tạm tắt bởi Quản trị viên.')
  }

  const email = (params.email || '').trim().toLowerCase()
  if (!email) {
    throw new Error('Không lấy được địa chỉ email từ tài khoản Google.')
  }

  const now = new Date().toISOString()
  let profile = store.profiles.find((p) => p.email === email)
  let authUser = store.authUsers.find((u) => u.email === email)
  let linkedExisting = false

  if (profile && authUser) {
    // Section 3.1: Link Google into existing password account with same email!
    linkedExisting = profile.auth_provider === 'email'
    profile.auth_provider = profile.auth_provider === 'email' ? 'both' : profile.auth_provider
    profile.email_verified = true
    authUser.email_verified = true
    authUser.verification_token = null
    if (params.avatarUrl && !profile.avatar_url) {
      profile.avatar_url = params.avatarUrl
    }
    profile.last_login_at = now
  } else {
    const isTargetAdmin = email === getAdminEmail()
    if (!isTargetAdmin && store.appSettings.registration_mode === 'invite_only') {
      throw new Error(
        'Hệ thống đang ở chế độ Chỉ theo lời mời. Vui lòng đăng ký bằng mã mời trước khi liên kết Google.'
      )
    }

    const userId = `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const initialStatus: AccountStatus =
      isTargetAdmin || store.appSettings.registration_mode === 'open' ? 'active' : 'pending'

    profile = {
      id: userId,
      full_name: params.fullName || email.split('@')[0],
      email,
      phone: null,
      school: null,
      avatar_url: params.avatarUrl || null,
      role: isTargetAdmin ? 'admin' : 'teacher',
      status: initialStatus,
      email_verified: true,
      auth_provider: 'google',
      created_at: now,
      approved_by: isTargetAdmin ? userId : null,
      approved_at: initialStatus === 'active' ? now : null,
      last_login_at: now,
      locked_reason: null,
    }

    authUser = {
      id: userId,
      email,
      password_hash: null,
      email_verified: true,
      verification_token: null,
      verification_expires_at: null,
      reset_token: null,
      reset_expires_at: null,
      failed_login_attempts: 0,
      locked_until: null,
      last_verification_sent_at: null,
      last_admin_notify_at: null,
      token_version: 1,
      created_at: now,
    }

    store.profiles.push(profile)
    store.authUsers.push(authUser)
  }

  // Enforce ADMIN_EMAIL rule
  if (isVerifiedAdminEmail(profile.email, true)) {
    profile.role = 'admin'
    profile.status = 'active'
  } else {
    profile.role = 'teacher'
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: linkedExisting ? 'google_account_linked' : 'login_google_redirect',
    detail: { email: profile.email, linkedExisting },
    req: params.req,
  })

  const { token: sessionToken, expiresAt } = signSessionToken({
    userId: profile.id,
    email: profile.email,
    tokenVersion: authUser.token_version || 1,
    rememberMe: true,
  })

  return {
    profile,
    sessionToken,
    expiresAt,
    linkedExisting,
  }
}

/**
 * Syncs a verified Supabase session (when VITE_SUPABASE_URL is configured on frontend)
 * with the server-side profiles store and ADMIN_EMAIL rule.
 */
export async function syncSupabaseUserSession(params: {
  supabaseAccessToken: string
  userMetadata?: {
    id: string
    email: string
    full_name?: string
    phone?: string
    school?: string
    email_verified?: boolean
    provider?: 'email' | 'google'
  }
  req?: express.Request
}): Promise<{
  profile: UserProfileRecord
  sessionToken: string
  expiresAt: number
}> {
  let verifiedUser = params.userMetadata

  // If SUPABASE_URL and SUPABASE_ANON_KEY are configured on server, verify token directly with Supabase Auth server
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && params.supabaseAccessToken) {
    try {
      const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${params.supabaseAccessToken}`,
          apikey: process.env.SUPABASE_ANON_KEY,
        },
      })
      if (resp.ok) {
        const supaUser = (await resp.json()) as {
          id: string
          email?: string
          email_confirmed_at?: string | null
          user_metadata?: Record<string, string>
          app_metadata?: { provider?: string }
        }
        verifiedUser = {
          id: supaUser.id,
          email: (supaUser.email || '').trim().toLowerCase(),
          full_name:
            supaUser.user_metadata?.full_name ||
            supaUser.user_metadata?.name ||
            supaUser.email?.split('@')[0],
          phone: supaUser.user_metadata?.phone,
          school: supaUser.user_metadata?.school,
          email_verified: Boolean(supaUser.email_confirmed_at),
          provider: supaUser.app_metadata?.provider === 'google' ? 'google' : 'email',
        }
      }
    } catch (err) {
      console.warn('[AUTH] Supabase user fetch warning:', err)
    }
  }

  if (!verifiedUser || !verifiedUser.email) {
    throw new Error('Không thể xác thực phiên Supabase.')
  }

  const store = loadStoreFromDisk()
  const email = verifiedUser.email.trim().toLowerCase()
  const now = new Date().toISOString()

  let profile = store.profiles.find((p) => p.email === email || p.id === verifiedUser!.id)
  let authUser = store.authUsers.find((u) => u.email === email || u.id === verifiedUser!.id)

  const emailVerified = Boolean(verifiedUser.email_verified)
  const isTargetAdmin = isVerifiedAdminEmail(email, emailVerified)

  if (!profile) {
    const initialStatus: AccountStatus =
      isTargetAdmin || store.appSettings.registration_mode === 'open' ? 'active' : 'pending'

    profile = {
      id: verifiedUser.id,
      full_name: verifiedUser.full_name || email.split('@')[0],
      email,
      phone: verifiedUser.phone || null,
      school: verifiedUser.school || null,
      avatar_url: null,
      role: isTargetAdmin ? 'admin' : 'teacher',
      status: initialStatus,
      email_verified: emailVerified,
      auth_provider: verifiedUser.provider || 'email',
      created_at: now,
      approved_by: isTargetAdmin ? verifiedUser.id : null,
      approved_at: initialStatus === 'active' ? now : null,
      last_login_at: now,
      locked_reason: null,
    }
    store.profiles.push(profile)
  } else {
    profile.email_verified = profile.email_verified || emailVerified
    if (verifiedUser.provider && profile.auth_provider !== verifiedUser.provider) {
      profile.auth_provider = 'both'
    }
    profile.last_login_at = now
  }

  if (!authUser) {
    authUser = {
      id: profile.id,
      email,
      password_hash: null,
      email_verified: profile.email_verified,
      verification_token: null,
      verification_expires_at: null,
      reset_token: null,
      reset_expires_at: null,
      failed_login_attempts: 0,
      locked_until: null,
      last_verification_sent_at: null,
      last_admin_notify_at: null,
      token_version: 1,
      created_at: now,
    }
    store.authUsers.push(authUser)
  }

  if (isVerifiedAdminEmail(profile.email, profile.email_verified)) {
    profile.role = 'admin'
    profile.status = 'active'
  } else {
    profile.role = 'teacher'
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  const { token: sessionToken, expiresAt } = signSessionToken({
    userId: profile.id,
    email: profile.email,
    tokenVersion: authUser.token_version || 1,
    rememberMe: true,
  })

  return { profile, sessionToken, expiresAt }
}

/**
 * Verifies the request's Bearer token AND re-checks current profile status in DB/store on every call
 * (Section 6.4: locked account is blocked immediately even with an existing token).
 */
export function authenticateRequest(req: express.Request): {
  authenticated: boolean
  profile: UserProfileRecord | null
  tokenPayload: SessionTokenPayload | null
  errorCode?: 'UNAUTHORIZED' | 'ACCOUNT_LOCKED' | 'ACCOUNT_PENDING' | 'EMAIL_NOT_VERIFIED'
  errorMessage?: string
} {
  const authHeader = req.header('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : String(req.query.token || '')

  if (!bearerToken) {
    return {
      authenticated: false,
      profile: null,
      tokenPayload: null,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    }
  }

  const payload = verifySessionTokenString(bearerToken)
  if (!payload) {
    return {
      authenticated: false,
      profile: null,
      tokenPayload: null,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'Phiên đã hết hạn, hãy đăng nhập lại.',
    }
  }

  const store = loadStoreFromDisk()
  const profile = store.profiles.find(
    (p) => p.id === payload.sub || p.email === payload.email
  )
  const authUser = store.authUsers.find(
    (u) => u.id === payload.sub || u.email === payload.email
  )

  if (!profile || !authUser) {
    return {
      authenticated: false,
      profile: null,
      tokenPayload: null,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'Không tìm thấy tài khoản.',
    }
  }

  if ((authUser.token_version || 1) !== payload.ver) {
    return {
      authenticated: false,
      profile: null,
      tokenPayload: null,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'Phiên đăng nhập đã được đăng xuất khỏi thiết bị.',
    }
  }

  // Re-verify ADMIN_EMAIL server-side on every request
  if (isVerifiedAdminEmail(profile.email, profile.email_verified)) {
    profile.role = 'admin'
    profile.status = 'active'
  } else {
    profile.role = 'teacher'
  }

  if (!profile.email_verified) {
    return {
      authenticated: false,
      profile,
      tokenPayload: payload,
      errorCode: 'EMAIL_NOT_VERIFIED',
      errorMessage: 'Vui lòng xác minh địa chỉ email trước khi tiếp tục.',
    }
  }

  if (profile.status === 'locked') {
    return {
      authenticated: false,
      profile,
      tokenPayload: payload,
      errorCode: 'ACCOUNT_LOCKED',
      errorMessage: 'Tài khoản đã bị khóa, vui lòng liên hệ admin.',
    }
  }

  return {
    authenticated: true,
    profile,
    tokenPayload: payload,
  }
}

export async function notifyAdminFromPendingTeacher(params: {
  profile: UserProfileRecord
  req?: express.Request
}): Promise<{ success: boolean; message: string }> {
  const store = loadStoreFromDisk()
  const authUser = store.authUsers.find((u) => u.id === params.profile.id)

  if (authUser?.last_admin_notify_at) {
    const elapsedSec = Math.floor(
      (Date.now() - new Date(authUser.last_admin_notify_at).getTime()) / 1000
    )
    if (elapsedSec < 120) {
      throw new Error(
        `Đã gửi thông báo gần đây. Vui lòng đợi ${120 - elapsedSec} giây trước khi gửi lại.`
      )
    }
  }

  if (authUser) {
    authUser.last_admin_notify_at = new Date().toISOString()
    saveStoreToDisk(store)
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  await sendAuthEmail({
    to: getAdminEmail(),
    subject: `[Nhắc duyệt tài khoản] Giáo viên ${params.profile.full_name} đang chờ phê duyệt`,
    html: buildAdminNewPendingTeacherEmailHtml({
      teacherName: params.profile.full_name,
      teacherEmail: params.profile.email,
      teacherSchool: params.profile.school,
      teacherPhone: params.profile.phone,
      adminUrl: `${frontendUrl}/admin`,
    }),
  })

  await recordAuditLog({
    actorId: params.profile.id,
    targetId: params.profile.id,
    action: 'pending_teacher_notify_admin',
    detail: { email: params.profile.email },
    req: params.req,
  })

  return {
    success: true,
    message: 'Đã gửi lại thông báo nhắc phê duyệt tới Quản trị viên!',
  }
}

// ============================================================================
// FORGOT PASSWORD & RESET PASSWORD FLOW
// ============================================================================

export async function requestPasswordReset(params: {
  email: string
  req?: express.Request
}): Promise<{
  success: boolean
  message: string
  devResetUrl?: string
}> {
  const email = (params.email || '').trim().toLowerCase()
  if (!email) {
    throw new Error('Vui lòng nhập địa chỉ email.')
  }

  const store = loadStoreFromDisk()
  const profile = store.profiles.find((p) => p.email === email)
  const authUser = store.authUsers.find((u) => u.email === email)

  // Always return a generic message to avoid user enumeration
  const genericMsg =
    'Nếu địa chỉ email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi vào hộp thư.'

  if (!profile || !authUser) {
    return { success: true, message: genericMsg }
  }

  const resetToken = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
  authUser.reset_token = resetToken
  authUser.reset_expires_at = expiresAt

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const resetUrl = `${frontendUrl}/auth/forgot-password?token=${encodeURIComponent(
    resetToken
  )}&email=${encodeURIComponent(email)}`

  const mailRes = await sendAuthEmail({
    to: email,
    subject: '[Lịch Dạy Giáo Viên] Yêu cầu đặt lại mật khẩu',
    html: buildResetPasswordEmailHtml({
      fullName: profile.full_name,
      resetUrl,
    }),
  })

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'password_reset_requested',
    detail: { email },
    req: params.req,
  })

  return {
    success: true,
    message: genericMsg,
    devResetUrl: mailRes.simulated ? resetUrl : undefined,
  }
}

export async function resetPasswordWithToken(params: {
  email: string
  token: string
  newPassword: string
  req?: express.Request
}): Promise<{
  success: boolean
  message: string
}> {
  const email = (params.email || '').trim().toLowerCase()
  const token = (params.token || '').trim()
  const strength = validatePasswordStrength(params.newPassword)
  if (!strength.valid) {
    throw new Error(strength.message || 'Mật khẩu mới chưa đủ mạnh.')
  }

  const store = loadStoreFromDisk()
  const profile = store.profiles.find((p) => p.email === email)
  const authUser = store.authUsers.find((u) => u.email === email)

  if (!profile || !authUser || !authUser.reset_token || authUser.reset_token !== token) {
    throw new Error('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.')
  }

  if (
    authUser.reset_expires_at &&
    new Date(authUser.reset_expires_at).getTime() < Date.now()
  ) {
    throw new Error('Liên kết đặt lại mật khẩu đã hết hạn (quá 1 giờ). Vui lòng yêu cầu lại.')
  }

  authUser.password_hash = hashPassword(params.newPassword)
  authUser.reset_token = null
  authUser.reset_expires_at = null
  authUser.failed_login_attempts = 0
  authUser.locked_until = null
  authUser.token_version = (authUser.token_version || 1) + 1
  if (profile.auth_provider === 'google') {
    profile.auth_provider = 'both'
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  await sendAuthEmail({
    to: profile.email,
    subject: '[Cảnh báo bảo mật] Mật khẩu của thầy/cô vừa được đặt lại',
    html: buildPasswordChangedAlertEmailHtml({
      fullName: profile.full_name,
      changedAtStr: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    }),
  })

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'password_reset_completed',
    detail: { email: profile.email },
    req: params.req,
  })

  return {
    success: true,
    message: 'Đặt lại mật khẩu thành công! Thầy/cô có thể đăng nhập bằng mật khẩu mới.',
  }
}

// ============================================================================
// USER PROFILE & SECURITY MANAGEMENT (FOR BOTH ADMIN AND TEACHER)
// ============================================================================

export async function updateMyProfile(params: {
  userId: string
  fullName?: string
  phone?: string | null
  school?: string | null
  avatarUrl?: string | null
  req?: express.Request
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  message: string
}> {
  const store = loadStoreFromDisk()
  const profile = store.profiles.find((p) => p.id === params.userId)
  if (!profile) {
    throw new Error('Không tìm thấy hồ sơ tài khoản.')
  }

  const trimmedName = (params.fullName ?? profile.full_name).trim()
  if (trimmedName.length < 2) {
    throw new Error('Họ và tên phải có ít nhất 2 ký tự.')
  }

  profile.full_name = trimmedName
  if (params.phone !== undefined) {
    profile.phone = params.phone ? params.phone.trim() : null
  }
  if (params.school !== undefined) {
    profile.school = params.school ? params.school.trim() : null
  }
  if (params.avatarUrl !== undefined) {
    profile.avatar_url = params.avatarUrl ? params.avatarUrl.trim() : null
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile)

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'profile_updated',
    detail: {
      full_name: profile.full_name,
      phone: profile.phone,
      school: profile.school,
    },
    req: params.req,
  })

  return {
    success: true,
    profile,
    message: 'Đã cập nhật thông tin hồ sơ cá nhân!',
  }
}

export function getMyAccountSecuritySummary(userId: string): {
  hasPassword: boolean
  tokenVersion: number
  isFixedServerAdmin: boolean
  adminEmailConfigured: string
} {
  const store = loadStoreFromDisk()
  const profile = store.profiles.find((p) => p.id === userId)
  const authUser = store.authUsers.find((u) => u.id === userId)
  return {
    hasPassword: Boolean(authUser?.password_hash),
    tokenVersion: authUser?.token_version || 1,
    isFixedServerAdmin: Boolean(
      profile && isVerifiedAdminEmail(profile.email, profile.email_verified)
    ),
    adminEmailConfigured: getAdminEmail(),
  }
}

export async function changeMyPassword(params: {
  userId: string
  currentPassword?: string
  newPassword: string
  rememberMe?: boolean
  req?: express.Request
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  sessionToken: string
  expiresAt: number
  message: string
}> {
  const store = loadStoreFromDisk()
  const profile = store.profiles.find((p) => p.id === params.userId)
  const authUser = store.authUsers.find((u) => u.id === params.userId)

  if (!profile || !authUser) {
    throw new Error('Không tìm thấy tài khoản.')
  }

  // If user already has a password, require currentPassword verification
  if (authUser.password_hash) {
    if (!params.currentPassword) {
      throw new Error('Vui lòng nhập mật khẩu hiện tại.')
    }
    if (!verifyPasswordHash(params.currentPassword, authUser.password_hash)) {
      throw new Error('Mật khẩu hiện tại không chính xác.')
    }
  }

  const strength = validatePasswordStrength(params.newPassword)
  if (!strength.valid) {
    throw new Error(strength.message || 'Mật khẩu mới chưa đủ mạnh.')
  }

  if (
    authUser.password_hash &&
    verifyPasswordHash(params.newPassword, authUser.password_hash)
  ) {
    throw new Error('Mật khẩu mới không được trùng với mật khẩu hiện tại.')
  }

  authUser.password_hash = hashPassword(params.newPassword)
  authUser.token_version = (authUser.token_version || 1) + 1
  if (profile.auth_provider === 'google') {
    profile.auth_provider = 'both'
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  await sendAuthEmail({
    to: profile.email,
    subject: '[Cảnh báo bảo mật] Mật khẩu tài khoản vừa được thay đổi',
    html: buildPasswordChangedAlertEmailHtml({
      fullName: profile.full_name,
      changedAtStr: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    }),
  })

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'password_changed',
    detail: { revokedOtherSessions: true },
    req: params.req,
  })

  const { token: sessionToken, expiresAt } = signSessionToken({
    userId: profile.id,
    email: profile.email,
    tokenVersion: authUser.token_version,
    rememberMe: params.rememberMe !== false,
  })

  return {
    success: true,
    profile,
    sessionToken,
    expiresAt,
    message: 'Đã cập nhật mật khẩu mới và đăng xuất các thiết bị khác!',
  }
}

export async function revokeOtherSessions(params: {
  userId: string
  rememberMe?: boolean
  req?: express.Request
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  sessionToken: string
  expiresAt: number
  message: string
}> {
  const store = loadStoreFromDisk()
  const profile = store.profiles.find((p) => p.id === params.userId)
  const authUser = store.authUsers.find((u) => u.id === params.userId)

  if (!profile || !authUser) {
    throw new Error('Không tìm thấy tài khoản.')
  }

  authUser.token_version = (authUser.token_version || 1) + 1
  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'revoke_other_sessions',
    detail: { newTokenVersion: authUser.token_version },
    req: params.req,
  })

  const { token: sessionToken, expiresAt } = signSessionToken({
    userId: profile.id,
    email: profile.email,
    tokenVersion: authUser.token_version,
    rememberMe: params.rememberMe !== false,
  })

  return {
    success: true,
    profile,
    sessionToken,
    expiresAt,
    message: 'Đã đăng xuất khỏi tất cả các thiết bị khác thành công!',
  }
}

export async function deleteMyTeacherAccount(params: {
  userId: string
  password?: string
  confirmText?: string
  req?: express.Request
}): Promise<{
  success: boolean
  message: string
}> {
  const store = loadStoreFromDisk()
  const profile = store.profiles.find((p) => p.id === params.userId)
  const authUser = store.authUsers.find((u) => u.id === params.userId)

  if (!profile || !authUser) {
    throw new Error('Không tìm thấy tài khoản.')
  }

  if (profile.role === 'admin' || isVerifiedAdminEmail(profile.email, profile.email_verified)) {
    throw new Error(
      'Tài khoản Quản trị viên cố định (ADMIN_EMAIL) được bảo vệ ở phía server và không thể xóa.'
    )
  }

  if (authUser.password_hash) {
    if (!params.password || !verifyPasswordHash(params.password, authUser.password_hash)) {
      throw new Error('Mật khẩu xác nhận không chính xác.')
    }
  } else if (params.confirmText !== 'XOA TAI KHOAN') {
    throw new Error('Vui lòng nhập đúng cụm từ XOA TAI KHOAN để xác nhận.')
  }

  store.profiles = store.profiles.filter((p) => p.id !== profile.id)
  store.authUsers = store.authUsers.filter((u) => u.id !== profile.id)
  saveStoreToDisk(store)

  try {
    await pool.query('DELETE FROM profiles WHERE id = $1 OR email = $2', [
      profile.id,
      profile.email,
    ])
    await pool.query('DELETE FROM auth_users_local WHERE id = $1 OR email = $2', [
      profile.id,
      profile.email,
    ])
  } catch {
    // ignore if offline
  }

  await recordAuditLog({
    actorId: profile.id,
    targetId: profile.id,
    action: 'self_delete_account',
    detail: { email: profile.email, full_name: profile.full_name },
    req: params.req,
  })

  return {
    success: true,
    message: 'Tài khoản cá nhân của thầy/cô đã được xóa khỏi hệ thống.',
  }
}

// ============================================================================
// ADMIN CONSOLE OPERATIONS (STRICTLY GUARDED BY SERVER ADMIN_EMAIL)
// ============================================================================

export function requireVerifiedAdmin(req: express.Request): UserProfileRecord {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    throw new Error('Vui lòng đăng nhập để tiếp tục.')
  }
  if (
    check.profile.role !== 'admin' ||
    !isVerifiedAdminEmail(check.profile.email, check.profile.email_verified)
  ) {
    throw new Error('Truy cập bị từ chối: Chỉ tài khoản Quản trị viên cố định mới có quyền này.')
  }
  return check.profile
}

export function getAdminDashboardOverview(req: express.Request) {
  const adminProfile = requireVerifiedAdmin(req)
  const store = loadStoreFromDisk()

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const teacherProfiles = store.profiles.filter((p) => p.role === 'teacher')
  const stats = {
    totalAccounts: store.profiles.length,
    totalTeachers: teacherProfiles.length,
    pendingCount: teacherProfiles.filter((p) => p.status === 'pending').length,
    activeCount: teacherProfiles.filter((p) => p.status === 'active').length,
    lockedCount: teacherProfiles.filter((p) => p.status === 'locked').length,
    unverifiedCount: teacherProfiles.filter((p) => !p.email_verified).length,
    activeLast7Days: store.profiles.filter(
      (p) => p.last_login_at && new Date(p.last_login_at).getTime() >= sevenDaysAgo
    ).length,
  }

  // Enrich audit logs with actor/target names & emails (ONLY account metadata, NEVER student/class data)
  const profileMap = new Map(store.profiles.map((p) => [p.id, p]))
  const enrichedAuditLogs = store.auditLogs.slice(0, 200).map((log) => {
    const actor = log.actor_id ? profileMap.get(log.actor_id) : null
    const target = log.target_id ? profileMap.get(log.target_id) : null
    return {
      ...log,
      actor_name: actor?.full_name || (log.actor_id ? 'Hệ thống / Đã xóa' : 'Khách'),
      actor_email: actor?.email || null,
      target_name: target?.full_name || null,
      target_email: target?.email || null,
    }
  })

  return {
    adminEmail: getAdminEmail(),
    currentAdmin: adminProfile,
    stats,
    profiles: [...store.profiles].sort((a, b) => {
      // Admin first, then pending, then newest
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (b.role === 'admin' && a.role !== 'admin') return 1
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }),
    appSettings: store.appSettings,
    invites: [...store.invites].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    auditLogs: enrichedAuditLogs,
  }
}

export async function adminApproveUser(params: {
  req: express.Request
  targetUserId: string
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()
  const target = store.profiles.find((p) => p.id === params.targetUserId)

  if (!target) {
    throw new Error('Không tìm thấy tài khoản giáo viên cần duyệt.')
  }

  const now = new Date().toISOString()
  target.status = 'active'
  target.approved_by = admin.id
  target.approved_at = now
  target.locked_reason = null

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(target)

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  await sendAuthEmail({
    to: target.email,
    subject: '[Lịch Dạy Giáo Viên] Tài khoản của thầy/cô đã được phê duyệt!',
    html: buildAccountApprovedEmailHtml({
      fullName: target.full_name,
      loginUrl: `${frontendUrl}/auth/login`,
    }),
  })

  await recordAuditLog({
    actorId: admin.id,
    targetId: target.id,
    action: 'admin_approve_account',
    detail: { email: target.email, full_name: target.full_name },
    req: params.req,
  })

  return {
    success: true,
    profile: target,
    message: `Đã phê duyệt tài khoản giáo viên ${target.full_name} (${target.email})!`,
  }
}

export async function adminBulkApproveUsers(params: {
  req: express.Request
  userIds?: string[]
}): Promise<{
  success: boolean
  approvedCount: number
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()
  const now = new Date().toISOString()
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  const targets = store.profiles.filter(
    (p) =>
      p.role === 'teacher' &&
      p.status === 'pending' &&
      (!params.userIds || params.userIds.length === 0 || params.userIds.includes(p.id))
  )

  if (targets.length === 0) {
    return {
      success: true,
      approvedCount: 0,
      message: 'Không có tài khoản nào đang ở trạng thái chờ duyệt.',
    }
  }

  for (const target of targets) {
    target.status = 'active'
    target.approved_by = admin.id
    target.approved_at = now
    target.locked_reason = null
    await syncProfileToPostgresIfAvailable(target)
    await sendAuthEmail({
      to: target.email,
      subject: '[Lịch Dạy Giáo Viên] Tài khoản của thầy/cô đã được phê duyệt!',
      html: buildAccountApprovedEmailHtml({
        fullName: target.full_name,
        loginUrl: `${frontendUrl}/auth/login`,
      }),
    })
  }

  saveStoreToDisk(store)

  await recordAuditLog({
    actorId: admin.id,
    targetId: null,
    action: 'admin_bulk_approve',
    detail: {
      count: targets.length,
      emails: targets.map((t) => t.email),
    },
    req: params.req,
  })

  return {
    success: true,
    approvedCount: targets.length,
    message: `Đã phê duyệt thành công ${targets.length} tài khoản giáo viên!`,
  }
}

export async function adminLockUser(params: {
  req: express.Request
  targetUserId: string
  reason?: string
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()
  const target = store.profiles.find((p) => p.id === params.targetUserId)
  const authUser = store.authUsers.find((u) => u.id === params.targetUserId)

  if (!target) {
    throw new Error('Không tìm thấy tài khoản cần khóa.')
  }

  if (target.role === 'admin' || isVerifiedAdminEmail(target.email, target.email_verified)) {
    throw new Error('Không thể khóa tài khoản Quản trị viên cố định của hệ thống.')
  }

  const reason = (params.reason || '').trim() || 'Tạm khóa theo quyết định của Quản trị viên'
  target.status = 'locked'
  target.locked_reason = reason

  // Increment token_version so any active browser/PWA session is revoked immediately
  if (authUser) {
    authUser.token_version = (authUser.token_version || 1) + 1
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(target, authUser)

  await sendAuthEmail({
    to: target.email,
    subject: '[Lịch Dạy Giáo Viên] Thông báo tạm khóa tài khoản',
    html: buildAccountLockedUnlockedEmailHtml({
      fullName: target.full_name,
      locked: true,
      reason,
    }),
  })

  await recordAuditLog({
    actorId: admin.id,
    targetId: target.id,
    action: 'admin_lock_account',
    detail: { email: target.email, reason },
    req: params.req,
  })

  return {
    success: true,
    profile: target,
    message: `Đã khóa tài khoản ${target.full_name} và thu hồi phiên đăng nhập hiện tại.`,
  }
}

export async function adminUnlockUser(params: {
  req: express.Request
  targetUserId: string
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()
  const target = store.profiles.find((p) => p.id === params.targetUserId)
  const authUser = store.authUsers.find((u) => u.id === params.targetUserId)

  if (!target) {
    throw new Error('Không tìm thấy tài khoản cần mở khóa.')
  }

  target.status = 'active'
  target.locked_reason = null
  if (!target.approved_at) {
    target.approved_by = admin.id
    target.approved_at = new Date().toISOString()
  }
  if (authUser) {
    authUser.failed_login_attempts = 0
    authUser.locked_until = null
  }

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(target, authUser)

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  await sendAuthEmail({
    to: target.email,
    subject: '[Lịch Dạy Giáo Viên] Tài khoản của thầy/cô đã được mở khóa',
    html: buildAccountLockedUnlockedEmailHtml({
      fullName: target.full_name,
      locked: false,
      loginUrl: `${frontendUrl}/auth/login`,
    }),
  })

  await recordAuditLog({
    actorId: admin.id,
    targetId: target.id,
    action: 'admin_unlock_account',
    detail: { email: target.email },
    req: params.req,
  })

  return {
    success: true,
    profile: target,
    message: `Đã mở khóa tài khoản ${target.full_name} (${target.email})!`,
  }
}

export async function adminResetUserPassword(params: {
  req: express.Request
  targetUserId: string
  temporaryPassword?: string
}): Promise<{
  success: boolean
  message: string
  resetUrl?: string
  temporaryPassword?: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()
  const target = store.profiles.find((p) => p.id === params.targetUserId)
  const authUser = store.authUsers.find((u) => u.id === params.targetUserId)

  if (!target || !authUser) {
    throw new Error('Không tìm thấy tài khoản giáo viên.')
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  if (params.temporaryPassword && params.temporaryPassword.trim()) {
    const tempPass = params.temporaryPassword.trim()
    const strength = validatePasswordStrength(tempPass)
    if (!strength.valid) {
      throw new Error(strength.message || 'Mật khẩu tạm thời chưa đủ mạnh.')
    }

    authUser.password_hash = hashPassword(tempPass)
    authUser.email_verified = true
    target.email_verified = true
    authUser.failed_login_attempts = 0
    authUser.locked_until = null
    authUser.token_version = (authUser.token_version || 1) + 1
    if (target.auth_provider === 'google') {
      target.auth_provider = 'both'
    }

    saveStoreToDisk(store)
    await syncProfileToPostgresIfAvailable(target, authUser)

    await recordAuditLog({
      actorId: admin.id,
      targetId: target.id,
      action: 'admin_set_temp_password',
      detail: { email: target.email },
      req: params.req,
    })

    return {
      success: true,
      temporaryPassword: tempPass,
      message: `Đã đặt mật khẩu mới cho ${target.full_name} (${target.email}).`,
    }
  }

  // Otherwise generate a 1-hour reset link and send email
  const resetToken = crypto.randomBytes(24).toString('hex')
  authUser.reset_token = resetToken
  authUser.reset_expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(target, authUser)

  const resetUrl = `${frontendUrl}/auth/forgot-password?token=${encodeURIComponent(
    resetToken
  )}&email=${encodeURIComponent(target.email)}`

  await sendAuthEmail({
    to: target.email,
    subject: '[Lịch Dạy Giáo Viên] Liên kết đặt lại mật khẩu từ Quản trị viên',
    html: buildResetPasswordEmailHtml({
      fullName: target.full_name,
      resetUrl,
    }),
  })

  await recordAuditLog({
    actorId: admin.id,
    targetId: target.id,
    action: 'admin_send_password_reset_link',
    detail: { email: target.email },
    req: params.req,
  })

  return {
    success: true,
    resetUrl,
    message: `Đã tạo và gửi liên kết đặt lại mật khẩu tới ${target.email}.`,
  }
}

export async function adminCreateTeacherAccount(params: {
  req: express.Request
  fullName: string
  email: string
  password: string
  school?: string
  phone?: string
  status?: 'active' | 'pending'
}): Promise<{
  success: boolean
  profile: UserProfileRecord
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()

  const fullName = (params.fullName || '').trim()
  const email = (params.email || '').trim().toLowerCase()
  if (fullName.length < 2) {
    throw new Error('Vui lòng nhập họ và tên giáo viên (tối thiểu 2 ký tự).')
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Địa chỉ email không hợp lệ.')
  }
  if (email === getAdminEmail()) {
    throw new Error('Email này là email Quản trị viên cố định của hệ thống.')
  }
  if (store.profiles.some((p) => p.email === email)) {
    throw new Error('Địa chỉ email này đã tồn tại trong hệ thống.')
  }

  const strength = validatePasswordStrength(params.password)
  if (!strength.valid) {
    throw new Error(strength.message || 'Mật khẩu khởi tạo chưa đủ mạnh.')
  }

  const now = new Date().toISOString()
  const userId = `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const status: AccountStatus = params.status === 'pending' ? 'pending' : 'active'

  const profile: UserProfileRecord = {
    id: userId,
    full_name: fullName,
    email,
    phone: params.phone?.trim() || null,
    school: params.school?.trim() || null,
    avatar_url: null,
    role: 'teacher',
    status,
    email_verified: true,
    auth_provider: 'email',
    created_at: now,
    approved_by: status === 'active' ? admin.id : null,
    approved_at: status === 'active' ? now : null,
    last_login_at: null,
    locked_reason: null,
  }

  const authUser: LocalAuthUserRecord = {
    id: userId,
    email,
    password_hash: hashPassword(params.password),
    email_verified: true,
    verification_token: null,
    verification_expires_at: null,
    reset_token: null,
    reset_expires_at: null,
    failed_login_attempts: 0,
    locked_until: null,
    last_verification_sent_at: now,
    last_admin_notify_at: null,
    token_version: 1,
    created_at: now,
  }

  store.profiles.push(profile)
  store.authUsers.push(authUser)
  saveStoreToDisk(store)
  await syncProfileToPostgresIfAvailable(profile, authUser)

  await recordAuditLog({
    actorId: admin.id,
    targetId: profile.id,
    action: 'admin_create_teacher',
    detail: { email: profile.email, full_name: profile.full_name, status },
    req: params.req,
  })

  return {
    success: true,
    profile,
    message: `Đã tạo tài khoản giáo viên ${profile.full_name} (${profile.email}) thành công!`,
  }
}

export async function adminDeleteTeacherAccount(params: {
  req: express.Request
  targetUserId: string
  reason?: string
}): Promise<{
  success: boolean
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()
  const target = store.profiles.find((p) => p.id === params.targetUserId)

  if (!target) {
    throw new Error('Không tìm thấy tài khoản cần xóa.')
  }

  if (target.role === 'admin' || isVerifiedAdminEmail(target.email, target.email_verified)) {
    throw new Error('Không thể xóa tài khoản Quản trị viên cố định (ADMIN_EMAIL).')
  }

  const wasPending = target.status === 'pending'
  store.profiles = store.profiles.filter((p) => p.id !== target.id)
  store.authUsers = store.authUsers.filter((u) => u.id !== target.id)
  saveStoreToDisk(store)

  try {
    await pool.query('DELETE FROM profiles WHERE id = $1 OR email = $2', [
      target.id,
      target.email,
    ])
    await pool.query('DELETE FROM auth_users_local WHERE id = $1 OR email = $2', [
      target.id,
      target.email,
    ])
  } catch {
    // ignore if db offline
  }

  if (wasPending) {
    await sendAuthEmail({
      to: target.email,
      subject: '[Lịch Dạy Giáo Viên] Thông báo kết quả xét duyệt tài khoản',
      html: buildAccountRejectedEmailHtml({
        fullName: target.full_name,
        reason: params.reason,
      }),
    })
  }

  await recordAuditLog({
    actorId: admin.id,
    targetId: target.id,
    action: wasPending ? 'admin_reject_pending_account' : 'admin_delete_account',
    detail: {
      email: target.email,
      full_name: target.full_name,
      reason: params.reason || null,
    },
    req: params.req,
  })

  return {
    success: true,
    message: wasPending
      ? `Đã từ chối và xóa yêu cầu đăng ký của ${target.full_name} (${target.email}).`
      : `Đã xóa tài khoản giáo viên ${target.full_name} (${target.email}).`,
  }
}

export async function adminUpdateAppSettings(params: {
  req: express.Request
  registration_mode?: RegistrationMode
  google_login_enabled?: boolean
  password_login_enabled?: boolean
  notify_admin_email?: boolean
  max_accounts?: number | null
}): Promise<{
  success: boolean
  appSettings: AppSettingsRecord
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()

  const nextMode = params.registration_mode ?? store.appSettings.registration_mode
  const nextGoogle = params.google_login_enabled ?? store.appSettings.google_login_enabled
  const nextPassword = params.password_login_enabled ?? store.appSettings.password_login_enabled

  if (!nextGoogle && !nextPassword) {
    throw new Error(
      'Phải bật ít nhất một phương thức đăng nhập (Email & Mật khẩu hoặc Google).'
    )
  }

  store.appSettings = {
    ...store.appSettings,
    registration_mode: nextMode,
    google_login_enabled: Boolean(nextGoogle),
    password_login_enabled: Boolean(nextPassword),
    notify_admin_email:
      params.notify_admin_email !== undefined
        ? Boolean(params.notify_admin_email)
        : store.appSettings.notify_admin_email,
    max_accounts:
      params.max_accounts !== undefined
        ? params.max_accounts && Number(params.max_accounts) > 0
          ? Number(params.max_accounts)
          : null
        : store.appSettings.max_accounts,
    updated_at: new Date().toISOString(),
  }

  saveStoreToDisk(store)

  try {
    await pool.query(
      `UPDATE app_settings
       SET registration_mode = $1,
           google_login_enabled = $2,
           password_login_enabled = $3,
           notify_admin_email = $4,
           max_accounts = $5,
           updated_at = NOW()
       WHERE id = 'global'`,
      [
        store.appSettings.registration_mode,
        store.appSettings.google_login_enabled,
        store.appSettings.password_login_enabled,
        store.appSettings.notify_admin_email,
        store.appSettings.max_accounts,
      ]
    )
  } catch {
    // ignore if offline
  }

  await recordAuditLog({
    actorId: admin.id,
    targetId: null,
    action: 'admin_update_settings',
    detail: { ...store.appSettings },
    req: params.req,
  })

  return {
    success: true,
    appSettings: store.appSettings,
    message: 'Đã lưu cấu hình đăng ký và bảo mật hệ thống!',
  }
}

export async function adminCreateInvite(params: {
  req: express.Request
  email?: string | null
  customCode?: string | null
  maxUses?: number
  expiresInDays?: number | null
  sendEmailNow?: boolean
}): Promise<{
  success: boolean
  invite: InviteRecord
  inviteUrl: string
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()

  const rawCode = (params.customCode || '').trim().toUpperCase()
  const code =
    rawCode ||
    `GV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

  if (store.invites.some((inv) => inv.code.toUpperCase() === code && !inv.revoked)) {
    throw new Error(`Mã mời "${code}" đang hoạt động, vui lòng chọn mã khác.`)
  }

  const now = new Date()
  const expiresAt =
    params.expiresInDays && Number(params.expiresInDays) > 0
      ? new Date(now.getTime() + Number(params.expiresInDays) * 86400 * 1000).toISOString()
      : null

  const targetEmail = params.email?.trim() ? params.email.trim().toLowerCase() : null
  const invite: InviteRecord = {
    id: `inv-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    email: targetEmail,
    code,
    max_uses: Math.max(1, Number(params.maxUses || 1)),
    used_count: 0,
    expires_at: expiresAt,
    created_by: admin.id,
    created_at: now.toISOString(),
    revoked: false,
  }

  store.invites.unshift(invite)
  saveStoreToDisk(store)

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const inviteUrl = `${frontendUrl}/auth/register?invite=${encodeURIComponent(
    invite.code
  )}${targetEmail ? `&email=${encodeURIComponent(targetEmail)}` : ''}`

  if (targetEmail && params.sendEmailNow !== false) {
    await sendAuthEmail({
      to: targetEmail,
      subject: `[Lịch Dạy Giáo Viên] Lời mời đăng ký tài khoản giáo viên (Mã: ${invite.code})`,
      html: buildInviteTeacherEmailHtml({
        inviteUrl,
        inviteCode: invite.code,
        expiresAtStr: expiresAt
          ? new Date(expiresAt).toLocaleDateString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
            })
          : 'Không giới hạn',
      }),
    })
  }

  await recordAuditLog({
    actorId: admin.id,
    targetId: null,
    action: 'admin_create_invite',
    detail: {
      code: invite.code,
      email: invite.email,
      max_uses: invite.max_uses,
      expires_at: invite.expires_at,
    },
    req: params.req,
  })

  return {
    success: true,
    invite,
    inviteUrl,
    message: `Đã tạo mã mời ${invite.code} thành công!`,
  }
}

export async function adminRevokeOrDeleteInvite(params: {
  req: express.Request
  inviteId: string
  deletePermanently?: boolean
}): Promise<{
  success: boolean
  message: string
}> {
  const admin = requireVerifiedAdmin(params.req)
  const store = loadStoreFromDisk()
  const invite = store.invites.find((i) => i.id === params.inviteId)

  if (!invite) {
    throw new Error('Không tìm thấy mã mời.')
  }

  if (params.deletePermanently) {
    store.invites = store.invites.filter((i) => i.id !== params.inviteId)
  } else {
    invite.revoked = true
  }

  saveStoreToDisk(store)

  await recordAuditLog({
    actorId: admin.id,
    targetId: null,
    action: params.deletePermanently ? 'admin_delete_invite' : 'admin_revoke_invite',
    detail: { code: invite.code, email: invite.email },
    req: params.req,
  })

  return {
    success: true,
    message: params.deletePermanently
      ? `Đã xóa mã mời ${invite.code}.`
      : `Đã thu hồi mã mời ${invite.code}.`,
  }
}


