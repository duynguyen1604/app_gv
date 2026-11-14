import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
        }
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

export function TurnstileWidget({
  onVerify,
}: {
  onVerify: (token: string) => void
}) {
  const publicConfig = useAuthStore((s) => s.publicConfig)
  const siteKey =
    import.meta.env.VITE_TURNSTILE_SITE_KEY ||
    publicConfig?.turnstile_site_key ||
    ''

  const containerRef = useRef<HTMLDivElement>(null)
  const [verified, setVerified] = useState(!siteKey)

  useEffect(() => {
    if (!siteKey) {
      setVerified(true)
      onVerify('dev-turnstile-ok')
      return
    }

    let widgetId: string | null = null

    const renderWidget = () => {
      if (containerRef.current && window.turnstile) {
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (token) => {
            setVerified(true)
            onVerify(token)
          },
          'expired-callback': () => {
            setVerified(false)
            onVerify('')
          },
        })
      }
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      const existingScript = document.getElementById('cf-turnstile-script')
      if (!existingScript) {
        const script = document.createElement('script')
        script.id = 'cf-turnstile-script'
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
        script.onload = renderWidget
        document.head.appendChild(script)
      } else {
        existingScript.addEventListener('load', renderWidget)
      }
    }

    return () => {
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId)
        } catch {
          // ignore
        }
      }
    }
  }, [siteKey, onVerify])

  if (!siteKey) {
    return (
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-[#1E1F22] border border-gray-200/80 dark:border-[#2D2F34] text-xs text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Bảo vệ chống spam bằng Cloudflare Turnstile</span>
        </div>
        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          Đã kiểm tra
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-1">
      <div ref={containerRef} />
      {verified && (
        <span className="sr-only">Đã xác minh Cloudflare Turnstile</span>
      )}
    </div>
  )
}

