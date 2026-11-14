import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  BookOpen,
  Wallet,
  Settings,
  Users,
  Ticket,
  Sliders,
  History,
  User,
} from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { cn } from '../../lib/utils'

const TEACHER_ITEMS = [
  { to: '/', label: 'Lịch', icon: CalendarDays },
  { to: '/classes', label: 'Lớp', icon: BookOpen },
  { to: '/fees', label: 'Học phí', icon: Wallet },
  { to: '/profile', label: 'Hồ sơ', icon: User },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
]

const ADMIN_ITEMS = [
  { to: '/admin?tab=accounts', tabKey: 'accounts', label: 'Tài khoản', icon: Users },
  { to: '/admin?tab=invites', tabKey: 'invites', label: 'Mã mời', icon: Ticket },
  { to: '/admin?tab=settings', tabKey: 'settings', label: 'Đăng ký', icon: Sliders },
  { to: '/admin?tab=audit', tabKey: 'audit', label: 'Nhật ký', icon: History },
  { to: '/profile', tabKey: 'profile', label: 'Hồ sơ', icon: User },
]

export function BottomNav() {
  const location = useLocation()
  const { profile, pendingAdminApprovalCount } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const currentTab = new URLSearchParams(location.search).get('tab') || 'accounts'

  return (
    <nav
      aria-label="Điều hướng chính trên điện thoại"
      className="tablet:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/88 dark:bg-[#1E1F22]/92 backdrop-blur-md border-t border-gray-200/80 dark:border-[#2D2F34] pb-safe no-print"
    >
      <div className="grid grid-cols-5 max-w-md mx-auto">
        {isAdmin
          ? ADMIN_ITEMS.map(({ to, tabKey, label, icon: Icon }) => {
              const isActive =
                tabKey === 'profile'
                  ? location.pathname === '/profile'
                  : location.pathname === '/admin' && currentTab === tabKey

              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                      navigator.vibrate(6)
                    }
                  }}
                  className={cn(
                    'bottom-nav-item relative group',
                    isActive
                      ? 'text-[#1A73E8] dark:text-[#8AB4F8] font-bold'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  )}
                >
                  <span
                    className={cn(
                      'relative flex items-center justify-center w-12 h-7 rounded-full transition-all duration-150',
                      isActive
                        ? 'bg-[#E8F0FE] dark:bg-[#1A73E8]/25 text-[#1A73E8] dark:text-[#8AB4F8]'
                        : 'group-active:bg-gray-100 dark:group-active:bg-gray-800'
                    )}
                  >
                    <Icon
                      size={19}
                      strokeWidth={isActive ? 2.5 : 1.9}
                      className={cn(isActive && 'fill-current/15')}
                    />
                    {tabKey === 'accounts' && pendingAdminApprovalCount > 0 && (
                      <span className="absolute -top-1 right-1 px-1.5 min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[10px] font-extrabold flex items-center justify-center">
                        {pendingAdminApprovalCount}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] leading-none',
                      isActive ? 'font-bold' : 'font-medium'
                    )}
                  >
                    {label}
                  </span>
                </Link>
              )
            })
          : TEACHER_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(6)
                  }
                }}
                className={({ isActive }) =>
                  cn(
                    'bottom-nav-item relative group',
                    isActive
                      ? 'text-[#1A73E8] dark:text-[#8AB4F8] font-bold'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex items-center justify-center w-12 h-7 rounded-full transition-all duration-150',
                        isActive
                          ? 'bg-[#E8F0FE] dark:bg-[#1A73E8]/25 text-[#1A73E8] dark:text-[#8AB4F8]'
                          : 'group-active:bg-gray-100 dark:group-active:bg-gray-800'
                      )}
                    >
                      <Icon
                        size={19}
                        strokeWidth={isActive ? 2.5 : 1.9}
                        className={cn(isActive && 'fill-current/15')}
                      />
                    </span>
                    <span
                      className={cn(
                        'text-[10px] leading-none',
                        isActive ? 'font-bold' : 'font-medium'
                      )}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
      </div>
    </nav>
  )
}
