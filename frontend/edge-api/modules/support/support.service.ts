import type { AuthStoreData, Env, StoredUser, SupportTicketRecord } from '../../types/index'
import { kvGet, kvSet } from '../../shared/kv.service'
import { generateId } from '../../shared/crypto.util'
import { appendAuditLog, getAdminEmail, saveAuthStore } from '../../shared/auth-store.service'
import { escapeHtml, sendEmailViaResend } from '../../shared/email.service'

export const SUPPORT_TICKETS_KEY = 'v3_clean_support_tickets'

export async function loadSupportTickets(env: Env): Promise<SupportTicketRecord[]> {
  const list = await kvGet<SupportTicketRecord[]>(env.DB, SUPPORT_TICKETS_KEY)
  return Array.isArray(list) ? list : []
}

export async function saveSupportTickets(env: Env, tickets: SupportTicketRecord[]): Promise<void> {
  await kvSet(env.DB, SUPPORT_TICKETS_KEY, tickets.slice(0, 500))
}

export async function listTicketsForUser(
  env: Env,
  userId: string
): Promise<SupportTicketRecord[]> {
  const all = await loadSupportTickets(env)
  return all.filter((t) => t.user_id === userId)
}

export async function createTicketForUser(params: {
  env: Env
  store: AuthStoreData
  user: StoredUser
  category: SupportTicketRecord['category']
  subject: string
  text: string
}): Promise<SupportTicketRecord> {
  const { env, store, user, category, subject, text } = params
  const nowIso = new Date().toISOString()
  const ticket: SupportTicketRecord = {
    id: generateId('tkt'),
    user_id: user.id,
    user_email: user.email,
    user_name: user.full_name || user.email,
    category,
    subject: subject.slice(0, 140),
    status: 'open',
    messages: [
      {
        id: generateId('msg'),
        sender_role: 'user',
        sender_name: user.full_name || user.email,
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
    actor_id: user.id,
    actor_email: user.email,
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

  return ticket
}

export async function addUserReplyToTicket(params: {
  env: Env
  user: StoredUser
  ticketId: string
  text: string
}): Promise<SupportTicketRecord | null> {
  const { env, user, ticketId, text } = params
  const all = await loadSupportTickets(env)
  const ticket = all.find((t) => t.id === ticketId && t.user_id === user.id)
  if (!ticket) return null

  const nowIso = new Date().toISOString()
  ticket.messages.push({
    id: generateId('msg'),
    sender_role: 'user',
    sender_name: user.full_name || user.email,
    text: text.slice(0, 2000),
    created_at: nowIso,
  })
  ticket.status = 'open'
  ticket.updated_at = nowIso
  await saveSupportTickets(env, all)
  return ticket
}

