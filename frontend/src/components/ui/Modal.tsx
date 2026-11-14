import React, { useState, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ModalProps {
  open?: boolean
  isOpen?: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'split'
  variant?: 'dialog' | 'drawer'
}

export function Modal({
  open,
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  className,
  size = 'md',
  variant = 'dialog',
}: ModalProps) {
  const effectiveOpen = open ?? isOpen ?? false
  const [dragOffset, setDragOffset] = useState(0)
  const touchStartY = useRef<number | null>(null)

  const sizeClass = {
    sm: 'tablet:max-w-sm',
    md: 'tablet:max-w-md',
    lg: 'tablet:max-w-2xl',
    xl: 'tablet:max-w-4xl',
    split: 'tablet:max-w-5xl',
  }[size]

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) {
      setDragOffset(delta)
    }
  }

  const handleTouchEnd = () => {
    if (dragOffset > 90) {
      setDragOffset(0)
      onClose()
    } else {
      setDragOffset(0)
    }
    touchStartY.current = null
  }

  return (
    <Dialog.Root open={effectiveOpen} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] transition-opacity duration-150" />
        <Dialog.Content
          style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
          className={cn(
            'fixed z-50 bg-white dark:bg-[#1E1F22] text-gray-900 dark:text-gray-100 shadow-2xl border border-gray-200/80 dark:border-[#37393F] focus:outline-none transition-all duration-200 flex flex-col',
            // Mobile (< 768px): Bottom sheet sliding up from bottom
            'inset-x-0 bottom-0 rounded-t-2xl max-h-[90vh] pb-safe',
            // Tablet & Desktop (>= 768px): either centered dialog OR right slide-over drawer
            variant === 'drawer'
              ? 'tablet:inset-y-0 tablet:right-0 tablet:left-auto tablet:w-full tablet:max-w-md tablet:rounded-none tablet:rounded-l-2xl tablet:max-h-screen tablet:pb-0'
              : cn(
                  'tablet:inset-auto tablet:left-1/2 tablet:top-1/2 tablet:w-[calc(100vw-3rem)] tablet:-translate-x-1/2 tablet:-translate-y-1/2 tablet:rounded-2xl tablet:max-h-[86vh] tablet:pb-0',
                  sizeClass
                ),
            className
          )}
        >
          {/* Mobile Bottom Sheet Drag Handle */}
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="tablet:hidden pt-2.5 pb-1 cursor-grab active:cursor-grabbing shrink-0"
          >
            <div className="w-10 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-3 tablet:pt-4 pb-3.5 border-b border-gray-100 dark:border-[#2D2F34] shrink-0">
            <div className="min-w-0 pr-2">
              <Dialog.Title className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Đóng hộp thoại"
                className="btn-icon text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 shrink-0"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable Body */}
          <div className="px-5 py-4 overflow-y-auto flex-1 scrollbar-thin">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
