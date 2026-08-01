import type { BadgeVariant } from '@/components/Badge'

export const BUG_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't Fix" },
] as const

export const BUG_CATEGORY_OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'ux', label: 'UX Issue' },
] as const

export const BUG_STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'caution',
  in_progress: 'info',
  resolved: 'success',
  wont_fix: 'neutral',
}

export function bugStatusLabel(status: string): string {
  return BUG_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}
