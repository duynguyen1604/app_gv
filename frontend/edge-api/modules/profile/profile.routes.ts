import type { Env } from '../../types/index'
import {
  getMyProfile,
  postChangePassword,
  postDeleteAccount,
  postOnboardingComplete,
  postRevokeOtherSessions,
  updateMyProfile,
} from './profile.controller'

export async function handleProfileRoutes(
  req: Request,
  method: string,
  path: string,
  env: Env
): Promise<Response | null> {
  if (!path.startsWith('/api/profile')) return null

  if (method === 'GET' && path === '/api/profile/me') {
    return getMyProfile(req, env)
  }
  if (method === 'PUT' && path === '/api/profile/me') {
    return updateMyProfile(req, env)
  }
  if (method === 'POST' && path === '/api/profile/onboarding-complete') {
    return postOnboardingComplete(req, env)
  }
  if (method === 'POST' && path === '/api/profile/change-password') {
    return postChangePassword(req, env)
  }
  if (method === 'POST' && path === '/api/profile/revoke-other-sessions') {
    return postRevokeOtherSessions(req, env)
  }
  if (method === 'POST' && path === '/api/profile/delete-account') {
    return postDeleteAccount(req, env)
  }

  return null
}

