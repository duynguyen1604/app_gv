import { Modal } from './Modal'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open?: boolean
  isOpen?: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  confirmText?: string
  confirmVariant?: 'danger' | 'primary' | 'warning'
  variant?: 'danger' | 'primary' | 'warning'
}

export function ConfirmDialog({
  open,
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  confirmText,
  confirmVariant,
  variant,
}: ConfirmDialogProps) {
  const effectiveOpen = open ?? isOpen ?? false
  const label = confirmLabel || confirmText || 'Xác nhận'
  const v = confirmVariant || variant || 'danger'

  return (
    <Modal open={effectiveOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <AlertTriangle className="shrink-0 text-amber-500 mt-0.5" size={20} />
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Hủy</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={v === 'danger' ? 'btn-danger' : 'btn-primary'}
          >
            {label}
          </button>
        </div>
      </div>
    </Modal>
  )
}
