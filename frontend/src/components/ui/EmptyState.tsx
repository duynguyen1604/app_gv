import { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-14 px-6 text-center rounded-2xl border border-dashed border-gray-200 dark:border-[#2D2F34] bg-white/50 dark:bg-[#1E1F22]/40',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-[#1A73E8] dark:text-[#8AB4F8] flex items-center justify-center mb-3.5 shadow-xs">
        {icon}
      </div>
      <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-gray-200/80 dark:bg-[#282A2E]',
        className
      )}
    />
  )
}
