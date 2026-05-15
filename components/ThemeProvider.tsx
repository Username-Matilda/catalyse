'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
  resolvedTheme: ResolvedTheme | undefined
}>({ theme: 'system', setTheme: () => {}, resolvedTheme: undefined })

export function useTheme() {
  return useContext(ThemeContext)
}

function resolveTheme(t: Theme): ResolvedTheme {
  if (t !== 'system') return t
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    return (localStorage.getItem('theme') as Theme) ?? 'system'
  })
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme | undefined>(undefined)

  function applyTheme(t: Theme) {
    const resolved = resolveTheme(t)
    setResolvedTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
  }

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Theme) ?? 'system'
    const resolved = resolveTheme(stored)
    // resolvedTheme starts undefined to avoid SSR/client hydration mismatch; browser APIs are unavailable on the server so this effect is the only valid place to initialise it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      setThemeState((prev) => {
        if (prev === 'system') {
          const resolved = resolveTheme('system')
          setResolvedTheme(resolved)
          document.documentElement.setAttribute('data-theme', resolved)
        }
        return prev
      })
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem('theme', t)
    applyTheme(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
