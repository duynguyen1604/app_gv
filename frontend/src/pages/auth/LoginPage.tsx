import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  GraduationCap,
  LogIn,
  Moon,
  Sun,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import {
  apiLoginWithPassword,
  consumeAuthReturnToPath,
  startGoogleRedirectLogin,
} from '../../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { darkMode, toggleDarkMode } = useAppStore()
  const {
    profile,
    rememberMe,
    publicConfig,
    setRememberMe,
    setAuthenticatedSession,
    setPendingVerification,
  } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleRedirecting, setGoogleRedirecting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(
    searchParams.get('error') || null
  )
  const [infoMsg, setInfoMsg] = useState<string | null>(
    searchParams.get('verified') === '1'
      ? 'Xác minh email thành công! Mời thầy/cô đăng nhập.'
      : null
  )

  useEffect(() => {
    if (profile && profile.email_verified) {
      const target = consumeAuthReturnToPath()
      navigate(target, { replace: true })
    }
  }, [profile, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)

    if (!email.trim() || !password) {
      setErrorMsg('Email hoặc mật khẩu không đúng')
      return
    }

    setSubmitting(true)
    try {
      const res = await apiLoginWithPassword({
        email: email.trim(),
        password,
        rememberMe,
      })

      if (!res.success && res.code === 'EMAIL_NOT_VERIFIED') {
        setPendingVerification(res.email || email.trim(), res.devVerifyUrl || null)
        toast('Vui lòng xác minh địa chỉ email trước khi đăng nhập.', { icon: '📧' })
        navigate(`/auth/verify-email?email=${encodeURIComponent(res.email || email.trim())}`)
        return
      }

      if (res.success && res.profile && res.sessionToken && res.expiresAt) {
        await setAuthenticatedSession({
          profile: res.profile,
          sessionToken: res.sessionToken,
          expiresAt: res.expiresAt,
          rememberMe,
        })
        toast.success(`Xin chào, ${res.profile.full_name}!`)
        const target = consumeAuthReturnToPath()
        const finalDest =
          res.profile.role === 'admin' && (target === '/' || !target)
            ? '/admin'
            : target
        navigate(finalDest, { replace: true })
      } else {
        setErrorMsg('Email hoặc mật khẩu không đúng')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Email hoặc mật khẩu không đúng'
      setErrorMsg(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleRedirect = async () => {
    setErrorMsg(null)
    setGoogleRedirecting(true)
    try {
      const returnTo = searchParams.get('returnTo') || '/'
      await startGoogleRedirectLogin(returnTo)
    } catch (err: unknown) {
      setGoogleRedirecting(false)
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể chuyển hướng đăng nhập Google. Vui lòng thử lại.'
      )
    }
  }

  const passwordLoginEnabled = publicConfig?.password_login_enabled !== false
  const googleLoginEnabled = publicConfig?.google_login_enabled !== false

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-white tablet:bg-[#F3F6FC] dark:bg-[#16171A] dark:tablet:bg-[#111215] text-gray-900 dark:text-gray-100 transition-colors">
      {/* Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center shadow-sm">
            <GraduationCap size={22} />
          </div>
          <div>
            <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-tight">
              Lịch Dạy Giáo Viên
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              Quản lý Lịch trường, Dạy thêm &amp; Học phí
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label={darkMode ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 dark:bg-[#24262B] text-gray-700 dark:text-gray-200 hover:bg-gray-200/80 dark:hover:bg-[#2E3036] transition-colors"
        >
          {darkMode ? (
            <>
              <Sun size={16} className="text-amber-400" />
              <span className="hidden sm:inline">Chế độ sáng</span>
            </>
          ) : (
            <>
              <Moon size={16} className="text-slate-600" />
              <span className="hidden sm:inline">Chế độ tối</span>
            </>
          )}
        </button>
      </header>

      {/* Main Content: Mobile full width clean, Desktop centered card */}
      <main className="flex-1 flex items-center justify-center px-4 py-4 sm:py-8">
        <div className="w-full max-w-[440px] tablet:bg-white dark:tablet:bg-[#1E1F22] tablet:rounded-2xl tablet:border tablet:border-gray-200/80 dark:tablet:border-[#2D2F34] tablet:shadow-xl tablet:p-8 space-y-6">
          {/* Heading */}
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Đăng nhập tài khoản
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Dữ liệu lịch dạy, học sinh và học phí được bảo mật riêng theo từng giáo viên
            </p>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium"
            >
              <CheckCircle2
                size={18}
                className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
              />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* Google Redirect Button (Section 3.1: MUST use redirect, NEVER popup) */}
          {googleLoginEnabled && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleRedirect}
                disabled={googleRedirecting || submitting}
                className="w-full min-h-[46px] flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#24262B] hover:bg-gray-50 dark:hover:bg-[#2C2F36] border border-gray-300 dark:border-[#37393F] text-sm font-semibold text-gray-800 dark:text-gray-100 shadow-2xs transition-all active:scale-[0.99] disabled:opacity-60"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                  />
                </svg>
                <span>
                  {googleRedirecting
                    ? 'Đang chuyển hướng tới Google...'
                    : 'Tiếp tục với Google'}
                </span>
              </button>

              {passwordLoginEnabled && (
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-gray-200 dark:border-[#2D2F34]" />
                  <span className="shrink-0 mx-3 text-xs text-gray-400 dark:text-gray-500 font-medium">
                    hoặc đăng nhập bằng email
                  </span>
                  <div className="flex-grow border-t border-gray-200 dark:border-[#2D2F34]" />
                </div>
              )}
            </div>
          )}

          {/* Email + Password Form */}
          {passwordLoginEnabled && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5"
                >
                  Địa chỉ Email
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="giaovien@truong.edu.vn"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:border-transparent transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-gray-700 dark:text-gray-200"
                  >
                    Mật khẩu
                  </label>
                  <Link
                    to="/auth/forgot-password"
                    className="text-xs font-semibold text-[#1A73E8] dark:text-[#8AB4F8] hover:underline"
                  >
                    Quên mật khẩu?
                  </Link>
                </div>

                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember me (Default ON, >= 30 days) */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8]"
                  />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">
                    Ghi nhớ đăng nhập (30 ngày, giữ phiên iPhone PWA)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || googleRedirecting}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-60 text-white font-semibold text-sm shadow-sm transition-all active:scale-[0.99]"
              >
                <LogIn size={18} />
                <span>{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
              </button>
            </form>
          )}

          {/* Register Link */}
          <div className="pt-2 border-t border-gray-100 dark:border-[#2D2F34] text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Chưa có tài khoản?{' '}
              <Link
                to="/auth/register"
                className="font-bold text-[#1A73E8] dark:text-[#8AB4F8] hover:underline"
              >
                Đăng ký ngay
              </Link>
            </p>
          </div>

          {/* Quick Local Test Accounts Helper */}
          <div className="rounded-xl bg-blue-50/70 dark:bg-[#24262B] border border-blue-200/60 dark:border-[#32353C] p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A73E8] dark:text-[#8AB4F8]">
              <Sparkles size={14} />
              <span>Tài khoản mẫu để kiểm tra nhanh Bước 1:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@lichday.vn')
                  setPassword('Admin123456')
                  setErrorMsg(null)
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1F22] border border-blue-200 dark:border-[#37393F] text-left hover:border-[#1A73E8] transition-colors"
              >
                <div className="text-[11px] font-bold text-gray-900 dark:text-white">
                  Admin cố định
                </div>
                <div className="text-[10px] text-gray-500 truncate">admin@lichday.vn</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('giaovien@lichday.vn')
                  setPassword('Giaovien123')
                  setErrorMsg(null)
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1F22] border border-blue-200 dark:border-[#37393F] text-left hover:border-[#1A73E8] transition-colors"
              >
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  GV Đang hoạt động
                </div>
                <div className="text-[10px] text-gray-500 truncate">giaovien@lichday.vn</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('choduyet@lichday.vn')
                  setPassword('Giaovien123')
                  setErrorMsg(null)
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1F22] border border-blue-200 dark:border-[#37393F] text-left hover:border-[#1A73E8] transition-colors"
              >
                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  GV Chờ duyệt
                </div>
                <div className="text-[10px] text-gray-500 truncate">choduyet@lichday.vn</div>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 px-4 text-center text-xs text-gray-400 dark:text-gray-500">
        Múi giờ Asia/Ho_Chi_Minh · Tương thích iPhone PWA (Màn hình chính) &amp; Máy tính
      </footer>
    </div>
  )
}

