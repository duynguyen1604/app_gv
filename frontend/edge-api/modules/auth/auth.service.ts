import type {
  AccountRole,
  AccountStatus,
  AuthStoreData,
  Env,
  InviteRecord,
  StoredUser,
} from '../../types/index'
import {
  appendAuditLog,
  createSession,
  getAdminEmail,
  loadAuthStore,
  normalizeEmail,
  saveAuthStore,
  toPublicProfile,
} from '../../shared/auth-store.service'
import { generateId, hashPassword, randomHex, sha256Hex } from '../../shared/crypto.util'

export async function upsertGoogleUserAndSession(params: {
  env: Env
  email: string
  fullName: string
  avatarUrl?: string | null
  userAgent?: string
  auditDetailMessage: string
}) {
  const { env, email, fullName, avatarUrl, userAgent, auditDetailMessage } = params
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
    if (avatarUrl && !user.avatar_url) {
      user.avatar_url = avatarUrl
    }
    user.last_login_at = nowIso
  } else {
    user = {
      id: generateId('usr'),
      email,
      full_name: fullName || email.split('@')[0],
      phone: null,
      school: null,
      avatar_url: avatarUrl || null,
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

  const { sessionToken, expiresAt } = await createSession(store, user.id, true, userAgent)
  appendAuditLog(store, {
    actor_id: user.id,
    actor_email: user.email,
    action: linkedExisting ? 'google_account_linked' : 'login_google_redirect',
    target_email: user.email,
    detail: { message: linkedExisting && avatarUrl !== undefined ? 'Liên kết & đăng nhập bằng Google OAuth' : auditDetailMessage },
  })
  await saveAuthStore(env, store)

  return { user, sessionToken, expiresAt, linkedExisting }
}

export async function registerEmailAccount(params: {
  env: Env
  store: AuthStoreData
  email: string
  password: string
  fullName: string
  phone: string | null
  school: string | null
  matchedInvite?: InviteRecord
  origin: string
}) {
  const { env, store, email, password, fullName, phone, school, matchedInvite, origin } = params
  const nowIso = new Date().toISOString()
  const isAdminEmail = email === getAdminEmail(env)
  const autoActive =
    isAdminEmail || Boolean(matchedInvite) || store.appSettings.registration_mode === 'open'
  const initialStatus: AccountStatus = autoActive ? 'active' : 'pending'
  const role: AccountRole = isAdminEmail ? 'admin' : 'teacher'

  const rawVerifyToken = randomHex(20)
  const verifyTokenHash = await sha256Hex(rawVerifyToken)

  const newUser: StoredUser = {
    id: generateId('usr'),
    email,
    full_name: fullName,
    phone,
    school,
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

  const devVerifyUrl = `${origin}/auth/verify-email?email=${encodeURIComponent(
    newUser.email
  )}&token=${rawVerifyToken}`

  return {
    email: newUser.email,
    devVerifyUrl,
    initialStatus,
    profile: toPublicProfile(newUser),
  }
}

