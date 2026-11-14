import type { Env } from '../../types/index'
import { requireAuth } from '../../middleware/auth.middleware'
import { jsonResponse, readJsonBody } from '../../middleware/cors.middleware'
import { extractBearerToken, toPublicProfile } from '../../shared/auth-store.service'
import {
  buildProfileMePayload,
  changeUserPassword,
  completeUserOnboarding,
  deleteOwnAccount,
  revokeOtherUserSessions,
  updateProfileFields,
} from './profile.service'

export async function getMyProfile(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Chưa đăng nhập.')
  if (!authResult.ok) return authResult.response
  return jsonResponse(buildProfileMePayload(authResult.ctx.user, env))
}

export async function updateMyProfile(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Chưa đăng nhập.')
  if (!authResult.ok) return authResult.response
  const body = await readJsonBody(req)
  const profile = await updateProfileFields(env, authResult.ctx.store, authResult.ctx.user, body)
  return jsonResponse({
    success: true,
    profile,
    message: 'Đã lưu thông tin hồ sơ cá nhân.',
  })
}

export async function postOnboardingComplete(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Chưa đăng nhập.')
  if (!authResult.ok) return authResult.response
  const profile = await completeUserOnboarding(env, authResult.ctx.store, authResult.ctx.user)
  return jsonResponse({
    success: true,
    profile,
    message: 'Đã ghi nhận hoàn thành hướng dẫn sử dụng.',
  })
}

export async function postChangePassword(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Chưa đăng nhập.')
  if (!authResult.ok) return authResult.response
  const body = await readJsonBody(req)
  const currentPassword = String(body.currentPassword || body.current_password || '')
  const newPassword = String(body.newPassword || body.new_password || '')

  const res = await changeUserPassword({
    env,
    store: authResult.ctx.store,
    user: authResult.ctx.user,
    tokenHash: authResult.ctx.tokenHash,
    currentPassword,
    newPassword,
  })
  if (!res.ok) {
    return jsonResponse({ success: false, error: res.error }, 400)
  }

  return jsonResponse({
    success: true,
    profile: toPublicProfile(authResult.ctx.user),
    sessionToken: extractBearerToken(req) || '',
    expiresAt: authResult.ctx.session.expires_at,
    message: 'Đã đổi mật khẩu thành công!',
  })
}

export async function postRevokeOtherSessions(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Chưa đăng nhập.')
  if (!authResult.ok) return authResult.response
  const revokedCount = await revokeOtherUserSessions(
    env,
    authResult.ctx.store,
    authResult.ctx.user.id,
    authResult.ctx.tokenHash
  )
  return jsonResponse({
    success: true,
    profile: toPublicProfile(authResult.ctx.user),
    sessionToken: extractBearerToken(req) || '',
    expiresAt: authResult.ctx.session.expires_at,
    message: `Đã đăng xuất ${revokedCount} phiên thiết bị khác.`,
  })
}

export async function postDeleteAccount(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Chưa đăng nhập.')
  if (!authResult.ok) return authResult.response
  if (authResult.ctx.user.role === 'admin') {
    return jsonResponse(
      { success: false, error: 'Không thể xóa tài khoản Quản trị viên hệ thống.' },
      400
    )
  }
  await deleteOwnAccount(env, authResult.ctx.store, authResult.ctx.user.id)
  return jsonResponse({
    success: true,
    message: 'Đã xóa tài khoản thành công.',
  })
}

