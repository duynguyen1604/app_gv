import type { AuthStoreData, Env, StoredUser } from '../../types/index'
import {
  getAdminEmail,
  normalizeEmail,
  saveAuthStore,
  toPublicProfile,
  validatePasswordStrength,
} from '../../shared/auth-store.service'
import { hashPassword, verifyPassword } from '../../shared/crypto.util'

export function buildProfileMePayload(user: StoredUser, env: Env) {
  const adminEmail = getAdminEmail(env)
  return {
    success: true,
    profile: toPublicProfile(user),
    security: {
      hasPassword: Boolean(user.password_hash),
      tokenVersion: user.token_version || 1,
      isFixedServerAdmin: Boolean(adminEmail) && normalizeEmail(user.email) === adminEmail,
      adminEmailConfigured: user.role === 'admin' ? adminEmail : '',
    },
  }
}

export async function updateProfileFields(
  env: Env,
  store: AuthStoreData,
  user: StoredUser,
  body: Record<string, any>
) {
  if (typeof body.full_name === 'string' && body.full_name.trim()) {
    user.full_name = body.full_name.trim()
  }
  if (body.phone !== undefined) {
    user.phone = body.phone ? String(body.phone).trim() : null
  }
  if (body.school !== undefined) {
    user.school = body.school ? String(body.school).trim() : null
  }
  if (body.avatar_url !== undefined) {
    user.avatar_url = body.avatar_url || null
  }
  if (typeof body.onboarding_completed === 'boolean') {
    user.onboarding_completed = body.onboarding_completed
  }
  await saveAuthStore(env, store)
  return toPublicProfile(user)
}

export async function completeUserOnboarding(
  env: Env,
  store: AuthStoreData,
  user: StoredUser
) {
  user.onboarding_completed = true
  await saveAuthStore(env, store)
  return toPublicProfile(user)
}

export async function changeUserPassword(params: {
  env: Env
  store: AuthStoreData
  user: StoredUser
  tokenHash: string
  currentPassword: string
  newPassword: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { env, store, user, tokenHash, currentPassword, newPassword } = params
  if (user.password_hash && !(await verifyPassword(currentPassword, user.password_hash))) {
    return { ok: false, error: 'Mật khẩu hiện tại không chính xác.' }
  }
  const pwErr = validatePasswordStrength(newPassword)
  if (pwErr) return { ok: false, error: pwErr }

  user.password_hash = await hashPassword(newPassword)
  user.token_version = (user.token_version || 1) + 1
  store.sessions = store.sessions.filter(
    (s) => s.user_id !== user.id || s.token_hash === tokenHash
  )
  await saveAuthStore(env, store)
  return { ok: true }
}

export async function revokeOtherUserSessions(
  env: Env,
  store: AuthStoreData,
  userId: string,
  currentTokenHash: string
): Promise<number> {
  const before = store.sessions.length
  store.sessions = store.sessions.filter(
    (s) => s.user_id !== userId || s.token_hash === currentTokenHash
  )
  const revokedCount = before - store.sessions.length
  await saveAuthStore(env, store)
  return revokedCount
}

export async function deleteOwnAccount(
  env: Env,
  store: AuthStoreData,
  userId: string
): Promise<void> {
  store.users = store.users.filter((u) => u.id !== userId)
  store.sessions = store.sessions.filter((s) => s.user_id !== userId)
  await saveAuthStore(env, store)
}

