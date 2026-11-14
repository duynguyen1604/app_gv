import { useState } from 'react'
import { AlertTriangle, Eye, EyeOff, Lock, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/useAuthStore'
import { apiLoginWithPassword, startGoogleRedirectLogin } from '../../lib/supabase'

export function SessionExpiredBanner() {
  const {
    profile,
    sessionExpiredMidWork,
    rememberMe,
    setAuthenticatedSession,
    logout,
  } = useAuthStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!sessionExpiredMidWork || !profile) return null

  const handleRelogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSubmitting(true)
    try {
      const res = await apiLoginWithPassword({
        email: profile.email,
        password,
        rememberMe,
      })
      if (res.success && res.profile && res.sessionToken && res.expiresAt) {
        await setAuthenticatedSession({
          profile: res.profile,
          sessionToken: res.sessionToken,
          expiresAt: res.expiresAt,
          rememberMe,
        })
        setPassword('')
        setModalOpen(false)
        toast.success('Đã khôi phục phiên đăng nhập và lưu toàn bộ thay đổi!')
      } else {
        setErrorMsg('Email hoặc mật khẩu không đúng')
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Email hoặc mật khẩu không đúng')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        role="alert"
        className="sticky top-0 z-40 w-full bg-amber-50 dark:bg-amber-950/90 border-b border-amber-300 dark:border-amber-700/80 px-4 py-2.5 text-amber-950 dark:text-amber-100 shadow-xs"
      >
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Phiên đã hết hạn, hãy đăng nhập lại.</strong> Các thay đổi chưa lưu (điểm danh, lịch dạy) đang được giữ nguyên trên máy.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
            >
              <RefreshCw size={13} />
              Đăng nhập lại ngay
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#2D2F34]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Lock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Khôi phục phiên đăng nhập
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Giữ nguyên dữ liệu đang làm dở của {profile.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRelogin} className="p-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-300 font-medium">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                  Tài khoản đang mở
                </label>
                <input
                  type="email"
                  value={profile.email}
                  readOnly
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-[#282A2E] border border-gray-200 dark:border-[#37393F] text-base text-gray-600 dark:text-gray-300 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                  Nhập mật khẩu để tiếp tục
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu của thầy/cô"
                    className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting || !password}
                  className="w-full py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                >
                  {submitting ? 'Đang xác thực...' : 'Đăng nhập & Lưu dữ liệu đang làm'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void startGoogleRedirectLogin(
                      window.location.pathname + window.location.search
                    )
                  }}
                  className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-[#282A2E] hover:bg-gray-200 dark:hover:bg-[#32353C] text-gray-800 dark:text-gray-100 font-semibold text-xs transition-colors"
                >
                  Hoặc xác thực lại qua Google (Chuyển trang)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false)
                    void logout()
                  }}
                  className="w-full py-1.5 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400"
                >
                  Đăng xuất sang tài khoản khác
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

