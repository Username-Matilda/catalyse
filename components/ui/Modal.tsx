'use client'

import { useEffect } from 'react'
import Button from '@/components/Button'

interface ModalProps {
  id: string
  title: string
  children: React.ReactNode
  isOpen: boolean
  onClose: () => void
}

export default function Modal({ id, title, children, isOpen, onClose }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        id={id}
        className="bg-surface max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={`${id}-title`} style={{ margin: 0, lineHeight: 1 }}>
            {title}
          </h2>
          <Button variant="ghost" icon onClick={onClose} aria-label="Close">
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}
