'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface LocationModalContextValue {
  open: boolean
  show: () => void
  hide: () => void
}

const LocationModalContext = createContext<LocationModalContextValue | null>(null)

export function LocationModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <LocationModalContext.Provider
      value={{ open, show: () => setOpen(true), hide: () => setOpen(false) }}
    >
      {children}
    </LocationModalContext.Provider>
  )
}

export function useLocationModal() {
  const ctx = useContext(LocationModalContext)
  if (!ctx) throw new Error('useLocationModal must be used within LocationModalProvider')
  return ctx
}
