import type { Env } from '../../types/index'
import { requireAdmin } from '../../middleware/auth.middleware'
import {
  approveBulkUsers,
  createUser,
  getAdminTickets,
  getOverview,
  handleAdminTicketAction,
  handleInviteAction,
  handleUserAction,
  postCreateInvite,
  putAdminSettings,
} from './admin.controller'

export async function handleAdminRoutes(
  req: Request,
  method: string,
  path: string,
  url: URL,
  env: Env
): Promise<Response | null> {
  if (!path.startsWith('/api/admin')) return null

  const adminAuth = await requireAdmin(req, env)
  if (!adminAuth.ok) return adminAuth.response
  const ctx = adminAuth.ctx

  if (method === 'GET' && path === '/api/admin/overview') {
    return getOverview(ctx, env)
  }

  // Static user routes MUST run before dynamic /api/admin/users/:id/:action
  if (method === 'POST' && path === '/api/admin/users/approve-bulk') {
    return approveBulkUsers(req, ctx, env)
  }

  if (method === 'POST' && path === '/api/admin/users/create') {
    return createUser(req, ctx, env)
  }

  const userActionMatch = path.match(/^\/api\/admin\/users\/([^/]+)(?:\/([^/]+))?$/)
  if (userActionMatch) {
    const res = await handleUserAction(
      req,
      method,
      decodeURIComponent(userActionMatch[1]),
      userActionMatch[2] || '',
      ctx,
      env
    )
    if (res) return res
  }

  if (method === 'PUT' && path === '/api/admin/settings') {
    return putAdminSettings(req, ctx, env)
  }

  if (method === 'POST' && path === '/api/admin/invites') {
    return postCreateInvite(req, url, ctx, env)
  }

  const inviteMatch = path.match(/^\/api\/admin\/invites\/([^/]+)(?:\/([^/]+))?$/)
  if (inviteMatch) {
    const res = await handleInviteAction(
      method,
      decodeURIComponent(inviteMatch[1]),
      inviteMatch[2] || '',
      ctx,
      env
    )
    if (res) return res
  }

  if (method === 'GET' && path === '/api/admin/tickets') {
    return getAdminTickets(env)
  }

  const adminTicketMatch = path.match(/^\/api\/admin\/tickets\/([^/]+)\/(reply|status)$/)
  if (method === 'POST' && adminTicketMatch) {
    const res = await handleAdminTicketAction(
      req,
      decodeURIComponent(adminTicketMatch[1]),
      adminTicketMatch[2],
      ctx,
      env
    )
    if (res) return res
  }

  return null
}

