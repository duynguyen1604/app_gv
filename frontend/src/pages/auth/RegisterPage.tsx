import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  Eye,
  EyeOff,
  GraduationCap,
  Moon,
  Sun,
  UserPlus,
  Ticket,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import { apiRegisterAccount, startGoogleRedirectLogin } from '../../lib/supabase'
import {
  PasswordStrengthMeter,
  evaluatePasswordStrength,
} from '../../components/auth/PasswordStrengthMeter'
import { TermsPrivacyModal } from '../../components/auth/TermsPrivacyModal'
import { TurnstileWidget } from '../../components/auth/TurnstileWidget'

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { darkMode, toggleDarkMode } = useAppStore()
  const { publicConfig, setPendingVerification } = useAuthStore()

  const initialInvite = searchParams.get('invite') || searchParams.get('code') || ''

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [school, setSchool] = useState('')
  const [phone, setPhone] = useState('')
  const [inviteCode, setInviteCode] = useState(initialInvite)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('dev-turnstile-ok')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const registrationMode = publicConfig?.registration_mode || 'pending_approval'
  const showInviteField = registrationMode === 'invite_only' || Boolean(initialInvite)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!fullName.trim()) {
      setErrorMsg('Vui lòng nhập họ và tên của thầy/cô.')
      return
    }

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Vui lòng nhập địa chỉ email hợp lệ.')
      return
    }

    const pwEval = evaluatePasswordStrength(password)
    if (!pwEval.isValid) {
      if (pwEval.isCommonWeak) {
        setErrorMsg('Mật khẩu quá phổ biến và dễ đoán, vui lòng chọn mật khẩu an toàn hơn.')
      } else {
        setErrorMsg('Mật khẩu phải có tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số.')
      }
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu nhập lại không khớp.')
      return
    }

    if (!agreedToTerms) {
      setErrorMsg('Thầy/cô cần tích đồng ý với Điều khoản và Chính sách bảo mật.')
      return
    }

    if (!turnstileToken) {
      setErrorMsg('Vui lòng hoàn tất xác minh chống spam (Turnstile).')
      return
    }

    setSubmitting(true)
    try {
      const res = await apiRegisterAccount({
        full_name: fullName.trim(),
        email: cleanEmail,
        password,
        school: school.trim() || undefined,
        phone: phone.trim() || undefined,
        invite_code: inviteCode.trim() || undefined,
        agreed_to_terms: agreedToTerms,
      })

      setPendingVerification(res.email, res.devVerifyUrl || null)
      toast.success('Đã tạo tài khoản! Vui lòng xác minh địa chỉ email.')
      navigate(`/auth/verify-email?email=${encodeURIComponent(res.email)}`, {
        replace: true,
      })
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể hoàn tất đăng ký tài khoản.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-white tablet:bg-[#F3F6FC] dark:bg-[#16171A] dark:tablet:bg-[#111215] text-gray-900 dark:text-gray-100 transition-colors">
      {/* Header */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between">
        <Link to="/auth/login" className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center shadow-sm">
            <GraduationCap size={22} />
          </div>
          <div>
            <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-tight">
              Lịch Dạy Giáo Viên
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              Đăng ký tài khoản giáo viên
            </div>
          </div>
        </Link>

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

      {/* Main Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-4 sm:py-8">
        <div className="w-full max-w-[500px] tablet:bg-white dark:tablet:bg-[#1E1F22] tablet:rounded-2xl tablet:border tablet:border-gray-200/80 dark:tablet:border-[#2D2F34] tablet:shadow-xl tablet:p-8 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Tạo tài khoản mới
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {registrationMode === 'pending_approval' &&
                'Sau khi xác minh email, tài khoản sẽ được Quản trị viên phê duyệt.'}
              {registrationMode === 'open' &&
                'Xác minh địa chỉ email để bắt đầu sử dụng ngay.'}
              {registrationMode === 'invite_only' &&
                'Hệ thống đang mở đăng ký theo lời mời từ Quản trị viên.'}
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Google Redirect Button */}
          {publicConfig?.google_login_enabled !== false && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void startGoogleRedirectLogin('/')}
                className="w-full min-h-[46px] flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#24262B] hover:bg-gray-50 dark:hover:bg-[#2C2F36] border border-gray-300 dark:border-[#37393F] text-sm font-semibold text-gray-800 dark:text-gray-100 shadow-2xs transition-all"
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
                <span>Tiếp tục với Google (Chuyển trang)</span>
              </button>

              <div className="relative flex py-0.5 items-center">
                <div className="flex-grow border-t border-gray-200 dark:border-[#2D2F34]" />
                <span className="shrink-0 mx-3 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  hoặc điền thông tin đăng ký
                </span>
                <div className="flex-grow border-t border-gray-200 dark:border-[#2D2F34]" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {showInviteField && (
              <div>
                <label
                  htmlFor="reg-invite"
                  className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1"
                >
                  Mã lời mời {registrationMode === 'invite_only' ? '(Bắt buộc)' : '(Tùy chọn)'}
                </label>
                <div className="relative">
                  <Ticket
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-500"
                  />
                  <input
                    id="reg-invite"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Nhập mã lời mời (VD: GV2026)"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-purple-50/50 dark:bg-[#24262B] border border-purple-300 dark:border-purple-800/60 text-base font-mono uppercase text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Full Name */}
            <div>
              <label
                htmlFor="reg-fullname"
                className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
              >
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                id="reg-fullname"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Thị Minh Tâm"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="reg-email"
                className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
              >
                Địa chỉ Email <span className="text-red-500">*</span>
              </label>
              <input
                id="reg-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="giaovien@gmail.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
              />
            </div>

            {/* Password + Strength Meter */}
            <div>
              <label
                htmlFor="reg-password"
                className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
              >
                Mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự, gồm chữ và số"
                  className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrengthMeter password={password} />
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="reg-confirm-password"
                className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
              >
                Nhập lại mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="reg-confirm-password"
                  name="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu phía trên"
                  className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Mật khẩu nhập lại chưa khớp.
                </p>
              )}
            </div>

            {/* Optional School & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="reg-school"
                  className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
                >
                  Trường / Đơn vị (Tùy chọn)
                </label>
                <input
                  id="reg-school"
                  name="organization"
                  type="text"
                  autoComplete="organization"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  placeholder="VD: THPT Cầu Giấy"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-phone"
                  className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
                >
                  Số điện thoại (Tùy chọn)
                </label>
                <input
                  id="reg-phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912 xxx xxx"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
              </div>
            </div>

            {/* Mandatory Terms & Privacy Checkbox (Section 3.2) */}
            <div className="pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8] shrink-0"
                />
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-snug">
                  Tôi đồng ý với{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setTermsModalOpen(true)
                    }}
                    className="font-bold text-[#1A73E8] dark:text-[#8AB4F8] hover:underline"
                  >
                    Điều khoản và Chính sách bảo mật
                  </button>{' '}
                  (dữ liệu học sinh thuộc quyền riêng tư tuyệt đối của chủ tài khoản).
                </span>
              </label>
            </div>

            {/* Cloudflare Turnstile */}
            <TurnstileWidget onVerify={setTurnstileToken} />

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-60 text-white font-semibold text-sm shadow-sm transition-all active:scale-[0.99]"
            >
              <UserPlus size={18} />
              <span>{submitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}</span>
            </button>
          </form>

          {/* Back to Login */}
          <div className="pt-2 border-t border-gray-100 dark:border-[#2D2F34] text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Đã có tài khoản?{' '}
              <Link
                to="/auth/login"
                className="font-bold text-[#1A73E8] dark:text-[#8AB4F8] hover:underline"
              >
                Đăng nhập
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="py-4 px-4 text-center text-xs text-gray-400 dark:text-gray-500">
        Múi giờ Asia/Ho_Chi_Minh · Bảo mật Row Level Security theo từng giáo viên
      </footer>

      <TermsPrivacyModal
        open={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        onAccept={() => setAgreedToTerms(true)}
      />
    </div>
  )
}

