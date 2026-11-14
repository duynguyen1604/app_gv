import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { startCronJobs } from './cron.js'
import { sendScheduleEmail, buildScheduleEmailHtml } from './mailer.js'
import { ensureSchema, waitForDatabase } from './schema.js'
import { pullUserState, pushUserState, type SyncPayload } from './sync.js'
import { buildSchoolImagePrompt, buildZaloPrompt, callGeminiJson } from './gemini.js'
import {
  connectUserGoogleCalendar,
  syncUserGoogleCalendar,
  clearAllSyncedGCalEvents,
  disconnectUserGoogleCalendar,
  buildUserIcsFeed,
} from './gcal.js'
import {
  getPublicAuthConfig,
  registerAccount,
  verifyEmailToken,
  resendVerificationEmail,
  loginWithPassword,
  loginOrLinkGoogleAccount,
  syncSupabaseUserSession,
  authenticateRequest,
  notifyAdminFromPendingTeacher,
  signSessionToken,
  recordAuditLog,
  requestPasswordReset,
  resetPasswordWithToken,
  updateMyProfile,
  completeMyOnboarding,
  getMyAccountSecuritySummary,
  changeMyPassword,
  revokeOtherSessions,
  deleteMyTeacherAccount,
  getAdminDashboardOverview,
  adminApproveUser,
  adminBulkApproveUsers,
  adminLockUser,
  adminUnlockUser,
  adminResetUserPassword,
  adminCreateTeacherAccount,
  adminDeleteTeacherAccount,
  adminUpdateAppSettings,
  adminCreateInvite,
  adminRevokeOrDeleteInvite,
} from './auth.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 4000)

app.use(cors())
app.use(express.json({ limit: '15mb' }))

function userIdFrom(req: express.Request): string {
  const authCheck = authenticateRequest(req)
  if (authCheck.authenticated && authCheck.profile) {
    return authCheck.profile.id
  }
  const fromQuery = req.query.user_id
  const fromBody = req.body?.user_id
  const fromHeader = req.header('x-user-id')
  return String(fromBody || fromQuery || fromHeader || 'local')
}

// ==========================================
// AUTHENTICATION & PROFILE ENDPOINTS (BƯỚC 1)
// ==========================================

app.get('/api/auth/public-config', (_req, res) => {
  res.json(getPublicAuthConfig())
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await registerAccount({
      fullName: req.body?.full_name || req.body?.fullName,
      email: req.body?.email,
      password: req.body?.password,
      school: req.body?.school,
      phone: req.body?.phone,
      inviteCode: req.body?.invite_code || req.body?.inviteCode,
      agreedToTerms: Boolean(req.body?.agreed_to_terms ?? req.body?.agreedToTerms),
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đăng ký tài khoản.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const result = await verifyEmailToken({
      email: req.body?.email,
      token: req.body?.token,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Xác minh email thất bại.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const result = await resendVerificationEmail({
      email: req.body?.email,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể gửi lại thư xác minh.'
    res.status(429).json({ success: false, error: message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await loginWithPassword({
      email: req.body?.email,
      password: req.body?.password,
      rememberMe: req.body?.rememberMe !== false,
      req,
    })
    if (!result.success && result.code === 'EMAIL_NOT_VERIFIED') {
      return res.status(403).json(result)
    }
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Email hoặc mật khẩu không đúng'
    res.status(401).json({ success: false, error: message })
  }
})

app.post('/api/auth/sync-supabase', async (req, res) => {
  try {
    const result = await syncSupabaseUserSession({
      supabaseAccessToken: req.body?.accessToken || '',
      userMetadata: req.body?.userMetadata,
      req,
    })
    res.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đồng bộ phiên đăng nhập.'
    res.status(401).json({ success: false, error: message })
  }
})

app.get('/api/auth/me', (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated) {
    const status = check.errorCode === 'ACCOUNT_LOCKED' ? 403 : 401
    return res.status(status).json({
      authenticated: false,
      profile: check.profile,
      errorCode: check.errorCode,
      error: check.errorMessage,
    })
  }
  res.json({
    authenticated: true,
    profile: check.profile,
  })
})

app.post('/api/auth/refresh', (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile || !check.tokenPayload) {
    const status = check.errorCode === 'ACCOUNT_LOCKED' ? 403 : 401
    return res.status(status).json({
      success: false,
      errorCode: check.errorCode,
      error: check.errorMessage,
    })
  }

  const refreshed = signSessionToken({
    userId: check.profile.id,
    email: check.profile.email,
    tokenVersion: check.tokenPayload.ver,
    rememberMe: check.tokenPayload.rem,
  })

  res.json({
    success: true,
    profile: check.profile,
    sessionToken: refreshed.token,
    expiresAt: refreshed.expiresAt,
  })
})

app.post('/api/auth/notify-admin', async (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại.' })
  }
  try {
    const result = await notifyAdminFromPendingTeacher({
      profile: check.profile,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể gửi thông báo.'
    res.status(429).json({ success: false, error: message })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  const check = authenticateRequest(req)
  if (check.profile) {
    await recordAuditLog({
      actorId: check.profile.id,
      targetId: check.profile.id,
      action: 'logout',
      req,
    })
  }
  res.json({ success: true })
})

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const result = await requestPasswordReset({
      email: req.body?.email,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể xử lý yêu cầu đặt lại mật khẩu.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const result = await resetPasswordWithToken({
      email: req.body?.email,
      token: req.body?.token,
      newPassword: req.body?.newPassword || req.body?.password,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.'
    res.status(400).json({ success: false, error: message })
  }
})

// ==========================================
// PROFILE & SECURITY ENDPOINTS (ADMIN & TEACHER)
// ==========================================

app.get('/api/profile/me', (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại.' })
  }
  const security = getMyAccountSecuritySummary(check.profile.id)
  res.json({
    success: true,
    profile: check.profile,
    security,
  })
})

app.put('/api/profile/me', async (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại.' })
  }
  try {
    const result = await updateMyProfile({
      userId: check.profile.id,
      fullName: req.body?.full_name ?? req.body?.fullName,
      phone: req.body?.phone,
      school: req.body?.school,
      avatarUrl: req.body?.avatar_url ?? req.body?.avatarUrl,
      onboardingCompleted:
        typeof req.body?.onboarding_completed === 'boolean'
          ? req.body.onboarding_completed
          : typeof req.body?.onboardingCompleted === 'boolean'
            ? req.body.onboardingCompleted
            : undefined,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/profile/onboarding-complete', async (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại.' })
  }
  try {
    const result = await completeMyOnboarding({
      userId: check.profile.id,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể lưu trạng thái hướng dẫn.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/profile/change-password', async (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại.' })
  }
  try {
    const result = await changeMyPassword({
      userId: check.profile.id,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
      rememberMe: check.tokenPayload?.rem !== false,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đổi mật khẩu.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/profile/revoke-other-sessions', async (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại.' })
  }
  try {
    const result = await revokeOtherSessions({
      userId: check.profile.id,
      rememberMe: check.tokenPayload?.rem !== false,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể thu hồi phiên khác.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/profile/delete-account', async (req, res) => {
  const check = authenticateRequest(req)
  if (!check.authenticated || !check.profile) {
    return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại.' })
  }
  try {
    const result = await deleteMyTeacherAccount({
      userId: check.profile.id,
      password: req.body?.password,
      confirmText: req.body?.confirmText,
      req,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể xóa tài khoản.'
    res.status(400).json({ success: false, error: message })
  }
})

// ==========================================
// ADMIN CONSOLE ENDPOINTS (SERVER ADMIN_EMAIL ONLY)
// ==========================================

app.get('/api/admin/overview', (req, res) => {
  try {
    const data = getAdminDashboardOverview(req)
    res.json({ success: true, ...data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không có quyền truy cập trang Quản trị.'
    res.status(403).json({ success: false, error: message })
  }
})

app.post('/api/admin/users/approve-bulk', async (req, res) => {
  try {
    const result = await adminBulkApproveUsers({
      req,
      userIds: Array.isArray(req.body?.userIds) ? req.body.userIds : undefined,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể duyệt hàng loạt.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/admin/users/create', async (req, res) => {
  try {
    const result = await adminCreateTeacherAccount({
      req,
      fullName: req.body?.full_name || req.body?.fullName,
      email: req.body?.email,
      password: req.body?.password,
      school: req.body?.school,
      phone: req.body?.phone,
      status: req.body?.status,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể tạo tài khoản giáo viên.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/admin/users/:id/approve', async (req, res) => {
  try {
    const result = await adminApproveUser({
      req,
      targetUserId: req.params.id,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể duyệt tài khoản.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/admin/users/:id/lock', async (req, res) => {
  try {
    const result = await adminLockUser({
      req,
      targetUserId: req.params.id,
      reason: req.body?.reason,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể khóa tài khoản.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/admin/users/:id/unlock', async (req, res) => {
  try {
    const result = await adminUnlockUser({
      req,
      targetUserId: req.params.id,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể mở khóa tài khoản.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/admin/users/:id/reset-password', async (req, res) => {
  try {
    const result = await adminResetUserPassword({
      req,
      targetUserId: req.params.id,
      temporaryPassword: req.body?.temporaryPassword,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.'
    res.status(400).json({ success: false, error: message })
  }
})

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const result = await adminDeleteTeacherAccount({
      req,
      targetUserId: req.params.id,
      reason: req.body?.reason || String(req.query.reason || ''),
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể xóa tài khoản.'
    res.status(400).json({ success: false, error: message })
  }
})

app.put('/api/admin/settings', async (req, res) => {
  try {
    const result = await adminUpdateAppSettings({
      req,
      registration_mode: req.body?.registration_mode,
      google_login_enabled: req.body?.google_login_enabled,
      password_login_enabled: req.body?.password_login_enabled,
      notify_admin_email: req.body?.notify_admin_email,
      max_accounts: req.body?.max_accounts,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể cập nhật cài đặt hệ thống.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/admin/invites', async (req, res) => {
  try {
    const result = await adminCreateInvite({
      req,
      email: req.body?.email,
      customCode: req.body?.customCode,
      maxUses: req.body?.maxUses,
      expiresInDays: req.body?.expiresInDays,
      sendEmailNow: req.body?.sendEmailNow,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể tạo mã mời.'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/admin/invites/:id/revoke', async (req, res) => {
  try {
    const result = await adminRevokeOrDeleteInvite({
      req,
      inviteId: req.params.id,
      deletePermanently: false,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể thu hồi mã mời.'
    res.status(400).json({ success: false, error: message })
  }
})

app.delete('/api/admin/invites/:id', async (req, res) => {
  try {
    const result = await adminRevokeOrDeleteInvite({
      req,
      inviteId: req.params.id,
      deletePermanently: true,
    })
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể xóa mã mời.'
    res.status(400).json({ success: false, error: message })
  }
})

// Google OAuth Redirect Flow (Section 3.1 & 4.2: NEVER uses popup, always redirect!)
app.get('/api/auth/google/url', (req, res) => {
  const returnTo = String(req.query.returnTo || '/')
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri =
    process.env.GOOGLE_AUTH_REDIRECT_URI ||
    `http://localhost:${PORT}/api/auth/google/callback`

  if (!clientId) {
    // Full-page redirect flow to the local Google OAuth Redirect Chooser screen (no popup!)
    const fallbackRedirectUrl = `${frontendUrl}/auth/callback?mode=google_redirect_select&returnTo=${encodeURIComponent(
      returnTo
    )}`
    return res.json({
      oauthConfigured: false,
      redirectUrl: fallbackRedirectUrl,
    })
  }

  const scopes = ['openid', 'email', 'profile']
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('prompt', 'select_account')
  url.searchParams.set('state', Buffer.from(JSON.stringify({ returnTo })).toString('base64url'))

  res.json({
    oauthConfigured: true,
    redirectUrl: url.toString(),
  })
})

app.get('/api/auth/google/callback', async (req, res) => {
  const code = String(req.query.code || '')
  const rawState = String(req.query.state || '')
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_AUTH_REDIRECT_URI ||
    `http://localhost:${PORT}/api/auth/google/callback`

  let returnTo = '/'
  if (rawState) {
    try {
      const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8')) as {
        returnTo?: string
      }
      if (parsed.returnTo) returnTo = parsed.returnTo
    } catch {
      // ignore invalid state
    }
  }

  if (!code || !clientId || !clientSecret) {
    return res.redirect(
      `${frontendUrl}/auth/login?error=${encodeURIComponent(
        'Không thể hoàn tất đăng nhập với Google.'
      )}`
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

    const result = await loginOrLinkGoogleAccount({
      email: googleUser.email || '',
      fullName: googleUser.name || '',
      avatarUrl: googleUser.picture || null,
      req,
    })

    return res.redirect(
      `${frontendUrl}/auth/callback?token=${encodeURIComponent(
        result.sessionToken
      )}&expiresAt=${result.expiresAt}&linked=${result.linkedExisting ? '1' : '0'}&returnTo=${encodeURIComponent(
        returnTo
      )}`
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi đăng nhập Google'
    return res.redirect(
      `${frontendUrl}/auth/login?error=${encodeURIComponent(message)}`
    )
  }
})

app.post('/api/auth/google/redirect-complete', async (req, res) => {
  try {
    const result = await loginOrLinkGoogleAccount({
      email: req.body?.email,
      fullName: req.body?.fullName,
      avatarUrl: req.body?.avatarUrl || null,
      req,
    })
    res.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đăng nhập bằng Google.'
    res.status(400).json({ success: false, error: message })
  }
})

app.get('/api/health', async (_req, res) => {
  try {
    const { default: pool } = await import('./db.js')
    const dbRes = await pool.query('SELECT NOW() as now')
    res.json({
      status: 'ok',
      service: 'Teacher Schedule Manager Backend',
      timestamp: dbRes.rows[0].now,
      timezone: 'Asia/Ho_Chi_Minh',
      database: 'connected',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ status: 'error', database: message })
  }
})

app.get('/api/sync', async (req, res) => {
  const userId = userIdFrom(req)
  try {
    const state = await pullUserState(userId)
    res.json(state)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.put('/api/sync', async (req, res) => {
  const userId = userIdFrom(req)
  const payload = req.body as SyncPayload
  try {
    await pushUserState(userId, payload)
    const state = await pullUserState(userId)
    res.json({ success: true, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/sync', async (req, res) => {
  const userId = userIdFrom(req)
  const payload = req.body as SyncPayload
  try {
    await pushUserState(userId, payload)
    const state = await pullUserState(userId)
    res.json({ success: true, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

// ==========================================
// GOOGLE CALENDAR ONE-WAY SYNC ENDPOINTS (Mục 2.10)
// ==========================================

app.get('/api/gcal/auth-url', (req, res) => {
  const userId = userIdFrom(req)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/gcal/callback`

  if (!clientId) {
    return res.json({
      oauthConfigured: false,
      authUrl: null,
      message:
        'Chế độ kết nối trực tiếp / Token OAuth (chưa cấu hình GOOGLE_CLIENT_ID trong .env).',
    })
  }

  // Minimal scope: calendar.app.created allows creating & managing secondary calendar "Lịch dạy" created by the app
  const scopes = [
    'https://www.googleapis.com/auth/calendar.app.created',
    'https://www.googleapis.com/auth/userinfo.email',
  ]
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', userId)

  res.json({
    oauthConfigured: true,
    authUrl: url.toString(),
  })
})

app.get('/api/gcal/callback', async (req, res) => {
  const code = String(req.query.code || '')
  const userId = String(req.query.state || 'local')
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/gcal/callback`
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  if (!code || !clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/settings?gcal=error`)
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
      throw new Error(`OAuth code exchange failed (${tokenResp.status})`)
    }

    const tokenData = (await tokenResp.json()) as {
      access_token: string
      refresh_token?: string
    }

    let email = ''
    try {
      const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      if (userResp.ok) {
        const u = (await userResp.json()) as { email?: string }
        email = u.email || ''
      }
    } catch {
      // ignore email lookup failure
    }

    await connectUserGoogleCalendar(userId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      accountEmail: email || 'giaovien@gmail.com',
    })

    return res.redirect(`${frontendUrl}/settings?gcal=connected`)
  } catch (err) {
    console.error('[GCAL] OAuth callback error:', err)
    return res.redirect(`${frontendUrl}/settings?gcal=error`)
  }
})

app.post('/api/gcal/connect', async (req, res) => {
  const userId = userIdFrom(req)
  const { accessToken, refreshToken, accountEmail, payload } = req.body || {}
  try {
    if (payload) {
      await pushUserState(userId, payload as SyncPayload)
    }
    const result = await connectUserGoogleCalendar(userId, {
      accessToken,
      refreshToken,
      accountEmail,
    })
    const state = await pullUserState(userId)
    res.json({ success: true, result, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/gcal/sync-now', async (req, res) => {
  const userId = userIdFrom(req)
  const { payload } = req.body || {}
  try {
    if (payload) {
      await pushUserState(userId, payload as SyncPayload)
    }
    const result = await syncUserGoogleCalendar(userId, { forceEvenIfDisabled: true })
    const state = await pullUserState(userId)
    res.json({ success: true, result, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/gcal/clear-events', async (req, res) => {
  const userId = userIdFrom(req)
  try {
    const result = await clearAllSyncedGCalEvents(userId)
    const state = await pullUserState(userId)
    res.json({ success: true, result, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/gcal/disconnect', async (req, res) => {
  const userId = userIdFrom(req)
  try {
    await disconnectUserGoogleCalendar(userId)
    const state = await pullUserState(userId)
    res.json({ success: true, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.get('/api/gcal/feed.ics', async (req, res) => {
  const userId = userIdFrom(req)
  try {
    const icsContent = await buildUserIcsFeed(userId)
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="lich-day.ics"')
    res.send(icsContent)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).send(`Error generating ICS feed: ${message}`)
  }
})

// ==========================================
// EMAIL & GEMINI AI ENDPOINTS
// ==========================================

app.post('/api/email/test', async (req, res) => {
  const { to, sessions = [] } = req.body
  if (!to) {
    return res.status(400).json({ error: 'Missing recipient email' })
  }

  const dateStr = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const subject = `[Kiểm thử Thông báo Lịch dạy] ${dateStr}`
  const html = buildScheduleEmailHtml({ dateStr, sessions })

  try {
    const result = await sendScheduleEmail({ to, subject, html })
    res.json({ success: true, result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/ai/parse-zalo', async (req, res) => {
  const { text, today, weekStart, classes } = req.body
  const apiKey = process.env.GEMINI_API_KEY || req.body.apiKey

  if (!apiKey) {
    return res.status(400).json({ error: 'GEMINI_API_KEY not configured on server' })
  }
  if (!text) {
    return res.status(400).json({ error: 'Missing text' })
  }

  try {
    const parsed = await callGeminiJson({
      apiKey,
      prompt: buildZaloPrompt({ text, today, weekStart, classes }),
    })
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

const handleParseSchoolImage = async (req: express.Request, res: express.Response) => {
  const { imageDataBase64, imageBase64, apiKey: bodyKey } = req.body || {}
  const rawImg = imageDataBase64 || imageBase64
  const apiKey = process.env.GEMINI_API_KEY || bodyKey

  if (!apiKey) {
    return res.status(400).json({ error: 'GEMINI_API_KEY not configured on server' })
  }
  if (!rawImg) {
    return res.status(400).json({ error: 'Missing imageBase64' })
  }

  const mimeType = String(rawImg).includes('data:image/png') ? 'image/png' : 'image/jpeg'
  const base64Data = String(rawImg).replace(/^data:image\/\w+;base64,/, '')

  try {
    const parsed = await callGeminiJson({
      apiKey,
      prompt: buildSchoolImagePrompt(),
      image: { mimeType, data: base64Data },
    })
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
}

app.post('/api/ai/parse-school-image', handleParseSchoolImage)
app.post('/api/ai/parse-image', handleParseSchoolImage)

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Teacher Schedule Manager Backend running on port ${PORT}`)
  })

  try {
    await waitForDatabase(5, 1000)
    await ensureSchema()
    startCronJobs()
    console.log('[SERVER] Database connected & Cron service active')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `[SERVER] Database connection deferred (${message}). API is running; configure PostgreSQL in .env to enable Sync & Cron.`
    )
  }
}

start().catch((err) => {
  console.error('[SERVER] Failed to start:', err)
  process.exit(1)
})
