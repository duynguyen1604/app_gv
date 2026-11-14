import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  GraduationCap,
  KeyRound,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { TurnstileWidget } from '../../components/auth/TurnstileWidget'
import {
  PasswordStrengthMeter,
  evaluatePasswordStrength,
} from '../../components/auth/PasswordStrengthMeter'
import { apiRequestPasswordReset, apiResetPasswordWithToken } from '../../lib/supabase'

export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const tokenFromUrl = searchParams.get('token') || ''
  const emailFromUrl = searchParams.get('email') || ''

  const [email, setEmail] = useState(emailFromUrl)
  const [submitted, setSubmitted] = useState(false)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setTurnstileToken] = useState('dev-turnstile-ok')

  // Reset password with token fields
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiRequestPasswordReset(email.trim())
      setSubmitted(true)
      if (res.devResetUrl) {
        setDevResetUrl(res.devResetUrl)
      }
      toast.success('Đã ghi nhận yêu cầu đặt lại mật khẩu!')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể gửi yêu cầu.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const strength = evaluatePasswordStrength(newPassword)
    if (!strength.isValid) {
      setError('Mật khẩu mới chưa đáp ứng yêu cầu bảo mật.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.')
      return
    }
    setLoading(true)
    try {
      const res = await apiResetPasswordWithToken({
        email: emailFromUrl || email,
        token: tokenFromUrl,
        newPassword,
      })
      setResetDone(true)
      toast.success(res.message)
      setTimeout(() => {
        navigate('/auth/login')
      }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-white tablet:bg-[#F3F6FC] dark:bg-[#16171A] dark:tablet:bg-[#111215] text-gray-900 dark:text-gray-100 px-4 py-6">
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between">
        <Link to="/auth/login" className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center shadow-sm">
            <GraduationCap size={22} />
          </div>
          <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
            Lịch Dạy Giáo Viên
          </span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center py-6">
        <div className="w-full max-w-[440px] tablet:bg-white dark:tablet:bg-[#1E1F22] tablet:rounded-2xl tablet:border tablet:border-gray-200/80 dark:tablet:border-[#2D2F34] tablet:shadow-xl tablet:p-8 space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 dark:bg-[#1A73E8]/20 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center">
            <KeyRound size={28} />
          </div>

          {tokenFromUrl ? (
            <>
              <div className="text-center space-y-1.5">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Tạo mật khẩu mới
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Đặt lại mật khẩu cho tài khoản <strong>{emailFromUrl}</strong>
                </p>
              </div>

              {resetDone ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <span>Đặt lại mật khẩu thành công!</span>
                  </div>
                  <p>Đang chuyển hướng về trang Đăng nhập...</p>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                      Mật khẩu mới
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)"
                        className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <PasswordStrengthMeter password={newPassword} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                      Nhập lại mật khẩu mới
                    </label>
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loading && <Loader2 size={16} className="animate-spin" />}
                    Lưu mật khẩu mới
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <div className="text-center space-y-1.5">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Quên mật khẩu?
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Nhập địa chỉ email của thầy/cô để nhận liên kết đặt lại mật khẩu (hiệu lực 1 giờ).
                </p>
              </div>

              {submitted ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      <span>Đã gửi hướng dẫn khôi phục</span>
                    </div>
                    <p>
                      Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu vào hộp thư của thầy/cô.
                    </p>
                  </div>

                  {devResetUrl && (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                      <div className="font-bold">
                        Chế độ chạy thử Local (Chưa cấu hình SMTP):
                      </div>
                      <p>Bấm trực tiếp vào liên kết mô phỏng bên dưới để đặt mật khẩu mới:</p>
                      <a
                        href={devResetUrl}
                        className="inline-flex items-center gap-1.5 font-bold text-[#1A73E8] dark:text-[#8AB4F8] underline break-all"
                      >
                        <ExternalLink size={13} />
                        Mở trang Đặt lại mật khẩu ngay
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5"
                    >
                      Địa chỉ Email đăng ký
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="giaovien@truong.edu.vn"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                    />
                  </div>

                  <TurnstileWidget onVerify={setTurnstileToken} />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loading && <Loader2 size={16} className="animate-spin" />}
                    Gửi liên kết đặt lại
                  </button>
                </form>
              )}
            </>
          )}

          <div className="pt-2 text-center">
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-[#1A73E8]"
            >
              <ArrowLeft size={14} />
              Quay lại màn hình Đăng nhập
            </Link>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400">
        Lịch Dạy Giáo Viên · Bảo mật tài khoản
      </footer>
    </div>
  )
}
