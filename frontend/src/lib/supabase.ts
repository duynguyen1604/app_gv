import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AccountSecuritySummary,
  AdminOverviewData,
  AppSettingsRecord,
  InviteRecord,
  PublicAuthConfig,
  RegistrationMode,
  UserProfile,
} from '../types'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  ''
).replace(/\/+$/, '')

export const isSupabaseCloudConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const AUTH_STORAGE_KEY = 'gv_auth_session_v1'
const AUTH_REMEMBER_KEY = 'gv_auth_remember_me'
const AUTH_RETURN_TO_KEY = 'gv_auth_return_to'
const PWA_CACHE_NAME = 'gv-pwa-auth-cache-v1'
const PWA_CACHE_URL = '/__gv_pwa_auth_session__'

export interface PersistedAuthSession {
  sessionToken: string
  expiresAt: number
  profile: UserProfile
  rememberMe: boolean
}

export function getRememberMePreference(): boolean {
  try {
    const val = localStorage.getItem(AUTH_REMEMBER_KEY)
    if (val === null) return true // Default ON per Section 3.1 & 4.1
    return val === 'true'
  } catch {
    return true
  }
}

export function setRememberMePreference(remember: boolean): void {
  try {
    localStorage.setItem(AUTH_REMEMBER_KEY, remember ? 'true' : 'false')
  } catch {
    // ignore storage quota errors
  }
}

export function saveAuthReturnToPath(pathStr: string): void {
  try {
    if (!pathStr || pathStr.startsWith('/auth/')) return
    localStorage.setItem(AUTH_RETURN_TO_KEY, pathStr)
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, pathStr)
  } catch {
    // ignore
  }
}

export function consumeAuthReturnToPath(): string {
  try {
    const fromLocal = localStorage.getItem(AUTH_RETURN_TO_KEY)
    const fromSession = sessionStorage.getItem(AUTH_RETURN_TO_KEY)
    localStorage.removeItem(AUTH_RETURN_TO_KEY)
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY)
    const target = fromLocal || fromSession || '/'
    return target.startsWith('/auth/') ? '/' : target
  } catch {
    return '/'
  }
}

/**
 * Saves the session to localStorage/sessionStorage AND mirrors to CacheStorage
 * so iPhone Home Screen PWA (standalone mode) retains the session when swiped closed and reopened.
 */
export async function persistAuthSession(session: PersistedAuthSession | null): Promise<void> {
  try {
    if (!session) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(PWA_CACHE_NAME)
        await cache.delete(PWA_CACHE_URL)
      }
      return
    }

    const raw = JSON.stringify(session)
    if (session.rememberMe) {
      localStorage.setItem(AUTH_STORAGE_KEY, raw)
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, raw)
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }

    // Mirror to CacheStorage for iPhone PWA standalone persistence (Section 4.2)
    if (typeof caches !== 'undefined' && session.rememberMe) {
      const cache = await caches.open(PWA_CACHE_NAME)
      await cache.put(
        PWA_CACHE_URL,
        new Response(raw, {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    }
  } catch {
    // Ignore private browsing / storage errors
  }
}

export async function loadPersistedAuthSession(): Promise<PersistedAuthSession | null> {
  try {
    const fromLocal = localStorage.getItem(AUTH_STORAGE_KEY)
    const fromSession = sessionStorage.getItem(AUTH_STORAGE_KEY)
    const raw = fromLocal || fromSession
    if (raw) {
      return JSON.parse(raw) as PersistedAuthSession
    }

    // Fallback for iPhone PWA when reopened from Home Screen if WebKit cleared localStorage
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(PWA_CACHE_NAME)
      const cachedResp = await cache.match(PWA_CACHE_URL)
      if (cachedResp) {
        const cachedData = (await cachedResp.json()) as PersistedAuthSession
        if (cachedData && cachedData.sessionToken) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(cachedData))
          return cachedData
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

// Create Supabase client (ONLY anon key is used in browser)
export const supabase: SupabaseClient | null = isSupabaseCloudConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'gv-supabase-auth-token',
      },
    })
  : null

// ============================================================================
// BACKEND AUTH API HELPERS
// ============================================================================

export async function apiGetPublicAuthConfig(): Promise<PublicAuthConfig> {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/auth/public-config`)
    if (resp.ok) {
      return (await resp.json()) as PublicAuthConfig
    }
  } catch {
    // Fallback default config
  }
  return {
    registration_mode: 'pending_approval',
    google_login_enabled: true,
    password_login_enabled: true,
    supabase_configured: isSupabaseCloudConfigured,
    google_oauth_configured: false,
    turnstile_site_key: import.meta.env.VITE_TURNSTILE_SITE_KEY || null,
  }
}

export async function apiRegisterAccount(payload: {
  full_name: string
  email: string
  password: string
  school?: string
  phone?: string
  invite_code?: string
  agreed_to_terms: boolean
}): Promise<{
  success: boolean
  email: string
  message: string
  devVerifyUrl?: string
}> {
  if (supabase) {
    const redirectTo = `${window.location.origin}/auth/verify-email`
    const { error } = await supabase.auth.signUp({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: payload.full_name.trim(),
          school: payload.school?.trim() || null,
          phone: payload.phone?.trim() || null,
        },
      },
    })
    if (error) {
      throw new Error(translateSupabaseAuthError(error.message))
    }
  }

  const resp = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể đăng ký tài khoản.')
  }
  return data
}

export async function apiVerifyEmail(payload: {
  email?: string
  token: string
}): Promise<{
  success: boolean
  profile: UserProfile
  sessionToken: string
  expiresAt: number
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Xác minh email thất bại.')
  }
  return data
}

export async function apiResendVerification(email: string): Promise<{
  success: boolean
  message: string
  cooldownSeconds?: number
  devVerifyUrl?: string
}> {
  if (supabase) {
    await supabase.auth
      .resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/verify-email`,
        },
      })
      .catch(() => undefined)
  }

  const resp = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể gửi lại thư xác minh.')
  }
  return data
}

export async function apiLoginWithPassword(payload: {
  email: string
  password: string
  rememberMe: boolean
}): Promise<{
  success: boolean
  code?: 'EMAIL_NOT_VERIFIED'
  email?: string
  profile?: UserProfile
  sessionToken?: string
  expiresAt?: number
  devVerifyUrl?: string
}> {
  if (supabase) {
    const { data: supaData, error: supaErr } = await supabase.auth.signInWithPassword({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    })
    if (supaErr) {
      if (supaErr.message.toLowerCase().includes('email not confirmed')) {
        return {
          success: false,
          code: 'EMAIL_NOT_VERIFIED',
          email: payload.email.trim().toLowerCase(),
        }
      }
      throw new Error('Email hoặc mật khẩu không đúng')
    }
    if (supaData.session) {
      const synced = await apiSyncSupabaseSession(supaData.session.access_token, {
        id: supaData.user.id,
        email: supaData.user.email || payload.email,
        full_name: supaData.user.user_metadata?.full_name,
        phone: supaData.user.user_metadata?.phone,
        school: supaData.user.user_metadata?.school,
        email_verified: Boolean(supaData.user.email_confirmed_at),
        provider: 'email',
      })
      return {
        success: true,
        profile: synced.profile,
        sessionToken: synced.sessionToken,
        expiresAt: synced.expiresAt,
      }
    }
  }

  const resp = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (resp.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
    return data
  }
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Email hoặc mật khẩu không đúng')
  }
  return data
}

export async function apiSyncSupabaseSession(
  accessToken: string,
  userMetadata?: {
    id: string
    email: string
    full_name?: string
    phone?: string
    school?: string
    email_verified?: boolean
    provider?: 'email' | 'google'
  }
): Promise<{
  profile: UserProfile
  sessionToken: string
  expiresAt: number
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/sync-supabase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, userMetadata }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể đồng bộ phiên đăng nhập.')
  }
  return data
}

export async function apiGetMe(sessionToken: string): Promise<{
  authenticated: boolean
  profile: UserProfile | null
  errorCode?: string
  error?: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  const data = await resp.json()
  return {
    authenticated: Boolean(resp.ok && data.authenticated),
    profile: data.profile || null,
    errorCode: data.errorCode,
    error: data.error,
  }
}

export async function apiRefreshSession(sessionToken: string): Promise<{
  success: boolean
  profile?: UserProfile
  sessionToken?: string
  expiresAt?: number
  errorCode?: string
  error?: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  return await resp.json()
}

export async function apiNotifyAdmin(sessionToken: string): Promise<{
  success: boolean
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/notify-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể gửi thông báo.')
  }
  return data
}

export async function apiLogout(sessionToken: string | null): Promise<void> {
  if (supabase) {
    await supabase.auth.signOut().catch(() => undefined)
  }
  if (sessionToken) {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    }).catch(() => undefined)
  }
}

/**
 * Initiates Google OAuth via full-page redirect (NEVER popup! Section 3.1 & 4.2)
 */
export async function startGoogleRedirectLogin(returnToPath = '/'): Promise<void> {
  saveAuthReturnToPath(returnToPath)

  if (supabase) {
    const redirectTo = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(
      returnToPath
    )}`
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
    if (error) {
      throw new Error(translateSupabaseAuthError(error.message))
    }
    if (data?.url) {
      window.location.assign(data.url)
      return
    }
  }

  const resp = await fetch(
    `${API_BASE_URL}/api/auth/google/url?returnTo=${encodeURIComponent(returnToPath)}`
  )
  const data = (await resp.json()) as { redirectUrl?: string }
  if (!data.redirectUrl) {
    throw new Error('Không thể khởi tạo chuyển hướng đăng nhập Google.')
  }
  // Full-page redirect (compatible with iPhone Home Screen PWA standalone mode)
  window.location.assign(data.redirectUrl)
}

export async function apiCompleteGoogleRedirect(payload: {
  email: string
  fullName: string
}): Promise<{
  profile: UserProfile
  sessionToken: string
  expiresAt: number
  linkedExisting: boolean
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/google/redirect-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể hoàn tất đăng nhập Google.')
  }
  return data
}

export function translateSupabaseAuthError(msg: string): string {
  const lower = (msg || '').toLowerCase()
  if (lower.includes('invalid login credentials')) {
    return 'Email hoặc mật khẩu không đúng'
  }
  if (lower.includes('email not confirmed')) {
    return 'Tài khoản chưa xác minh email. Vui lòng kiểm tra hộp thư để xác minh.'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Thao tác quá nhanh, vui lòng đợi ít phút rồi thử lại.'
  }
  if (lower.includes('user already registered')) {
    return 'Không thể hoàn tất đăng ký với email này. Nếu đã có tài khoản, vui lòng Đăng nhập.'
  }
  return 'Đã xảy ra lỗi xác thực, vui lòng thử lại.'
}

// ============================================================================
// FORGOT PASSWORD & PROFILE API HELPERS
// ============================================================================

export async function apiRequestPasswordReset(email: string): Promise<{
  success: boolean
  message: string
  devResetUrl?: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể gửi yêu cầu đặt lại mật khẩu.')
  }
  return data
}

export async function apiResetPasswordWithToken(payload: {
  email: string
  token: string
  newPassword: string
}): Promise<{
  success: boolean
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể đặt lại mật khẩu.')
  }
  return data
}

export async function apiGetMyProfileSecurity(sessionToken: string): Promise<{
  success: boolean
  profile: UserProfile
  security: AccountSecuritySummary
}> {
  const resp = await fetch(`${API_BASE_URL}/api/profile/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể tải thông tin hồ sơ.')
  }
  return data
}

export async function apiUpdateMyProfile(
  sessionToken: string,
  payload: {
    full_name: string
    phone?: string | null
    school?: string | null
    avatar_url?: string | null
  }
): Promise<{
  success: boolean
  profile: UserProfile
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/profile/me`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể cập nhật hồ sơ.')
  }
  return data
}

export async function apiChangeMyPassword(
  sessionToken: string,
  payload: {
    currentPassword?: string
    newPassword: string
  }
): Promise<{
  success: boolean
  profile: UserProfile
  sessionToken: string
  expiresAt: number
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/profile/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể đổi mật khẩu.')
  }
  return data
}

export async function apiRevokeOtherSessions(sessionToken: string): Promise<{
  success: boolean
  profile: UserProfile
  sessionToken: string
  expiresAt: number
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/profile/revoke-other-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể thu hồi phiên khác.')
  }
  return data
}

export async function apiDeleteMyAccount(
  sessionToken: string,
  payload: {
    password?: string
    confirmText?: string
  }
): Promise<{
  success: boolean
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/profile/delete-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể xóa tài khoản.')
  }
  return data
}

// ============================================================================
// ADMIN CONSOLE API HELPERS
// ============================================================================

export async function apiGetAdminOverview(sessionToken: string): Promise<AdminOverviewData> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể tải dữ liệu Quản trị.')
  }
  return data as AdminOverviewData
}

export async function apiAdminApproveUser(
  sessionToken: string,
  targetUserId: string
): Promise<{
  success: boolean
  profile: UserProfile
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/${targetUserId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể duyệt tài khoản.')
  }
  return data
}

export async function apiAdminBulkApproveUsers(
  sessionToken: string,
  userIds?: string[]
): Promise<{
  success: boolean
  approvedCount: number
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/approve-bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ userIds }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể duyệt hàng loạt.')
  }
  return data
}

export async function apiAdminLockUser(
  sessionToken: string,
  targetUserId: string,
  reason?: string
): Promise<{
  success: boolean
  profile: UserProfile
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/${targetUserId}/lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ reason }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể khóa tài khoản.')
  }
  return data
}

export async function apiAdminUnlockUser(
  sessionToken: string,
  targetUserId: string
): Promise<{
  success: boolean
  profile: UserProfile
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/${targetUserId}/unlock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể mở khóa tài khoản.')
  }
  return data
}

export async function apiAdminResetUserPassword(
  sessionToken: string,
  targetUserId: string,
  temporaryPassword?: string
): Promise<{
  success: boolean
  message: string
  resetUrl?: string
  temporaryPassword?: string
}> {
  const resp = await fetch(
    `${API_BASE_URL}/api/admin/users/${targetUserId}/reset-password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ temporaryPassword }),
    }
  )
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể đặt lại mật khẩu.')
  }
  return data
}

export async function apiAdminCreateTeacher(
  sessionToken: string,
  payload: {
    full_name: string
    email: string
    password: string
    school?: string
    phone?: string
    status?: 'active' | 'pending'
  }
): Promise<{
  success: boolean
  profile: UserProfile
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể tạo tài khoản giáo viên.')
  }
  return data
}

export async function apiAdminDeleteTeacher(
  sessionToken: string,
  targetUserId: string,
  reason?: string
): Promise<{
  success: boolean
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/${targetUserId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ reason }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể xóa tài khoản.')
  }
  return data
}

export async function apiAdminUpdateSettings(
  sessionToken: string,
  payload: {
    registration_mode?: RegistrationMode
    google_login_enabled?: boolean
    password_login_enabled?: boolean
    notify_admin_email?: boolean
    max_accounts?: number | null
  }
): Promise<{
  success: boolean
  appSettings: AppSettingsRecord
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể cập nhật cài đặt.')
  }
  return data
}

export async function apiAdminCreateInvite(
  sessionToken: string,
  payload: {
    email?: string | null
    customCode?: string | null
    maxUses?: number
    expiresInDays?: number | null
    sendEmailNow?: boolean
  }
): Promise<{
  success: boolean
  invite: InviteRecord
  inviteUrl: string
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/invites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể tạo mã mời.')
  }
  return data
}

export async function apiAdminRevokeInvite(
  sessionToken: string,
  inviteId: string
): Promise<{
  success: boolean
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/invites/${inviteId}/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể thu hồi mã mời.')
  }
  return data
}

export async function apiAdminDeleteInvite(
  sessionToken: string,
  inviteId: string
): Promise<{
  success: boolean
  message: string
}> {
  const resp = await fetch(`${API_BASE_URL}/api/admin/invites/${inviteId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  const data = await resp.json()
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'Không thể xóa mã mời.')
  }
  return data
}
