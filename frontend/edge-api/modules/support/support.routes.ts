import type { Env } from '../../types/index'
import { createMyTicket, listMyTickets, replyMyTicket } from './support.controller'

export async function handleSupportRoutes(
  req: Request,
  method: string,
  path: string,
  env: Env
): Promise<Response | null> {
  if (!path.startsWith('/api/support/tickets')) return null

  if (method === 'GET' && path === '/api/support/tickets') {
    return listMyTickets(req, env)
  }

  if (method === 'POST' && path === '/api/support/tickets') {
    return createMyTicket(req, env)
  }

  const replyMatch = path.match(/^\/api\/support\/tickets\/([^/]+)\/reply$/)
  if (method === 'POST' && replyMatch) {
    const ticketId = decodeURIComponent(replyMatch[1])
    return replyMyTicket(req, env, ticketId)
  }

  return null
}

