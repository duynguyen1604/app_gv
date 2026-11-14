import type { AuthSessionRecord, AuthStoreData, Env, StoredUser } from '../types/index'
import { getAuthenticatedUser, loadAuthStore } from '../shared/auth-store.service'
import { jsonResponse } from './cors.middleware'

export interface AuthContext {
  store: AuthStoreData
  user: StoredUser
  tokenHash: string
  session: AuthSessionRecord
}

export async function requireAuth(
  req: Request,
  env: Env,
  errorMessage = 'Vui lòng đăng nhập.'
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; response: Response }> {
  const store = await loadAuthStore(env)
  const auth = await getAuthenticatedUser(req, store)
  if (!auth) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: errorMessage }, 401),
    }
  }
  return {
    ok: true,
    ctx: {
      store,
      user: auth.user,
      tokenHash: auth.tokenHash,
      session: auth.session,
    },
  }
}

export async function requireAdmin(
  req: Request,
  env: Env
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; response: Response }> {
  const store = await loadAuthStore(env)
  const auth = await getAuthenticatedUser(req, store)
  if (!auth || auth.user.role !== 'admin') {
    return {
      ok: false,
      response: jsonResponse(
        { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập.' },
        403
      ),
    }
  }
  return {
    ok: true,
    ctx: {
      store,
      user: auth.user,
      tokenHash: auth.tokenHash,
      session: auth.session,
    },
  }
}

