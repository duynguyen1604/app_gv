import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAppStore } from './store/useAppStore'
import { BottomNav } from './components/ui/BottomNav'
import { SchedulePage } from './pages/SchedulePage'
import { ClassesPage } from './pages/ClassesPage'
import { ClassDetailPage } from './pages/ClassDetailPage'
import { FeesPage } from './pages/FeesPage'
import { SettingsPage } from './pages/SettingsPage'
import { bootstrapCloudSync, pushServerState } from './lib/backendSync'

export default function App() {
  const darkMode = useAppStore(s => s.darkMode)

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
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 max-w-lg mx-auto relative">
        <Routes>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/:classId" element={<ClassDetailPage />} />
          <Route path="/fees" element={<FeesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
        <Toaster
          position="top-center"
          toastOptions={{
            className: 'dark:bg-gray-800 dark:text-white',
            duration: 3000,
          }}
        />
      </div>
    </BrowserRouter>
  )
}

