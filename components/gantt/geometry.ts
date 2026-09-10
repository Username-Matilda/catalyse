/**
 * The one place that converts between calendar dates and pixel offsets on the timeline.
 * Bars, the date header, the today line and the dependency arrows all derive their positions
 * from these helpers, so nothing can drift out of alignment.
 */

import { addDays, diffInDays, startOfUtcDay } from '@/lib/schedule'

export type ZoomLevel = 'day' | 'week' | 'month'

/** Column width in pixels for one calendar day at each zoom. */
export const PX_PER_DAY: Record<ZoomLevel, number> = {
  day: 32,
  week: 12,
  month: 4,
}

export const ROW_HEIGHT = 44
export const HEADER_HEIGHT = 40
export const BAR_HEIGHT = 16

/** Left edge, in px, of the day `date` falls on, measured from `origin`. */
export function dateToX(date: Date, origin: Date, zoom: ZoomLevel): number {
  return diffInDays(origin, date) * PX_PER_DAY[zoom]
}

/** Inclusive-span width in px for a bar running `start`..`end`. */
export function spanToWidth(start: Date, end: Date, zoom: ZoomLevel): number {
  return (diffInDays(start, end) + 1) * PX_PER_DAY[zoom]
}

/** The day a pixel offset from `origin` lands on, snapped to a whole day. */
export function xToDate(x: number, origin: Date, zoom: ZoomLevel): Date {
  return addDays(startOfUtcDay(origin), Math.round(x / PX_PER_DAY[zoom]))
}

/** Total timeline width in px for a range, with a little breathing room each side. */
export function rangeWidth(start: Date, end: Date, zoom: ZoomLevel): number {
  return (diffInDays(start, end) + 1) * PX_PER_DAY[zoom]
}

export type HeaderTick = { x: number; label: string; major: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Ticks for the date header. `day` zoom labels every day and marks month boundaries major;
 * `week` labels Mondays; `month` labels the first of each month.
 */
export function headerTicks(rangeStart: Date, rangeEnd: Date, zoom: ZoomLevel): HeaderTick[] {
  const start = startOfUtcDay(rangeStart)
  const totalDays = diffInDays(start, rangeEnd) + 1
  const ticks: HeaderTick[] = []

  for (let i = 0; i < totalDays; i++) {
    const d = addDays(start, i)
    const dom = d.getUTCDate()
    const x = i * PX_PER_DAY[zoom]

    if (zoom === 'day') {
      ticks.push({
        x,
        label: dom === 1 ? `${MONTHS[d.getUTCMonth()]} ${dom}` : String(dom),
        major: dom === 1,
      })
    } else if (zoom === 'week') {
      if (d.getUTCDay() === 1) {
        ticks.push({ x, label: `${MONTHS[d.getUTCMonth()]} ${dom}`, major: dom <= 7 })
      }
    } else if (dom === 1) {
      ticks.push({ x, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, major: true })
    }
  }
  return ticks
}
