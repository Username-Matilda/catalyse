'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import Button from '@/components/Button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])

  if (!mounted) return <div style={{ width: 32, height: 32 }} />

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      icon
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? '☀️' : '🌙'}
    </Button>
  )
}
