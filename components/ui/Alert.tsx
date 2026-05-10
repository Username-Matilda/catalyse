'use client'

import { useEffect } from 'react'
import Button from '@/components/Button'

interface AlertProps {
  message: string
  type: 'success' | 'error' | 'info'
  onDismiss?: () => void
}

export default function Alert({ message, type, onDismiss }: AlertProps) {
  useEffect(() => {
    if (type === 'success' && onDismiss) {
      const t = setTimeout(onDismiss, 5000)
      return () => clearTimeout(t)
    }
  }, [type, onDismiss])

  const toastClass =
    type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : 'toast-info'

  return (
    <div role="alert" className={`toast ${toastClass}`}>
      <span>{message}</span>
      {onDismiss && (
        <Button variant="ghost" icon onClick={onDismiss} aria-label="Dismiss">×</Button>
      )}
    </div>
  )
}
