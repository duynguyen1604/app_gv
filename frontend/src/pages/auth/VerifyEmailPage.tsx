import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  MailCheck,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  ExternalLink,
  GraduationCap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/useAuthStore'
import {
  apiResendVerification,
  apiVerifyEmail,
  consumeAuthReturnToPath,
} from '../../lib/supabase'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    pendingVerificationEmail,
    pendingDevVerifyUrl,
    setPendingVerification,
    setAuthenticatedSession,
  } = useAuthStore()

  const tokenParam = searchParams.get('token') || ''
  const emailParam =
    searchParams.get('email') || pendingVerificationEmail || ''

  const [verifying, setVerifying] = useState(Boolean(tokenParam))
  const [verifiedSuccess, setVerifiedSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)

  // Countdown timer for rate-limited resend button
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // Automatically verify if ?token= is in the URL
  useEffect(() => {
    if (!tokenParam) return
    let active = true
    setVerifying(true)
    setErrorMsg(null)

    apiVerifyEmail({
      email: emailParam || undefined,
      token: tokenParam,
    })
      .then(async (res) => {
        if (!active) return
        setVerifiedSuccess(true)
        setVerifying(false)
        setPendingVerification(null, null)
        await setAuthenticatedSession({
          profile: res.profile,
          sessionToken: res.sessionToken,
          expiresAt: res.expiresAt,
          rememberMe: true,
        })
        toast.success(res.message || 'Xác minh địa chỉ email thành công!')
        setTimeout(() => {
          const target = consumeAuthReturnToPath()
          navigate(target, { replace: true })
        }, 1200)
      })
      .catch((err: unknown) => {
        if (!active) return
        setVerifying(false)
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.'
        )
      })

    return () => {
      active = false
    }
  }, [tokenParam, emailParam, navigate, setAuthenticatedSession, setPendingVerification])

  const handleResend = async () => {
    if (!emailParam) {
      setErrorMsg('Không tìm thấy địa chỉ email cần gửi lại thư xác minh.')
      return
    }
    setErrorMsg(null)
    setResending(true)
    try {
      const res = await apiResendVerification(emailParam)
      setCooldown(res.cooldownSeconds || 60)
      if (res.devVerifyUrl) {
        setPendingVerification(emailParam, res.devVerifyUrl)
      }
      toast.success(res.message)
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể gửi lại thư xác minh.'
      )
    } finally {
      setResending(false)
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
        <div className="w-full max-w-[460px] tablet:bg-white dark:tablet:bg-[#1E1F22] tablet:rounded-2xl tablet:border tablet:border-gray-200/80 dark:tablet:border-[#2D2F34] tablet:shadow-xl tablet:p-8 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 dark:bg-[#1A73E8]/20 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center">
            {verifiedSuccess ? (
              <CheckCircle2 size={34} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <MailCheck size={34} />
            )}
          </div>

          {verifying ? (
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Đang xác minh địa chỉ email...
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Vui lòng đợi trong giây lát.
              </p>
            </div>
          ) : verifiedSuccess ? (
            <div className="space-y-3">
              <h1 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                Đã xác minh email thành công!
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Hệ thống đang chuyển thầy/cô vào ứng dụng...
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Kiểm tra hộp thư Email
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  Chúng tôi đã gửi một thư chứa liên kết xác minh tới địa chỉ:
                </p>
                {emailParam && (
                  <div className="inline-block px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-[#24262B] font-semibold text-sm text-gray-900 dark:text-white">
                    {emailParam}
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                  Vui lòng bấm vào nút <strong>&ldquo;Xác minh địa chỉ Email&rdquo;</strong> trong thư để kích hoạt tài khoản. Nếu không thấy trong Hộp thư đến, hãy kiểm tra mục Thư rác (Spam).
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 text-xs text-left text-red-700 dark:text-red-300 font-medium"
                >
                  <AlertCircle size={17} className="shrink-0 mt-0.5 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Local Dev Simulated Email Quick Verify Link */}
              {pendingDevVerifyUrl && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-left space-y-2">
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    📬 Thư xác minh mô phỏng (Môi trường thử nghiệm Local):
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300/90">
                    Khi chưa điền khóa SMTP/Resend thật, hệ thống tạo sẵn liên kết xác minh để thầy/cô bấm kiểm tra ngay:
                  </p>
                  <a
                    href={pendingDevVerifyUrl}
                    className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                  >
                    <ExternalLink size={14} />
                    Bấm để xác minh Email ngay
                  </a>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || cooldown > 0 || !emailParam}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-55 text-white font-semibold text-sm transition-colors"
                >
                  <RefreshCw size={16} className={resending ? 'animate-spin' : ''} />
                  <span>
                    {cooldown > 0
                      ? `Gửi lại thư xác minh sau (${cooldown}s)`
                      : resending
                        ? 'Đang gửi lại thư...'
                        : 'Gửi lại thư xác minh'}
                  </span>
                </button>

                <Link
                  to="/auth/login"
                  className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#24262B] hover:bg-gray-200/80 dark:hover:bg-[#2E3036] text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors"
                >
                  <ArrowLeft size={15} />
                  <span>Quay lại màn hình Đăng nhập</span>
                </Link>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400">
        Lịch Dạy Giáo Viên · Bảo mật xác thực hai lớp qua Email
      </footer>
    </div>
  )
}

