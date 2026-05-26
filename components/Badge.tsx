import React from 'react'

const BADGE_VARIANTS = {
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  caution: 'bg-orange-200 text-amber-800 dark:bg-amber-900 dark:text-orange-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
} as const

export type BadgeVariant = keyof typeof BADGE_VARIANTS

export function badgeClasses(variant: BadgeVariant, className = '') {
  // `status-badge` is a documented e2e test selector — keep it.
  return `status-badge inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${BADGE_VARIANTS[variant]} ${className}`.trim()
}

export function Badge({
  variant = 'neutral',
  className = '',
  role,
  'aria-label': ariaLabel,
  children,
}: {
  variant?: BadgeVariant
  className?: string
  role?: string
  'aria-label'?: string
  children: React.ReactNode
}) {
  return (
    <span role={role} aria-label={ariaLabel} className={badgeClasses(variant, className)}>
      {children}
    </span>
  )
}
