import { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-gray-300 dark:text-gray-700 mb-4">{icon}</div>
      <h3 className="font-semibold text-gray-600 dark:text-gray-400 text-sm mb-1">{title}</h3>
      {description && <p className="text-xs text-gray-400 dark:text-gray-600 mb-4">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
