export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Relative time for recent dates, falling back to formatDateTime() beyond a week. */
export function friendlyDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.round(diffMs / 60_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`

  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`

  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`

  return formatDateTime(d)
}

/** `Date` → the `yyyy-mm-dd` an `<input type="date">` expects. Empty string for null. */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().slice(0, 10)
}

/**
 * `<input type="date">` value → `Date`, or null when empty.
 * A bare `yyyy-mm-dd` parses as UTC midnight, which is what the scheduler works in
 * (see startOfUtcDay in lib/schedule.ts) — so a date never drifts a day by timezone.
 */
export function fromDateInputValue(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}
