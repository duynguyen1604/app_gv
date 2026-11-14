// ============================================================================
// CLOUDFLARE PAGES FUNCTIONS & WORKERS EDGE API (/api/*)
// Entrypoint & Router tổng — toàn bộ logic được tách theo module trong ../../edge-api/
// ============================================================================

import type { D1Database, D1PreparedStatement, Env, PagesContext } from '../../edge-api/types/index'
import { handleCorsPreflight, jsonResponse } from '../../edge-api/middleware/cors.middleware'
import { handleHealthRoutes } from '../../edge-api/modules/health/health.routes'
import { handleAuthRoutes } from '../../edge-api/modules/auth/auth.routes'
import { handleProfileRoutes } from '../../edge-api/modules/profile/profile.routes'
import { handleAdminRoutes } from '../../edge-api/modules/admin/admin.routes'
import { handleSupportRoutes } from '../../edge-api/modules/support/support.routes'
import { handleSyncRoutes } from '../../edge-api/modules/sync/sync.routes'
import { handleNotificationRoutes } from '../../edge-api/modules/notification/notification.routes'
import { handleAiRoutes } from '../../edge-api/modules/ai/ai.routes'
import { handleGcalRoutes } from '../../edge-api/modules/gcal/gcal.routes'

export type { D1PreparedStatement, D1Database, Env, PagesContext }

export async function handleApiRequest(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight()
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = req.method.toUpperCase()

  try {
    const healthRes = await handleHealthRoutes(method, path, env)
    if (healthRes) return healthRes

    const authRes = await handleAuthRoutes(req, method, path, url, env)
    if (authRes) return authRes

    const profileRes = await handleProfileRoutes(req, method, path, env)
    if (profileRes) return profileRes

    const adminRes = await handleAdminRoutes(req, method, path, url, env)
    if (adminRes) return adminRes

    const supportRes = await handleSupportRoutes(req, method, path, env)
    if (supportRes) return supportRes

    const syncRes = await handleSyncRoutes(req, method, path, url, env)
    if (syncRes) return syncRes

    const notificationRes = await handleNotificationRoutes(req, method, path, url, env)
    if (notificationRes) return notificationRes

    const aiRes = await handleAiRoutes(req, method, path, env)
    if (aiRes) return aiRes

    const gcalRes = handleGcalRoutes(method, path)
    if (gcalRes) return gcalRes

    return jsonResponse({ error: `Không tìm thấy API endpoint: ${method} ${path}` }, 404)
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Lỗi xử lý tại Cloudflare Edge',
      },
      500
    )
  }
}

// Cloudflare Pages Functions entrypoint (`functions/api/[[route]].ts`)
export const onRequest = async (context: PagesContext): Promise<Response> => {
  return handleApiRequest(context.request, context.env || {})
}

// Cloudflare Standalone Worker entrypoint (`export default { fetch }`)
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleApiRequest(request, env || {})
  },
}
