import type {
  AccountStatus,
  AuthStoreData,
  Env,
  InviteRecord,
  StoredUser,
} from '../../types/index'
import {
  appendAuditLog,
  getAdminEmail,
  normalizeEmail,
  saveAuthStore,
  toPublicProfile,
  validatePasswordStrength,
} from '../../shared/auth-store.service'
import { generateId, hashPassword, randomHex } from '../../shared/crypto.util'
import { loadSupportTickets, saveSupportTickets } from '../support/support.service'

export function buildAdminOverview(store: AuthStoreData, currentAdmin: StoredUser, env: Env) {
  const profiles = store.users.map(toPublicProfile)
  const teachers = profiles.filter((p) => p.role === 'teacher')
  const sevenDaysAgo = Date.now() - 7 * 86400000
  return {
    success: true,
    adminEmail: getAdminEmail(env),
    currentAdmin: toPublicProfile(currentAdmin),
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
  }
}

export async function bulkApproveTeachers(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  userIds?: string[]
): Promise<number> {
  const nowIso = new Date().toISOString()
  let count = 0
  for (const u of store.users) {
    const shouldApprove = userIds ? userIds.includes(u.id) : u.status === 'pending'
    if (shouldApprove && u.status !== 'active') {
      u.status = 'active'
      u.email_verified = true
      u.approved_at = nowIso
      u.approved_by = adminUser.id
      count++
    }
  }
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_bulk_approve',
    detail: { approvedCount: count },
  })
  await saveAuthStore(env, store)
  return count
}

export async function createTeacherByAdmin(params: {
  env: Env
  store: AuthStoreData
  adminUser: StoredUser
  email: string
  fullName: string
  password: string
  status: AccountStatus
  phone: string | null
  school: string | null
}) {
  const { env, store, adminUser, email, fullName, password, status, phone, school } = params
  const nowIso = new Date().toISOString()
  const created: StoredUser = {
    id: generateId('usr'),
    email,
    full_name: fullName,
    phone,
    school,
    role: 'teacher',
    status,
    email_verified: true,
    auth_provider: 'email',
    onboarding_completed: false,
    created_at: nowIso,
    approved_at: status === 'active' ? nowIso : null,
    approved_by: status === 'active' ? adminUser.id : null,
    last_login_at: null,
    locked_reason: null,
    password_hash: await hashPassword(password),
    token_version: 1,
  }
  store.users.push(created)
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    actor_name: adminUser.full_name,
    target_id: created.id,
    target_email: created.email,
    target_name: created.full_name,
    action: 'admin_create_teacher',
    detail: { status },
  })
  await saveAuthStore(env, store)
  return toPublicProfile(created)
}

export async function approveUserByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  targetUser: StoredUser
) {
  targetUser.status = 'active'
  targetUser.email_verified = true
  targetUser.approved_at = new Date().toISOString()
  targetUser.approved_by = adminUser.id
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_approve_account',
    target_email: targetUser.email,
    detail: { message: `Phê duyệt tài khoản ${targetUser.email}` },
  })
  await saveAuthStore(env, store)
  return toPublicProfile(targetUser)
}

export async function lockUserByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  targetUser: StoredUser,
  reason: string
) {
  targetUser.status = 'locked'
  targetUser.locked_reason = reason
  store.sessions = store.sessions.filter((s) => s.user_id !== targetUser.id)
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_lock_account',
    target_email: targetUser.email,
    detail: { reason: targetUser.locked_reason },
  })
  await saveAuthStore(env, store)
  return toPublicProfile(targetUser)
}

export async function unlockUserByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  targetUser: StoredUser
) {
  targetUser.status = 'active'
  targetUser.locked_reason = null
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_unlock_account',
    target_email: targetUser.email,
    detail: { message: `Mở khóa tài khoản ${targetUser.email}` },
  })
  await saveAuthStore(env, store)
  return toPublicProfile(targetUser)
}

export async function resetUserPasswordByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  targetUser: StoredUser,
  rawTempPassword: string
): Promise<{ ok: true; temporaryPassword: string } | { ok: false; error: string }> {
  const tempPw = rawTempPassword.trim() || `Gv${randomHex(3)}123`
  const pwErr = validatePasswordStrength(tempPw)
  if (pwErr) return { ok: false, error: pwErr }
  targetUser.password_hash = await hashPassword(tempPw)
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_set_temp_password',
    target_email: targetUser.email,
    detail: { message: `Cấp mật khẩu tạm thời mới cho ${targetUser.email}` },
  })
  await saveAuthStore(env, store)
  return { ok: true, temporaryPassword: tempPw }
}

export async function deleteUserByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  targetUser: StoredUser
) {
  store.users = store.users.filter((u) => u.id !== targetUser.id)
  store.sessions = store.sessions.filter((s) => s.user_id !== targetUser.id)
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_delete_account',
    target_email: targetUser.email,
    detail: { message: `Xóa vĩnh viễn tài khoản ${targetUser.email}` },
  })
  await saveAuthStore(env, store)
}

export async function updateSystemSettings(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  body: Record<string, any>
) {
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
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_update_settings',
    detail: { registration_mode: store.appSettings.registration_mode },
  })
  await saveAuthStore(env, store)
  return store.appSettings
}

export async function createInviteByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  body: Record<string, any>
): Promise<{ ok: true; invite: InviteRecord } | { ok: false; error: string }> {
  const code =
    String(body.customCode || body.custom_code || '')
      .trim()
      .toUpperCase() || `GV-${randomHex(3).toUpperCase()}`
  if (!Array.isArray(store.invites)) store.invites = []
  if (store.invites.some((i) => !i.revoked && i.code.toUpperCase() === code)) {
    return { ok: false, error: `Mã mời "${code}" đã tồn tại. Vui lòng chọn mã khác.` }
  }
  const days = Number(body.expiresInDays ?? body.expires_in_days ?? 0)
  const invite: InviteRecord = {
    id: generateId('inv'),
    code,
    email: body.email ? normalizeEmail(body.email) : null,
    max_uses: Number(body.maxUses ?? body.max_uses) || 1,
    used_count: 0,
    expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
    created_by: adminUser.email,
    created_at: new Date().toISOString(),
    revoked: false,
  }
  store.invites.unshift(invite)
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_create_invite',
    target_email: invite.email || undefined,
    detail: { code: invite.code, max_uses: invite.max_uses },
  })
  await saveAuthStore(env, store)
  return { ok: true, invite }
}

export async function revokeInviteByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  invId: string
): Promise<InviteRecord | null> {
  const inv = store.invites.find((i) => i.id === invId)
  if (!inv) return null
  inv.revoked = true
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_revoke_invite',
    detail: { code: inv.code },
  })
  await saveAuthStore(env, store)
  return inv
}

export async function deleteInviteByAdmin(
  env: Env,
  store: AuthStoreData,
  adminUser: StoredUser,
  invId: string
): Promise<void> {
  const inv = store.invites.find((i) => i.id === invId)
  store.invites = store.invites.filter((i) => i.id !== invId)
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_delete_invite',
    detail: { code: inv?.code || invId },
  })
  await saveAuthStore(env, store)
}

export async function listAllTicketsForAdmin(env: Env) {
  const tickets = await loadSupportTickets(env)
  return {
    tickets,
    openCount: tickets.filter((t) => t.status === 'open').length,
  }
}

export async function replyTicketByAdmin(params: {
  env: Env
  store: AuthStoreData
  adminUser: StoredUser
  ticketId: string
  text: string
}) {
  const { env, store, adminUser, ticketId, text } = params
  const tickets = await loadSupportTickets(env)
  const ticket = tickets.find((t) => t.id === ticketId)
  if (!ticket) return null

  const nowIso = new Date().toISOString()
  ticket.messages.push({
    id: generateId('msg'),
    sender_role: 'admin',
    sender_name: adminUser.full_name || 'Quản trị viên',
    text,
    created_at: nowIso,
  })
  ticket.status = 'replied'
  ticket.updated_at = nowIso
  await saveSupportTickets(env, tickets)
  appendAuditLog(store, {
    actor_id: adminUser.id,
    actor_email: adminUser.email,
    action: 'admin_reply_ticket',
    target_email: ticket.user_email,
    detail: { ticketId: ticket.id, subject: ticket.subject },
  })
  await saveAuthStore(env, store)
  return ticket
}

export async function updateTicketStatusByAdmin(
  env: Env,
  ticketId: string,
  rawStatus: unknown
) {
  const tickets = await loadSupportTickets(env)
  const ticket = tickets.find((t) => t.id === ticketId)
  if (!ticket) return null

  const nextStatus = rawStatus === 'resolved' ? 'resolved' : 'open'
  ticket.status = nextStatus
  ticket.updated_at = new Date().toISOString()
  await saveSupportTickets(env, tickets)
  return { ticket, nextStatus }
}

