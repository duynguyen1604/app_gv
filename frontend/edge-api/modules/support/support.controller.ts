import type { Env } from '../../types/index'
import { requireAuth } from '../../middleware/auth.middleware'
import { jsonResponse, readJsonBody } from '../../middleware/cors.middleware'
import { parseSupportCategory } from './support.validation'
import {
  addUserReplyToTicket,
  createTicketForUser,
  listTicketsForUser,
} from './support.service'

export async function listMyTickets(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Vui lòng đăng nhập để sử dụng tính năng này.')
  if (!authResult.ok) return authResult.response

  const mine = await listTicketsForUser(env, authResult.ctx.user.id)
  return jsonResponse({ success: true, tickets: mine })
}

export async function createMyTicket(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Vui lòng đăng nhập để sử dụng tính năng này.')
  if (!authResult.ok) return authResult.response

  const body = await readJsonBody(req)
  const category = parseSupportCategory(body.category)
  const subject = String(body.subject || '').trim()
  const text = String(body.message || body.text || '').trim()

  if (!subject || !text) {
    return jsonResponse(
      { success: false, error: 'Vui lòng nhập đầy đủ tiêu đề và nội dung.' },
      400
    )
  }

  const ticket = await createTicketForUser({
    env,
    store: authResult.ctx.store,
    user: authResult.ctx.user,
    category,
    subject,
    text,
  })

  return jsonResponse({
    success: true,
    ticket,
    message: 'Đã gửi đơn tới Quản trị viên thành công!',
  })
}

export async function replyMyTicket(req: Request, env: Env, ticketId: string): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Vui lòng đăng nhập để sử dụng tính năng này.')
  if (!authResult.ok) return authResult.response

  const body = await readJsonBody(req)
  const text = String(body.message || body.text || '').trim()
  if (!text) {
    return jsonResponse({ success: false, error: 'Vui lòng nhập nội dung tin nhắn.' }, 400)
  }

  const ticket = await addUserReplyToTicket({
    env,
    user: authResult.ctx.user,
    ticketId,
    text,
  })
  if (!ticket) {
    return jsonResponse({ success: false, error: 'Không tìm thấy đơn hỗ trợ.' }, 404)
  }

  return jsonResponse({ success: true, ticket })
}

