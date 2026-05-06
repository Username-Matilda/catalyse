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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div id={id} className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id={`${id}-title`}>{title}</h2>
          <Button variant="ghost" icon onClick={onClose} aria-label="Close">×</Button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
