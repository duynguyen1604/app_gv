import { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'

interface TopBarProps {
  title: string
  subtitle?: string
  back?: boolean
  rightContent?: ReactNode
  className?: string
}

export function TopBar({ title, subtitle, back, rightContent, className }: TopBarProps) {
  const navigate = useNavigate()
  return (
    <header className={cn(
      'sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 px-4 py-3',
      className
    )}>
      <div className="flex items-center gap-2">
        {back && (
          <button onClick={() => navigate(-1)} className="btn-icon -ml-1 text-gray-600 dark:text-gray-400">
            <ChevronLeft size={22} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 dark:text-white text-base leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
        </div>
        {rightContent && <div className="flex items-center gap-1 shrink-0">{rightContent}</div>}
      </div>
    </header>
  )
}
