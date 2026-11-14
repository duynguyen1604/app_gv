import { useState } from 'react'
import { ShieldAlert, LogOut, GraduationCap } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'

export function LockedAccountPage() {
  const { profile, logout } = useAuthStore()
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

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
        <div className="w-full max-w-[460px] bg-white dark:bg-[#1E1F22] rounded-2xl border border-red-200 dark:border-red-900/50 shadow-xl p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
            <ShieldAlert size={34} />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300">
              Trạng thái: Đã bị khóa (Locked)
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Tài khoản đã bị khóa, vui lòng liên hệ Admin
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Tài khoản <strong>{profile?.email}</strong> hiện đang bị tạm khóa quyền truy cập. Toàn bộ lịch gửi email hằng ngày và đồng bộ Google Calendar của tài khoản đã được dừng.
            </p>
          </div>

          {profile?.locked_reason && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-left text-xs text-red-800 dark:text-red-200">
              <strong>Lý do khóa:</strong> {profile.locked_reason}
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setConfirmLogoutOpen(true)}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors"
            >
              <LogOut size={17} />
              <span>Đăng xuất khỏi tài khoản</span>
            </button>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400">
        Vui lòng liên hệ Quản trị viên hệ thống để được hỗ trợ mở khóa.
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
              Thầy/cô muốn đăng xuất để quay về màn hình đăng nhập?
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

