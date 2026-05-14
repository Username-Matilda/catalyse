'use client'
import { useTheme } from '@/components/ThemeProvider'
import Button from '@/components/Button'

export function ThemeToggle({
  icon = true,
  size = 'sm',
  className,
}: {
  icon?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { resolvedTheme, setTheme } = useTheme()

  if (!resolvedTheme) return <div style={{ width: 32, height: 32 }} />

  const isDark = resolvedTheme === 'dark'

  const targetDark = !isDark
  const style = {
    backgroundColor: targetDark ? '#374151' : '#d1d5db',
    color: targetDark ? '#e5e7eb' : '#374151',
  }

  return (
    <Button
      variant="ghost"
      icon={icon}

      size={size}
      className={className}
      style={style}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {targetDark ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}

    </Button>
  )
}
