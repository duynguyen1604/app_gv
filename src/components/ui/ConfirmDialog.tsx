import { Modal } from './Modal'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Xác nhận', confirmVariant = 'danger' }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <AlertTriangle className="shrink-0 text-amber-500 mt-0.5" size={20} />
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Hủy</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
