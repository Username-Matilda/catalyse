'use client'

import Button from '@/components/Button'
import Modal from '@/components/ui/Modal'

interface ConfirmDialogProps {
  id?: string
  isOpen: boolean
  title: string
  body: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
  /** Disables both buttons and shows `busyLabel` while the action runs. */
  busy?: boolean
  busyLabel?: string
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  id = 'confirm-dialog',
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  busyLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal id={id} title={title} isOpen={isOpen} onClose={onClose}>
      <div className="text-text-light">{body}</div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
