import { ReactNode, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { saveAuthReturnToPath } from '../../lib/supabase'
import { PendingApprovalPage } from '../../pages/auth/PendingApprovalPage'
import { LockedAccountPage } from '../../pages/auth/LockedAccountPage'
import { VerifyEmailPage } from '../../pages/auth/VerifyEmailPage'
import { SessionExpiredBanner } from './SessionExpiredBanner'

export function AuthGuard({ children }: { children: ReactNode }) {
  const location = useLocation()
  const {
    profile,
    isInitialized,
    isLoading,
    initializeAuth,
    refreshSessionSilently,
  } = useAuthStore()

  useEffect(() => {
    if (!isInitialized) {
      void initializeAuth()
    }
  }, [isInitialized, initializeAuth])

  // iPhone PWA & Desktop silent session refresh on app resume / interval (Section 4.2)
  useEffect(() => {
    if (!profile) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshSessionSilently()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    const interval = setInterval(() => {
      void refreshSessionSilently()
    }, 10 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(interval)
    }
  }, [profile, refreshSessionSilently])

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[var(--bg-app)] text-[var(--text-primary)] gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#1A73E8] text-white flex items-center justify-center shadow-md animate-pulse">
          <GraduationCap size={26} />
        </div>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Đang tải phiên đăng nhập...
        </div>
      </div>
    )
  }

  if (!profile) {
    saveAuthReturnToPath(location.pathname + location.search)
    return <Navigate to="/auth/login" replace />
  }

  if (!profile.email_verified) {
    return <VerifyEmailPage />
  }

  if (profile.status === 'locked') {
    return <LockedAccountPage />
  }

  if (profile.status === 'pending' && profile.role !== 'admin') {
    return <PendingApprovalPage />
  }

  return (
    <>
      <SessionExpiredBanner />
      {children}
    </>
  )
}

