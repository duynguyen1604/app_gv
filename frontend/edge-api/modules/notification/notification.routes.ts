import type { Env } from '../../types/index'
import { sendTestEmail, triggerDailyEmailCron } from './notification.controller'

export async function handleNotificationRoutes(
  req: Request,
  method: string,
  path: string,
  url: URL,
  env: Env
): Promise<Response | null> {
  if (method === 'POST' && path === '/api/email/test') {
    return sendTestEmail(req, env)
  }

  if ((method === 'GET' || method === 'POST') && path === '/api/cron/daily-email') {
    return triggerDailyEmailCron(req, url, env)
  }

  return null
}

