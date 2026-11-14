import type { Env, InviteRecord } from '../../types/index'
import { jsonResponse, readJsonBody } from '../../middleware/cors.middleware'
import {
  appendAuditLog,
  createSession,
  extractBearerToken,
  getAuthenticatedUser,
  loadAuthStore,
  normalizeEmail,
  saveAuthStore,
  toPublicProfile,
  validatePasswordStrength,
} from '../../shared/auth-store.service'
import {
  generateId,
  hashPassword,
  randomHex,
  sha256Hex,
  verifyPassword,
} from '../../shared/crypto.util'
import { registerEmailAccount, upsertGoogleUserAndSession } from './auth.service'

export async function getPublicConfig(env: Env): Promise<Response> {
  const store = await loadAuthStore(env)
  return jsonResponse({
    registration_mode: store.appSettings.registration_mode,
    google_login_enabled: store.appSettings.google_login_enabled,
    password_login_enabled: store.appSettings.password_login_enabled,
    supabase_configured: false,
    google_oauth_configured: Boolean(env.GOOGLE_CLIENT_ID),
    turnstile_site_key: null,
  })
}

export function getGoogleAuthUrl(url: URL, env: Env): Response {
  const returnTo = url.searchParams.get('returnTo') || '/'
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim()
  const redirectUri =
    (env.GOOGLE_AUTH_REDIRECT_URI || '').trim() || `${url.origin}/api/auth/google/callback`

  if (!clientId) {
    const fallbackRedirectUrl = `${url.origin}/auth/callback?mode=google_redirect_select&returnTo=${encodeURIComponent(
      returnTo
    )}`
    return jsonResponse({
      oauthConfigured: false,
      redirectUrl: fallbackRedirectUrl,
    })
  }

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleUrl.searchParams.set('client_id', clientId)
  googleUrl.searchParams.set('redirect_uri', redirectUri)
  googleUrl.searchParams.set('response_type', 'code')
  googleUrl.searchParams.set('scope', 'openid email profile')
  googleUrl.searchParams.set('prompt', 'select_account')
  googleUrl.searchParams.set('state', btoa(JSON.stringify({ returnTo })))

  return jsonResponse({
    oauthConfigured: true,
    redirectUrl: googleUrl.toString(),
  })
}

export async function handleGoogleCallback(req: Request, url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code') || ''
  const rawState = url.searchParams.get('state') || ''
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim()
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim()
  const redirectUri =
    (env.GOOGLE_AUTH_REDIRECT_URI || '').trim() || `${url.origin}/api/auth/google/callback`

  let returnTo = '/'
  if (rawState) {
    try {
      const parsed = JSON.parse(atob(rawState)) as { returnTo?: string }
      if (parsed.returnTo) returnTo = parsed.returnTo
    } catch {
      // ignore
    }
  }

  if (!code || !clientId || !clientSecret) {
    return Response.redirect(
      `${url.origin}/auth/login?error=${encodeURIComponent(
        'Không thể hoàn tất đăng nhập với Google.'
      )}`,
      302
    )
  }

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenResp.ok) {
      throw new Error('Không thể đổi mã xác thực Google.')
    }
    const tokenData = (await tokenResp.json()) as { access_token: string }
    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!userResp.ok) {
      throw new Error('Không thể lấy thông tin tài khoản Google.')
    }
    const googleUser = (await userResp.json()) as {
      email?: string
      name?: string
      picture?: string
    }

    const email = normalizeEmail(googleUser.email || '')
    if (!email) throw new Error('Không lấy được địa chỉ email từ Google.')

    const { sessionToken, expiresAt, linkedExisting } = await upsertGoogleUserAndSession({
      env,
      email,
      fullName: googleUser.name || email.split('@')[0],
      avatarUrl: googleUser.picture || null,
      userAgent: req.headers.get('user-agent') || undefined,
      auditDetailMessage: 'Đăng nhập bằng Google OAuth',
    })

    return Response.redirect(
      `${url.origin}/auth/callback?token=${encodeURIComponent(
        sessionToken
      )}&expiresAt=${expiresAt}&linked=${
        linkedExisting ? '1' : '0'
      }&returnTo=${encodeURIComponent(returnTo)}`,
      302
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đăng nhập Google'
    return Response.redirect(
      `${url.origin}/auth/login?error=${encodeURIComponent(msg)}`,
      302
    )
  }
}

export async function handleGoogleRedirectComplete(req: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const meta = body.userMetadata || body
  const email = normalizeEmail(meta.email || '')
  const fullName = String(meta.fullName || meta.full_name || email.split('@')[0] || '').trim()

  if (!email) {
    return jsonResponse(
      { success: false, error: 'Vui lòng nhập địa chỉ email Google.' },
      400
    )
  }

  const { user, sessionToken, expiresAt, linkedExisting } = await upsertGoogleUserAndSession({
    env,
    email,
    fullName,
    userAgent: req.headers.get('user-agent') || undefined,
    auditDetailMessage: 'Đăng nhập qua Google Redirect',
  })

  return jsonResponse({
    success: true,
    profile: toPublicProfile(user),
    sessionToken,
    expiresAt,
    linkedExisting,
  })
}

export async function loginWithPassword(req: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const email = normalizeEmail(body.email || '')
  const password = String(body.password || '')
  const rememberMe =
    body.rememberMe !== undefined ? Boolean(body.rememberMe) : body.remember_me !== false

  if (!email || !password) {
    return jsonResponse(
      { success: false, error: 'Email hoặc mật khẩu không đúng' },
      400
    )
  }

  const store = await loadAuthStore(env)
  const user = store.users.find((u) => normalizeEmail(u.email) === email)

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return jsonResponse(
      { success: false, error: 'Email hoặc mật khẩu không đúng' },
      401
    )
  }

  if (!user.email_verified) {
    return jsonResponse(
      {
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
        error: 'Vui lòng xác minh địa chỉ email trước khi đăng nhập.',
      },
      403
    )
  }

  user.last_login_at = new Date().toISOString()
  const { sessionToken, expiresAt } = await createSession(
    store,
    user.id,
    rememberMe,
    req.headers.get('user-agent') || undefined
  )
  appendAuditLog(store, {
    actor_id: user.id,
    actor_email: user.email,
    action: 'login_success',
    target_email: user.email,
    detail: { message: 'Đăng nhập bằng Email & Mật khẩu' },
  })
  await saveAuthStore(env, store)

  const profile = toPublicProfile(user)
  return jsonResponse({
    success: true,
    profile,
    sessionToken,
    expiresAt,
    // Cũng trả kèm snake_case để tương thích ngược
    session_token: sessionToken,
    expires_at: expiresAt,
  })
}

export async function registerAccount(req: Request, url: URL, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const email = normalizeEmail(body.email || '')
  const password = String(body.password || '')
  const fullName = String(body.full_name || '').trim()
  const inviteCode = String(body.invite_code || '').trim().toUpperCase()

  if (!email || !fullName) {
    return jsonResponse(
      { success: false, error: 'Vui lòng nhập đầy đủ Họ tên và Email.' },
      400
    )
  }
  const pwErr = validatePasswordStrength(password)
  if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)

  const store = await loadAuthStore(env)
  if (store.users.some((u) => normalizeEmail(u.email) === email)) {
    return jsonResponse(
      { success: false, error: 'Email này đã được đăng ký trong hệ thống.' },
      409
    )
  }

  let matchedInvite: InviteRecord | undefined
  if (inviteCode) {
    matchedInvite = store.invites.find(
      (inv) =>
        inv.code.toUpperCase() === inviteCode &&
        !inv.revoked &&
        inv.used_count < inv.max_uses &&
        (!inv.expires_at || new Date(inv.expires_at).getTime() > Date.now())
    )
    if (!matchedInvite) {
      return jsonResponse(
        { success: false, error: 'Mã mời không hợp lệ hoặc đã hết hạn.' },
        400
      )
    }
  } else if (store.appSettings.registration_mode === 'invite_only') {
    return jsonResponse(
      {
        success: false,
        error: 'Hệ thống hiện chỉ cho phép đăng ký khi có Mã mời từ Admin.',
      },
      403
    )
  }

  const res = await registerEmailAccount({
    env,
    store,
    email,
    password,
    fullName,
    phone: body.phone ? String(body.phone).trim() : null,
    school: body.school ? String(body.school).trim() : null,
    matchedInvite,
    origin: url.origin,
  })

  return jsonResponse({
    success: true,
    email: res.email,
    devVerifyUrl: res.devVerifyUrl,
    message:
      res.initialStatus === 'active'
        ? 'Đăng ký thành công! Bạn có thể đăng nhập ngay.'
        : 'Đăng ký thành công! Tài khoản đang chờ Quản trị viên phê duyệt.',
  })
}

export async function getAuthMe(req: Request, env: Env): Promise<Response> {
  const store = await loadAuthStore(env)
  const auth = await getAuthenticatedUser(req, store)
  if (!auth) {
    return jsonResponse(
      { authenticated: false, profile: null, error: 'Phiên đăng nhập đã hết hạn.' },
      401
    )
  }
  return jsonResponse({
    authenticated: true,
    profile: toPublicProfile(auth.user),
  })
}

export async function refreshAuthSession(req: Request, env: Env): Promise<Response> {
  const store = await loadAuthStore(env)
  const auth = await getAuthenticatedUser(req, store)
  if (!auth) {
    return jsonResponse(
      { success: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' },
      401
    )
  }
  const days = auth.session.remember_me ? 90 : 2
  auth.session.expires_at = Date.now() + days * 24 * 60 * 60 * 1000
  const rawToken = extractBearerToken(req) || ''
  await saveAuthStore(env, store)
  return jsonResponse({
    success: true,
    profile: toPublicProfile(auth.user),
    sessionToken: rawToken,
    expiresAt: auth.session.expires_at,
  })
}

export async function logoutAuthSession(req: Request, env: Env): Promise<Response> {
  const store = await loadAuthStore(env)
  const auth = await getAuthenticatedUser(req, store)
  if (auth) {
    store.sessions = store.sessions.filter((s) => s.token_hash !== auth.tokenHash)
    await saveAuthStore(env, store)
  }
  return jsonResponse({ success: true })
}

export async function verifyEmail(req: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const email = normalizeEmail(body.email || '')
  const store = await loadAuthStore(env)
  const user = store.users.find((u) => normalizeEmail(u.email) === email) || store.users[0]
  if (!user) {
    return jsonResponse({ success: false, error: 'Không tìm thấy tài khoản.' }, 404)
  }
  user.email_verified = true
  const { sessionToken, expiresAt } = await createSession(store, user.id, true)
  await saveAuthStore(env, store)
  return jsonResponse({
    success: true,
    profile: toPublicProfile(user),
    sessionToken,
    expiresAt,
    message: 'Xác minh email thành công!',
  })
}

export function resendVerification(): Response {
  return jsonResponse({
    success: true,
    message: 'Tài khoản đã được xác minh sẵn sàng.',
  })
}

export function notifyAdminPending(): Response {
  return jsonResponse({
    success: true,
    message: 'Đã gửi thông báo nhắc Quản trị viên phê duyệt tài khoản của bạn.',
  })
}

export async function forgotPassword(req: Request, url: URL, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const email = normalizeEmail(body.email || '')
  const store = await loadAuthStore(env)
  const user = store.users.find((u) => normalizeEmail(u.email) === email)
  if (!user) {
    return jsonResponse({
      success: true,
      message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được tạo.',
    })
  }
  const rawToken = randomHex(20)
  const tokenHash = await sha256Hex(rawToken)
  store.tokens.push({
    id: generateId('tok'),
    token_hash: tokenHash,
    user_id: user.id,
    email: user.email,
    purpose: 'reset_password',
    created_at: new Date().toISOString(),
    expires_at: Date.now() + 30 * 60 * 1000,
  })
  await saveAuthStore(env, store)
  const devResetUrl = `${url.origin}/auth/reset-password?email=${encodeURIComponent(
    user.email
  )}&token=${rawToken}`
  return jsonResponse({
    success: true,
    message: 'Đã tạo liên kết đặt lại mật khẩu.',
    devResetUrl,
  })
}

export async function resetPassword(req: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const rawToken = String(body.token || '').trim()
  const newPassword = String(body.newPassword || body.new_password || '')
  const pwErr = validatePasswordStrength(newPassword)
  if (pwErr) return jsonResponse({ success: false, error: pwErr }, 400)

  const store = await loadAuthStore(env)
  const tokenHash = await sha256Hex(rawToken)
  const tok = store.tokens.find(
    (t) =>
      t.token_hash === tokenHash &&
      t.purpose === 'reset_password' &&
      !t.used_at &&
      t.expires_at > Date.now()
  )
  if (!tok) {
    return jsonResponse(
      { success: false, error: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' },
      400
    )
  }
  const user = store.users.find((u) => u.id === tok.user_id)
  if (!user) return jsonResponse({ success: false, error: 'Không tìm thấy người dùng.' }, 404)

  user.password_hash = await hashPassword(newPassword)
  tok.used_at = new Date().toISOString()
  await saveAuthStore(env, store)
  return jsonResponse({
    success: true,
    message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay.',
  })
}

