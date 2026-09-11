/**
 * The visible slice of the timeline. The scope (every dated item on the chart) can run for
 * years; the window is the stretch of it the axis actually draws, so a long plan can be read
 * at a useful density without zooming out until the bars are threads.
 *
 * Two kinds of bounded window: calendar ones snap to week, fortnight and month boundaries, so
 * "this month" means the month; rolling ones run a fixed number of days forward from today.
 * Both anchor on today, falling back to the nearest end of the scope when today sits outside it
 * — otherwise a plan that has not started yet would open on an empty axis.
 */

import { addDays, diffInDays, startOfUtcDay } from '@/lib/schedule'

export type RangeKey = 'all' | 'week' | 'fortnight' | 'month' | 'd30' | 'd90' | 'd180'

type RangeSpec =
  | { kind: 'all' }
  | { kind: 'calendar'; unit: 'week' | 'fortnight' | 'month' }
  | { kind: 'rolling'; days: number }

export const RANGES: { key: RangeKey; label: string; spec: RangeSpec }[] = [
  { key: 'all', label: 'All', spec: { kind: 'all' } },
  { key: 'week', label: 'This week', spec: { kind: 'calendar', unit: 'week' } },
  { key: 'fortnight', label: 'Fortnight', spec: { kind: 'calendar', unit: 'fortnight' } },
  { key: 'month', label: 'This month', spec: { kind: 'calendar', unit: 'month' } },
  { key: 'd30', label: '30 days', spec: { kind: 'rolling', days: 30 } },
  { key: 'd90', label: '90 days', spec: { kind: 'rolling', days: 90 } },
  { key: 'd180', label: '180 days', spec: { kind: 'rolling', days: 180 } },
]

function clampDate(value: Date, min: Date, max: Date): Date {
  if (value.getTime() < min.getTime()) return min
  if (value.getTime() > max.getTime()) return max
  return value
}

/** The Monday of the week `date` falls in. Weeks run Monday to Sunday throughout. */
function startOfWeek(date: Date): Date {
  const d = startOfUtcDay(date)
  return addDays(d, -((d.getUTCDay() + 6) % 7))
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

/**
 * The window for a range preset.
 *
 * Calendar windows are exactly the week, fortnight or month around the anchor, even where that
 * runs past the ends of the scope — a month view that silently became three weeks would be
 * worse than one with empty days at the edge. Rolling windows stay inside the scope, and keep
 * their full width where it allows, so picking "90 days" late in a project still shows 90 days.
 */
export function windowFor(
  range: RangeKey,
  scopeStart: Date,
  scopeEnd: Date,
  today: Date,
): { start: Date; end: Date } {
  const start = startOfUtcDay(scopeStart)
  const end = startOfUtcDay(scopeEnd)
  const spec = RANGES.find((r) => r.key === range)?.spec ?? { kind: 'all' as const }
  if (spec.kind === 'all') return { start, end }

  const anchor = clampDate(startOfUtcDay(today), start, end)

  if (spec.kind === 'calendar') {
    if (spec.unit === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
    const weekStart = startOfWeek(anchor)
    return { start: weekStart, end: addDays(weekStart, spec.unit === 'week' ? 6 : 13) }
  }

  const days = spec.days
  // Pull the window back off the end of the scope so it keeps its full width where it can.
  const latestStart = addDays(end, -(days - 1))
  const windowStart = clampDate(
    anchor,
    start,
    latestStart.getTime() < start.getTime() ? start : latestStart,
  )
  return { start: windowStart, end: clampDate(addDays(windowStart, days - 1), start, end) }
}

/** Whole days in a window, inclusive of both ends. */
export function windowDays(start: Date, end: Date): number {
  return diffInDays(start, end) + 1
}
