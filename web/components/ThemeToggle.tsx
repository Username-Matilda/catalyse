'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])

  if (!mounted) return <div style={{ width: 32, height: 32 }} />

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="btn btn-ghost btn-small"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ fontSize: '1rem', padding: '6px 8px', lineHeight: 1 }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
