import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAppStore } from './store/useAppStore'
import { useAuthStore } from './store/useAuthStore'
import { AppShell } from './components/layout/AppShell'
import { AuthGuard } from './components/auth/AuthGuard'
import { SchedulePage } from './pages/SchedulePage'
import { ClassesPage } from './pages/ClassesPage'
import { ClassDetailPage } from './pages/ClassDetailPage'
import { FeesPage } from './pages/FeesPage'
import { SettingsPage } from './pages/SettingsPage'
import { ProfilePage } from './pages/ProfilePage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage'
import { AuthCallbackPage } from './pages/auth/AuthCallbackPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { bootstrapCloudSync, pushServerState } from './lib/backendSync'

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || 'Lỗi hiển thị giao diện' }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#1E1F22] p-6">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#282A2E] border border-gray-200 dark:border-[#37393F] shadow-xl p-6 text-center space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Đã xảy ra lỗi hiển thị dữ liệu
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {this.state.errorMessage}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' })
                  window.location.reload()
                }}
                className="px-4 py-2 rounded-xl bg-[#1A73E8] text-white text-xs font-bold hover:bg-[#1557B0]"
              >
                Tải lại trang
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RoleAwareHomeRedirect() {
  const profile = useAuthStore((s) => s.profile)
  if (profile?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }
  return <SchedulePage />
}

export default function App() {
  const darkMode = useAppStore((s) => s.darkMode)

  // Apply dark mode class to <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let ready = false

    void bootstrapCloudSync().then(() => {
      ready = true
    })

    const unsubscribe = useAppStore.subscribe(() => {
      if (!ready) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const userId = useAppStore.getState().userId
        void pushServerState(userId).catch(() => undefined)
      }, 1500)
    })

    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes (Section 3) */}
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />

          {/* Protected App Routes */}
          <Route
            path="/*"
            element={
              <AuthGuard>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<RoleAwareHomeRedirect />} />
                    <Route path="/admin" element={<AdminDashboardPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/schedule" element={<SchedulePage />} />
                    <Route path="/classes" element={<ClassesPage />} />
                    <Route path="/classes/:classId" element={<ClassDetailPage />} />
                    <Route path="/fees" element={<FeesPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
              </AuthGuard>
            }
          />
        </Routes>
        <Toaster
          position="top-center"
          toastOptions={{
            className:
              'dark:bg-[#282A2E] dark:text-gray-100 text-xs font-medium rounded-xl shadow-lg border border-gray-100 dark:border-[#37393F]',
            duration: 3000,
          }}
        />
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
