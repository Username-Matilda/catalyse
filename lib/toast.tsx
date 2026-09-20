'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Button from '@/components/Button'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
  visible: boolean
  hiding: boolean
}

type ShowToast = (message: string, type?: ToastType) => void

const ToastContext = createContext<ShowToast>(() => {})

const TYPE_CLASSES: Record<ToastType, string> = {
  error: 'bg-red-50   text-red-900   dark:bg-red-950   dark:text-red-200',
  success: 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200',
  info: 'bg-blue-50  text-blue-900  dark:bg-blue-950  dark:text-blue-200',
}

const ICONS: Record<ToastType, React.ReactNode> = {
  error: (
    <svg
      className="shrink-0 text-red-500"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  success: (
    <svg
      className="shrink-0 text-green-500"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  info: (
    <svg
      className="shrink-0 text-blue-500"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  ),
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Every animation and auto-dismiss timer, so none outlives the provider.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const nextId = useRef(0)
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const schedule = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      fn()
    }, ms)
    timers.current.add(timer)
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, hiding: true } : t)))
      schedule(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 220)
    },
    [schedule],
  )

  const show = useCallback<ShowToast>(
    (message, type = 'info') => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, type, visible: false, hiding: false }])
      schedule(
        () => setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t))),
        10,
      )
      schedule(() => dismiss(id), 4000)
    },
    [dismiss, schedule],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2.5 w-[360px] pointer-events-none max-sm:w-[calc(100vw-24px)] max-sm:bottom-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={[
              'pointer-events-auto px-4 py-3 rounded-xl text-sm font-medium leading-snug shadow-md',
              'flex items-center justify-between gap-3',
              'transition-all duration-200 ease-in-out',
              t.visible && !t.hiding ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2.5',
              TYPE_CLASSES[t.type],
            ].join(' ')}
          >
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <Button variant="ghost" icon onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
