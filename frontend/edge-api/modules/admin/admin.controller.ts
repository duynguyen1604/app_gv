import type { AccountStatus, Env } from '../../types/index'
import { type AuthContext } from '../../middleware/auth.middleware'
import { jsonResponse, readJsonBody } from '../../middleware/cors.middleware'
import { normalizeEmail, validatePasswordStrength } from '../../shared/auth-store.service'
import {
  approveUserByAdmin,
  buildAdminOverview,
  bulkApproveTeachers,
  createInviteByAdmin,
  createTeacherByAdmin,
  deleteInviteByAdmin,
  deleteUserByAdmin,
  listAllTicketsForAdmin,
  lockUserByAdmin,
  replyTicketByAdmin,
  resetUserPasswordByAdmin,
  revokeInviteByAdmin,
  unlockUserByAdmin,
  updateSystemSettings,
  updateTicketStatusByAdmin,
} from './admin.service'

export function getOverview(ctx: AuthContext, env: Env): Response {
  return jsonResponse(buildAdminOverview(ctx.store, ctx.user, env))
}

export async function approveBulkUsers(
  req: Request,
  ctx: AuthContext,
  env: Env
): Promise<Response> {
  const body = await readJsonBody(req)
  const userIds: string[] | undefined = Array.isArray(body.userIds)
    ? body.userIds
    : Array.isArray(body.user_ids)
      ? body.user_ids
      : undefined
  const count = await bulkApproveTeachers(env, ctx.store, ctx.user, userIds)
  return jsonResponse({
    success: true,
    approvedCount: count,
    message: `Đã phê duyệt ${count} tài khoản giáo viên.`,
  })
}

export async function createUser(
  req: Request,
  ctx: AuthContext,
  env: Env
): Promise<Response> {
  const body = await readJsonBody(req)
  const email = normalizeEmail(body.email || '')
  const fullName = String(body.full_name || '').trim()
  const password = String(body.password || '')
  const status: AccountStatus = body.status === 'pending' ? 'pending' : 'active'

  if (!email || !fullName) {
    return jsonResponse({ success: false, error: 'Vui lòng nhập Họ tên và Email.' }, 400)
  }
  const pwErr = validatePasswordStrength(password)
  if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)
  if (ctx.store.users.some((u) => normalizeEmail(u.email) === email)) {
    return jsonResponse(
      { success: false, error: 'Email này đã tồn tại trong hệ thống.' },
      409
    )
  }

  const profile = await createTeacherByAdmin({
    env,
    store: ctx.store,
    adminUser: ctx.user,
    email,
    fullName,
    password,
    status,
    phone: body.phone ? String(body.phone).trim() : null,
    school: body.school ? String(body.school).trim() : null,
  })
  return jsonResponse({
    success: true,
    profile,
    message: `Đã tạo tài khoản ${profile.email} thành công.`,
  })
}

export async function handleUserAction(
  req: Request,
  method: string,
  targetId: string,
  subAction: string,
  ctx: AuthContext,
  env: Env
): Promise<Response | null> {
  const targetUser = ctx.store.users.find((u) => u.id === targetId)
  if (!targetUser) {
    return jsonResponse({ success: false, error: 'Không tìm thấy người dùng.' }, 404)
  }

  if (method === 'POST' && subAction === 'approve') {
    const profile = await approveUserByAdmin(env, ctx.store, ctx.user, targetUser)
    return jsonResponse({
      success: true,
      profile,
      message: `Đã phê duyệt tài khoản ${targetUser.email}.`,
    })
  }

  if (method === 'POST' && subAction === 'lock') {
    const body = await readJsonBody(req)
    const reason = String(body.reason || 'Khóa bởi Quản trị viên')
    const profile = await lockUserByAdmin(env, ctx.store, ctx.user, targetUser, reason)
    return jsonResponse({
      success: true,
      profile,
      message: `Đã khóa tài khoản ${targetUser.email}.`,
    })
  }

  if (method === 'POST' && subAction === 'unlock') {
    const profile = await unlockUserByAdmin(env, ctx.store, ctx.user, targetUser)
    return jsonResponse({
      success: true,
      profile,
      message: `Đã mở khóa tài khoản ${targetUser.email}.`,
    })
  }

  if (method === 'POST' && subAction === 'reset-password') {
    const body = await readJsonBody(req)
    const res = await resetUserPasswordByAdmin(
      env,
      ctx.store,
      ctx.user,
      targetUser,
      String(body.temporaryPassword || body.new_password || '')
    )
    if (!res.ok) return jsonResponse({ success: false, error: res.error }, 400)
    return jsonResponse({
      success: true,
      temporaryPassword: res.temporaryPassword,
      message: `Đã đặt mật khẩu mới cho ${targetUser.email}.`,
    })
  }

  if (method === 'DELETE' && !subAction) {
    if (targetUser.id === ctx.user.id) {
      return jsonResponse(
        { success: false, error: 'Không thể tự xóa tài khoản Admin đang đăng nhập.' },
        400
      )
    }
    await deleteUserByAdmin(env, ctx.store, ctx.user, targetUser)
    return jsonResponse({
      success: true,
      message: `Đã xóa tài khoản ${targetUser.email}.`,
    })
  }

  return null
}

export async function putAdminSettings(
  req: Request,
  ctx: AuthContext,
  env: Env
): Promise<Response> {
  const body = await readJsonBody(req)
  const appSettings = await updateSystemSettings(env, ctx.store, ctx.user, body)
  return jsonResponse({
    success: true,
    appSettings,
    message: 'Đã cập nhật cài đặt hệ thống.',
  })
}

export async function postCreateInvite(
  req: Request,
  url: URL,
  ctx: AuthContext,
  env: Env
): Promise<Response> {
  const body = await readJsonBody(req)
  const res = await createInviteByAdmin(env, ctx.store, ctx.user, body)
  if (!res.ok) return jsonResponse({ success: false, error: res.error }, 400)
  return jsonResponse({
    success: true,
    invite: res.invite,
    inviteUrl: `${url.origin}/auth/register?invite=${encodeURIComponent(res.invite.code)}`,
    message: `Đã tạo mã mời ${res.invite.code}.`,
  })
}

export async function handleInviteAction(
  method: string,
  invId: string,
  sub: string,
  ctx: AuthContext,
  env: Env
): Promise<Response | null> {
  if (method === 'POST' && sub === 'revoke') {
    const inv = await revokeInviteByAdmin(env, ctx.store, ctx.user, invId)
    if (!inv) return jsonResponse({ success: false, error: 'Không tìm thấy mã mời.' }, 404)
    return jsonResponse({
      success: true,
      message: `Đã thu hồi mã mời ${inv.code}.`,
    })
  }

  if (method === 'DELETE' && !sub) {
    await deleteInviteByAdmin(env, ctx.store, ctx.user, invId)
    return jsonResponse({
      success: true,
      message: 'Đã xóa mã mời.',
    })
  }

  return null
}

export async function getAdminTickets(env: Env): Promise<Response> {
  const data = await listAllTicketsForAdmin(env)
  return jsonResponse({
    success: true,
    ...data,
  })
}

export async function handleAdminTicketAction(
  req: Request,
  ticketId: string,
  action: string,
  ctx: AuthContext,
  env: Env
): Promise<Response | null> {
  const body = await readJsonBody(req)

  if (action === 'reply') {
    const text = String(body.message || body.text || '').trim()
    if (!text) {
      return jsonResponse({ success: false, error: 'Vui lòng nhập nội dung phản hồi.' }, 400)
    }
    const ticket = await replyTicketByAdmin({
      env,
      store: ctx.store,
      adminUser: ctx.user,
      ticketId,
      text,
    })
    if (!ticket) {
      return jsonResponse({ success: false, error: 'Không tìm thấy đơn hỗ trợ.' }, 404)
    }
    return jsonResponse({ success: true, ticket, message: 'Đã gửi phản hồi cho giáo viên.' })
  }

  if (action === 'status') {
    const result = await updateTicketStatusByAdmin(env, ticketId, body.status)
    if (!result) {
      return jsonResponse({ success: false, error: 'Không tìm thấy đơn hỗ trợ.' }, 404)
    }
    return jsonResponse({
      success: true,
      ticket: result.ticket,
      message:
        result.nextStatus === 'resolved' ? 'Đã đánh dấu đã giải quyết.' : 'Đã mở lại đơn.',
    })
  }

  return null
}

