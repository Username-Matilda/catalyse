'use client'

import { useEffect } from 'react'

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
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8, fontWeight: 700 }}
        >
          ×
        </button>
      )}
    </div>
  )
}
