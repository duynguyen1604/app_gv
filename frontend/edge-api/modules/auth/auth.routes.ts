import type { Env } from '../../types/index'
import {
  forgotPassword,
  getAuthMe,
  getGoogleAuthUrl,
  getPublicConfig,
  handleGoogleCallback,
  handleGoogleRedirectComplete,
  loginWithPassword,
  logoutAuthSession,
  notifyAdminPending,
  refreshAuthSession,
  registerAccount,
  resendVerification,
  resetPassword,
  verifyEmail,
} from './auth.controller'

export async function handleAuthRoutes(
  req: Request,
  method: string,
  path: string,
  url: URL,
  env: Env
): Promise<Response | null> {
  if (!path.startsWith('/api/auth')) return null

  if (method === 'GET' && path === '/api/auth/public-config') {
    return getPublicConfig(env)
  }
  if (method === 'GET' && path === '/api/auth/google/url') {
    return getGoogleAuthUrl(url, env)
  }
  if (method === 'GET' && path === '/api/auth/google/callback') {
    return handleGoogleCallback(req, url, env)
  }
  if (
    method === 'POST' &&
    (path === '/api/auth/google/redirect-complete' || path === '/api/auth/sync-supabase')
  ) {
    return handleGoogleRedirectComplete(req, env)
  }
  if (method === 'POST' && path === '/api/auth/login') {
    return loginWithPassword(req, env)
  }
  if (method === 'POST' && path === '/api/auth/register') {
    return registerAccount(req, url, env)
  }
  if (method === 'GET' && path === '/api/auth/me') {
    return getAuthMe(req, env)
  }
  if (method === 'POST' && path === '/api/auth/refresh') {
    return refreshAuthSession(req, env)
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    return logoutAuthSession(req, env)
  }
  if (method === 'POST' && path === '/api/auth/verify-email') {
    return verifyEmail(req, env)
  }
  if (method === 'POST' && path === '/api/auth/resend-verification') {
    return resendVerification()
  }
  if (method === 'POST' && path === '/api/auth/notify-admin') {
    return notifyAdminPending()
  }
  if (method === 'POST' && path === '/api/auth/forgot-password') {
    return forgotPassword(req, url, env)
  }
  if (method === 'POST' && path === '/api/auth/reset-password') {
    return resetPassword(req, env)
  }

  return null
}

