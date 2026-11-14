import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, CheckCircle2, ArrowLeft, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/useAuthStore'
import {
  apiCompleteGoogleRedirect,
  apiGetMe,
  apiSyncSupabaseSession,
  consumeAuthReturnToPath,
  supabase,
} from '../../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuthenticatedSession } = useAuthStore()

  const mode = searchParams.get('mode')
  const tokenParam = searchParams.get('token')
  const expiresAtParam = searchParams.get('expiresAt')
  const linkedParam = searchParams.get('linked')
  const returnToParam = searchParams.get('returnTo')

  const [selectMode, setSelectMode] = useState(mode === 'google_redirect_select')
  const [customEmail, setCustomEmail] = useState('')
  const [customName, setCustomName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'google_redirect_select') {
      setSelectMode(true)
      return
    }

    let active = true

    async function handleRedirectCompletion() {
      try {
        // 1. Direct token from backend Google OAuth callback
        if (tokenParam) {
          const me = await apiGetMe(tokenParam)
          if (me.authenticated && me.profile) {
            await setAuthenticatedSession({
              profile: me.profile,
              sessionToken: tokenParam,
              expiresAt: Number(expiresAtParam) || Date.now() + 30 * 24 * 3600 * 1000,
              rememberMe: true,
            })
            if (linkedParam === '1') {
              toast.success(
                'Đã liên kết Google vào tài khoản hiện có của thầy/cô!'
              )
            } else {
              toast.success(`Đăng nhập Google thành công: ${me.profile.full_name}`)
            }
            const dest =
              returnToParam && !returnToParam.startsWith('/auth/')
                ? returnToParam
                : consumeAuthReturnToPath()
            navigate(dest, { replace: true })
            return
          }
        }

        // 2. Supabase OAuth PKCE redirect callback
        if (supabase) {
          const { data } = await supabase.auth.getSession()
          if (data.session?.access_token && data.session.user) {
            const synced = await apiSyncSupabaseSession(data.session.access_token, {
              id: data.session.user.id,
              email: data.session.user.email || '',
              full_name:
                data.session.user.user_metadata?.full_name ||
                data.session.user.user_metadata?.name,
              email_verified: true,
              provider: 'google',
            })
            if (!active) return
            await setAuthenticatedSession({
              profile: synced.profile,
              sessionToken: synced.sessionToken,
              expiresAt: synced.expiresAt,
              rememberMe: true,
            })
            toast.success(`Đăng nhập Google thành công: ${synced.profile.full_name}`)
            const dest =
              returnToParam && !returnToParam.startsWith('/auth/')
                ? returnToParam
                : consumeAuthReturnToPath()
            navigate(dest, { replace: true })
            return
          }
        }

        if (active) {
          setErrorMsg('Không tìm thấy mã xác thực từ phiên chuyển hướng Google.')
        }
      } catch (err: unknown) {
        if (active) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Lỗi xử lý chuyển hướng đăng nhập Google.'
          )
        }
      }
    }

    void handleRedirectCompletion()
    return () => {
      active = false
    }
  }, [
    mode,
    tokenParam,
    expiresAtParam,
    linkedParam,
    returnToParam,
    navigate,
    setAuthenticatedSession,
  ])

  const handleSimulatedGoogleAccountPick = async (email: string, fullName: string) => {
    setErrorMsg(null)
    setSubmitting(true)
    try {
      const res = await apiCompleteGoogleRedirect({ email, fullName })
      await setAuthenticatedSession({
        profile: res.profile,
        sessionToken: res.sessionToken,
        expiresAt: res.expiresAt,
        rememberMe: true,
      })
      if (res.linkedExisting) {
        toast.success(
          'Email trùng với tài khoản mật khẩu đã có — Đã liên kết vào cùng một tài khoản!'
        )
      } else {
        toast.success(`Đã đăng nhập với Google: ${res.profile.full_name}`)
      }
      const dest =
        returnToParam && !returnToParam.startsWith('/auth/')
          ? returnToParam
          : consumeAuthReturnToPath()
      navigate(dest, { replace: true })
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể hoàn tất đăng nhập Google.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F3F6FC] dark:bg-[#111215] text-gray-900 dark:text-gray-100 px-4 py-8">
      <div className="w-full max-w-[460px] bg-white dark:bg-[#1E1F22] rounded-2xl border border-gray-200/80 dark:border-[#2D2F34] shadow-xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-[#2D2F34]">
          <div className="w-10 h-10 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">
              Đăng nhập với Google (Redirect)
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Chuyển trang toàn màn hình — Tương thích iPhone PWA Màn hình chính
            </p>
          </div>
        </div>

        {selectMode ? (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-[#1A73E8]/15 border border-blue-200/60 dark:border-[#1A73E8]/30 text-xs text-blue-950 dark:text-blue-100 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 mb-0.5">
                <ShieldCheck size={15} className="text-[#1A73E8]" />
                Chọn tài khoản Google để tiếp tục
              </div>
              Nếu email Google trùng với email đã đăng ký bằng mật khẩu, hệ thống sẽ tự động <strong>liên kết vào cùng một tài khoản</strong> mà không tạo tài khoản trùng.
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 text-xs text-red-700 dark:text-red-300 font-medium">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Chọn nhanh tài khoản để kiểm tra:
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  void handleSimulatedGoogleAccountPick(
                    'giaovien@lichday.vn',
                    'Cô Nguyễn Thu Hà'
                  )
                }
                className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-[#37393F] hover:border-[#1A73E8] hover:bg-blue-50/30 dark:hover:bg-[#24262B] transition-all text-left"
              >
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    Cô Nguyễn Thu Hà (Giáo viên)
                  </div>
                  <div className="text-xs text-gray-500">
                    giaovien@lichday.vn · Kiểm tra liên kết tài khoản cùng email
                  </div>
                </div>
                <CheckCircle2 size={18} className="text-[#1A73E8] shrink-0" />
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  void handleSimulatedGoogleAccountPick(
                    'admin@lichday.vn',
                    'Quản trị viên Hệ thống'
                  )
                }
                className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-[#37393F] hover:border-[#1A73E8] hover:bg-blue-50/30 dark:hover:bg-[#24262B] transition-all text-left"
              >
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    Quản trị viên (ADMIN_EMAIL)
                  </div>
                  <div className="text-xs text-gray-500">
                    admin@lichday.vn · Tự động nhận quyền Admin phía server
                  </div>
                </div>
                <CheckCircle2 size={18} className="text-[#1A73E8] shrink-0" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!customEmail.trim()) return
                void handleSimulatedGoogleAccountPick(
                  customEmail.trim(),
                  customName.trim() || customEmail.split('@')[0]
                )
              }}
              className="pt-3 border-t border-gray-100 dark:border-[#2D2F34] space-y-3"
            >
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Hoặc nhập bất kỳ địa chỉ Gmail nào:
              </div>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Họ và tên hiển thị trên Google"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base"
              />
              <input
                type="email"
                required
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="ten.giaovien@gmail.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#24262B] border border-gray-300 dark:border-[#37393F] text-base"
              />
              <button
                type="submit"
                disabled={submitting || !customEmail.trim()}
                className="w-full py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                {submitting ? 'Đang chuyển hướng...' : 'Tiếp tục với tài khoản Google này'}
              </button>
            </form>

            <Link
              to="/auth/login"
              className="w-full inline-flex items-center justify-center gap-1.5 pt-1 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <ArrowLeft size={14} />
              Quay lại trang Đăng nhập
            </Link>
          </div>
        ) : (
          <div className="py-6 text-center space-y-3">
            {errorMsg ? (
              <>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  {errorMsg}
                </p>
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1A73E8] text-white text-xs font-semibold"
                >
                  <ArrowLeft size={14} />
                  Quay lại Đăng nhập
                </Link>
              </>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Đang hoàn tất đăng nhập và quay lại màn hình của thầy/cô...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

