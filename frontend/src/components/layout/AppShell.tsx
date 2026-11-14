import { ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  BookOpen,
  Wallet,
  Settings,
  Sun,
  Moon,
  GraduationCap,
  LogOut,
  ShieldCheck,
  User,
  Users,
  Ticket,
  History,
  Sliders,
  HelpCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import { apiGetAdminOverview } from '../../lib/supabase'
import { BottomNav } from '../ui/BottomNav'
import { OnboardingTour } from '../onboarding/OnboardingTour'
import { HelpAssistantWidget } from '../onboarding/HelpAssistantWidget'
import { cn } from '../../lib/utils'

const TEACHER_NAV_ITEMS = [
  { to: '/', label: 'Lịch dạy', shortLabel: 'Lịch', icon: CalendarDays, tourId: 'nav-schedule' },
  { to: '/classes', label: 'Lớp & Điểm danh', shortLabel: 'Lớp', icon: BookOpen, tourId: 'nav-classes' },
  { to: '/fees', label: 'Học phí & Thu nhập', shortLabel: 'Học phí', icon: Wallet, tourId: 'nav-fees' },
  { to: '/profile', label: 'Hồ sơ cá nhân', shortLabel: 'Hồ sơ', icon: User, tourId: 'nav-profile' },
  { to: '/settings', label: 'Cài đặt hệ thống', shortLabel: 'Cài đặt', icon: Settings, tourId: 'nav-settings' },
]

const ADMIN_PRIMARY_ITEMS = [
  {
    to: '/admin?tab=accounts',
    tabKey: 'accounts',
    label: 'Duyệt & Quản lý GV',
    shortLabel: 'Tài khoản',
    icon: Users,
  },
  {
    to: '/admin?tab=invites',
    tabKey: 'invites',
    label: 'Mã mời Giáo viên',
    shortLabel: 'Mã mời',
    icon: Ticket,
  },
  {
    to: '/admin?tab=settings',
    tabKey: 'settings',
    label: 'Chế độ Đăng ký',
    shortLabel: 'Đăng ký',
    icon: Sliders,
  },
  {
    to: '/admin?tab=audit',
    tabKey: 'audit',
    label: 'Nhật ký Kiểm toán',
    shortLabel: 'Nhật ký',
    icon: History,
  },
  {
    to: '/profile',
    tabKey: 'profile',
    label: 'Hồ sơ Quản trị viên',
    shortLabel: 'Hồ sơ',
    icon: User,
  },
]

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { darkMode, toggleDarkMode, classes, students, userId } = useAppStore()
  const {
    profile,
    sessionToken,
    pendingAdminApprovalCount,
    setPendingAdminApprovalCount,
    openOnboardingMenu,
    logout,
  } = useAuthStore()
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

  const isAdmin = profile?.role === 'admin'
  const isSchedulePage =
    location.pathname === '/schedule' || (!isAdmin && location.pathname === '/')

  // Keep pending count badge fresh for Admin
  useEffect(() => {
    if (!isAdmin || !sessionToken) return
    void apiGetAdminOverview(sessionToken)
      .then((res) => {
        setPendingAdminApprovalCount(res.stats.pendingCount)
      })
      .catch(() => undefined)
  }, [isAdmin, sessionToken, setPendingAdminApprovalCount])

  const activeClassesCount = classes.length
  const activeStudentsCount = students.filter((s) => s.status !== 'left').length

  const displayName = profile?.full_name || `Giáo viên (${userId})`
  const initials =
    (profile?.full_name || 'GV')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'GV'

  const currentSearchTab = new URLSearchParams(location.search).get('tab') || 'accounts'

  return (
    <div className="min-h-screen flex flex-col tablet:flex-row bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Left Navigation Sidebar */}
      <aside
        aria-label="Thanh bên điều hướng chính"
        style={{ overflowAnchor: 'none' }}
        className={cn(
          'hidden tablet:flex flex-col shrink-0 tablet:sticky tablet:top-0 tablet:h-screen bg-white dark:bg-[#1E1F22] border-r border-gray-200/80 dark:border-[#2D2F34] select-none z-30 no-print transition-all duration-200',
          'tablet:w-[68px]',
          !isSchedulePage && 'desktop:w-[248px]'
        )}
      >
        {/* Brand Logo */}
        <div
          data-tour="app-brand"
          className={cn(
            'h-16 flex items-center gap-3 border-b border-gray-100 dark:border-[#2D2F34] px-3',
            !isSchedulePage ? 'desktop:px-5' : 'justify-center'
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0',
              isAdmin
                ? 'bg-gradient-to-br from-[#0F172A] to-[#1D4ED8]'
                : 'bg-[#1A73E8]'
            )}
          >
            {isAdmin ? <ShieldCheck size={22} /> : <GraduationCap size={22} />}
          </div>
          {!isSchedulePage && (
            <div className="hidden desktop:block min-w-0">
              <div className="font-bold text-sm text-gray-900 dark:text-white tracking-tight truncate">
                {isAdmin ? 'Cổng Quản Trị' : 'Lịch Dạy GV'}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {isAdmin ? 'Quản lý Tài khoản & Bảo mật' : 'Quản lý Lịch & Lớp học'}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-2 flex flex-col gap-1.5 overflow-y-auto">
          {isAdmin ? (
            <>
              {!isSchedulePage && (
                <div className="hidden desktop:block px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Nghiệp vụ Quản trị viên
                </div>
              )}
              {ADMIN_PRIMARY_ITEMS.map(({ to, tabKey, label, shortLabel, icon: Icon }) => {
                const isItemActive =
                  tabKey === 'profile'
                    ? location.pathname === '/profile'
                    : location.pathname === '/admin' && currentSearchTab === tabKey

                return (
                  <Link
                    key={to}
                    to={to}
                    title={label}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative',
                      isSchedulePage
                        ? 'justify-center flex-col gap-1 py-2 px-1'
                        : 'justify-center desktop:justify-start',
                      isItemActive
                        ? 'bg-[#E8F0FE] dark:bg-[#1A73E8]/25 text-[#1A73E8] dark:text-[#8AB4F8] font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#282A2E] hover:text-gray-900 dark:hover:text-gray-100'
                    )}
                  >
                    <Icon
                      size={20}
                      strokeWidth={isItemActive ? 2.4 : 1.9}
                      className="shrink-0"
                    />
                    {isSchedulePage ? (
                      <span className="text-[10px] leading-tight font-medium text-center">
                        {shortLabel}
                      </span>
                    ) : (
                      <>
                        <span className="text-[10px] leading-tight desktop:hidden text-center">
                          {shortLabel}
                        </span>
                        <span className="hidden desktop:inline truncate flex-1">{label}</span>
                        {tabKey === 'accounts' && pendingAdminApprovalCount > 0 && (
                          <span className="hidden desktop:inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-extrabold rounded-full bg-amber-500 text-white">
                            {pendingAdminApprovalCount}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                )
              })}
            </>
          ) : (
            TEACHER_NAV_ITEMS.map(({ to, label, shortLabel, icon: Icon, tourId }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={label}
                data-tour={tourId}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative',
                    isSchedulePage
                      ? 'justify-center flex-col gap-1 py-2 px-1'
                      : 'justify-center desktop:justify-start',
                    isActive
                      ? 'bg-[#E8F0FE] dark:bg-[#1A73E8]/25 text-[#1A73E8] dark:text-[#8AB4F8] font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#282A2E] hover:text-gray-900 dark:hover:text-gray-100'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.4 : 1.9}
                      className="shrink-0"
                    />
                    {isSchedulePage ? (
                      <span className="text-[10px] leading-tight font-medium text-center">
                        {shortLabel}
                      </span>
                    ) : (
                      <>
                        <span className="text-[10px] leading-tight desktop:hidden text-center">
                          {shortLabel}
                        </span>
                        <span className="hidden desktop:inline truncate flex-1">{label}</span>
                        {to === '/classes' && activeClassesCount > 0 && (
                          <span className="hidden desktop:inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-bold rounded-full bg-gray-100 dark:bg-[#282A2E] text-gray-600 dark:text-gray-300">
                            {activeClassesCount}
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}
              </NavLink>
            ))
          )}
        </nav>

        {/* Bottom Actions: Onboarding Guide, Theme Toggle & Profile Card */}
        <div className="p-2.5 border-t border-gray-100 dark:border-[#2D2F34] flex flex-col gap-2">
          <button
            type="button"
            onClick={openOnboardingMenu}
            data-tour="btn-onboarding-help"
            title="Xem hướng dẫn sử dụng từng trang"
            aria-label="Hướng dẫn sử dụng"
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-[#1A73E8] dark:text-[#8AB4F8] bg-blue-50/70 hover:bg-blue-100/80 dark:bg-[#1A73E8]/15 dark:hover:bg-[#1A73E8]/25 transition-colors',
              isSchedulePage ? 'justify-center' : 'justify-center desktop:justify-start'
            )}
          >
            <HelpCircle size={18} className="shrink-0" />
            {!isSchedulePage && (
              <span className="hidden desktop:inline truncate">Hướng dẫn sử dụng</span>
            )}
          </button>

          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            aria-label={darkMode ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#282A2E] transition-colors',
              isSchedulePage ? 'justify-center' : 'justify-center desktop:justify-start'
            )}
          >
            {darkMode ? (
              <Sun size={18} className="text-amber-400 shrink-0" />
            ) : (
              <Moon size={18} className="text-slate-600 shrink-0" />
            )}
            {!isSchedulePage && (
              <span className="hidden desktop:inline truncate">
                {darkMode ? 'Chế độ sáng' : 'Chế độ tối'}
              </span>
            )}
          </button>

          <Link
            to="/profile"
            className={cn(
              'flex items-center gap-2.5 rounded-xl p-2 bg-gray-50 hover:bg-blue-50/60 dark:bg-[#282A2E]/70 dark:hover:bg-[#282A2E] transition-colors',
              isSchedulePage ? 'justify-center' : 'justify-center desktop:justify-start'
            )}
            title={`Mở Hồ sơ cá nhân: ${displayName} (${profile?.email || userId})`}
          >
            <div className="w-8 h-8 rounded-full bg-blue-600/15 dark:bg-blue-400/20 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center font-bold text-xs shrink-0">
              {initials}
            </div>
            {!isSchedulePage && (
              <div className="hidden desktop:block min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {displayName}
                  </span>
                  {isAdmin && (
                    <span
                      title="Quản trị viên cố định (ADMIN_EMAIL)"
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/70 text-[#1A73E8] dark:text-[#8AB4F8] shrink-0"
                    >
                      <ShieldCheck size={10} />
                      Admin
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {profile?.email || `${activeClassesCount} lớp · ${activeStudentsCount} HS`}
                </div>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setConfirmLogoutOpen(true)}
            title="Đăng xuất khỏi tài khoản"
            aria-label="Đăng xuất khỏi tài khoản"
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors',
              isSchedulePage ? 'justify-center' : 'justify-center desktop:justify-start'
            )}
          >
            <LogOut size={17} className="shrink-0" />
            {!isSchedulePage && (
              <span className="hidden desktop:inline truncate">Đăng xuất</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        className={cn(
          'flex-1 min-w-0 flex flex-col',
          !isSchedulePage && 'max-w-[1600px] w-full mx-auto'
        )}
      >
        {children}
      </main>

      {/* Mobile Bottom Navigation (< 768px) */}
      <BottomNav />

      {/* Interactive Step-by-Step Onboarding Tour */}
      <OnboardingTour />
      <HelpAssistantWidget />

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
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Thầy/cô muốn đăng xuất khỏi tài khoản <strong>{profile?.email || displayName}</strong> trên thiết bị này?
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
                  void logout().then(() => {
                    toast.success('Đã đăng xuất khỏi tài khoản.')
                  })
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
