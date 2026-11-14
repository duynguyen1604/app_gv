import { useState } from 'react'
import {
  Clock,
  BellRing,
  LogOut,
  RefreshCw,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/useAuthStore'
import { apiNotifyAdmin } from '../../lib/supabase'

export function PendingApprovalPage() {
  const { profile, sessionToken, refreshSessionSilently, logout } = useAuthStore()
  const [notifying, setNotifying] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notifiedMsg, setNotifiedMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

  const handleNotifyAdmin = async () => {
    if (!sessionToken) return
    setErrorMsg(null)
    setNotifying(true)
    try {
      const res = await apiNotifyAdmin(sessionToken)
      setNotifiedMsg(res.message)
      toast.success(res.message)
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể gửi lại thông báo lúc này.'
      )
    } finally {
      setNotifying(false)
    }
  }

  const handleCheckStatus = async () => {
    setChecking(true)
    try {
      await refreshSessionSilently()
      const updated = useAuthStore.getState().profile
      if (updated?.status === 'active') {
        toast.success('Tài khoản của thầy/cô đã được duyệt!')
      } else {
        toast('Tài khoản hiện vẫn đang chờ Quản trị viên phê duyệt.', { icon: '⏳' })
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#F3F6FC] dark:bg-[#111215] text-gray-900 dark:text-gray-100 px-4 py-6">
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center shadow-sm">
            <GraduationCap size={22} />
          </div>
          <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
            Lịch Dạy Giáo Viên
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center py-6">
        <div className="w-full max-w-[480px] bg-white dark:bg-[#1E1F22] rounded-2xl border border-gray-200/80 dark:border-[#2D2F34] shadow-xl p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock size={34} />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
              Trạng thái: Chờ duyệt (Pending)
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Tài khoản đang chờ Admin duyệt
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Địa chỉ email của thầy/cô đã được xác minh thành công. Quản trị viên sẽ kiểm tra và kích hoạt tài khoản trong thời gian sớm nhất.
            </p>
          </div>

          {profile && (
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#24262B] border border-gray-200/70 dark:border-[#32353C] text-left text-xs space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-gray-500 dark:text-gray-400">Họ và tên:</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {profile.full_name}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500 dark:text-gray-400">Email:</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {profile.email}
                </span>
              </div>
              {profile.school && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Trường / Đơn vị:</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {profile.school}
                  </span>
                </div>
              )}
            </div>
          )}

          {notifiedMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-left text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
              <span>{notifiedMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-left text-red-700 dark:text-red-300 font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleNotifyAdmin}
              disabled={notifying}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-55 text-white font-semibold text-sm shadow-xs transition-colors"
            >
              <BellRing size={17} />
              <span>
                {notifying
                  ? 'Đang gửi thông báo...'
                  : 'Gửi lại thông báo cho Admin'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#24262B] hover:bg-gray-200/80 dark:hover:bg-[#2E3036] text-gray-800 dark:text-gray-200 font-semibold text-xs transition-colors"
            >
              <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
              <span>Kiểm tra lại trạng thái phê duyệt</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmLogoutOpen(true)}
              className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-xs transition-colors"
            >
              <LogOut size={15} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400">
        Khi Quản trị viên phê duyệt, thầy/cô sẽ nhận được email thông báo ngay lập tức.
      </footer>

      {confirmLogoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E1F22] border border-gray-200 dark:border-[#2D2F34] p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Xác nhận đăng xuất?
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Thầy/cô có chắc chắn muốn đăng xuất khỏi tài khoản đang chờ duyệt này không?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLogoutOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-[#282A2E] text-gray-700 dark:text-gray-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLogoutOpen(false)
                  void logout()
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

