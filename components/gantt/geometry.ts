/**
 * The one place that converts between calendar dates and pixel offsets on the timeline.
 * Bars, the date header, the today line and the dependency arrows all derive their positions
 * from these helpers, so nothing can drift out of alignment.
 *
 * Everything here takes a `pxPerDay` scale rather than a named zoom, because "Fit" has to pick
 * whatever scale makes the visible range fill the container. The named zooms are just three
 * fixed values of the same number, and label density follows from the scale (see `tickScale`)
 * rather than from which button is pressed.
 */

import { addDays, diffInDays, startOfUtcDay } from '@/lib/schedule'

export type ZoomLevel = 'fit' | 'day' | 'week' | 'month'

/** Column width in pixels for one calendar day at each fixed zoom. */
export const PX_PER_DAY: Record<Exclude<ZoomLevel, 'fit'>, number> = {
  day: 32,
  week: 12,
  month: 4,
}

/** Floor for the fitted scale, so a multi-year plan does not collapse into a smear. */
const FIT_MIN_PX_PER_DAY = 1.5
/** Day width past which showing more calendar beats stretching each day further. */
const FIT_COMFORTABLE_PX_PER_DAY = 48
/** Empty calendar a fitted axis may add past the last item before it just stretches instead. */
export const FIT_PAD_DAYS = 7

/**
 * Days a fitted axis should draw. A short plan first fills the width with up to a week of empty
 * calendar past its last item — headroom to schedule into — and only stretches the day columns
 * once that week is used up, so the axis never trails off into dead space.
 */
export function fitAxisDays(scopedDays: number, availableWidth: number): number {
  if (availableWidth <= 0) return scopedDays
  const daysThatFill = Math.ceil(availableWidth / FIT_COMFORTABLE_PX_PER_DAY)
  return Math.max(scopedDays, Math.min(daysThatFill, scopedDays + FIT_PAD_DAYS))
}

export const ROW_HEIGHT = 44
/** The header is two tiers: a calendar band on top, the tick labels underneath. */
export const HEADER_BAND_HEIGHT = 20
export const HEADER_TICK_HEIGHT = 24
export const HEADER_HEIGHT = HEADER_BAND_HEIGHT + HEADER_TICK_HEIGHT
export const BAR_HEIGHT = 18
/** Height of the thin planned/actual rules drawn above and below the bar. */
export const RULE_HEIGHT = 4

/** How wide one day must be before a given label density is worth drawing. */
const DAY_LABEL_MIN_PX = 18
const WEEK_LABEL_MIN_PX = 3.5
/** Below this, weekend shading is thinner than the grid lines and just muddies the chart. */
const WEEKEND_SHADING_MIN_PX = 10

/**
 * The scale that fills `availableWidth` with `totalDays`. Only the floor is enforced: the day
 * count has already been padded by `fitAxisDays`, so whatever is left to stretch is deliberate.
 */
export function fitPxPerDay(totalDays: number, availableWidth: number): number {
  if (totalDays <= 0 || availableWidth <= 0) return PX_PER_DAY.day
  return Math.max(FIT_MIN_PX_PER_DAY, availableWidth / totalDays)
}

/** Pixels per day for the chosen zoom; `fit` derives its own from the range and the viewport. */
export function pxPerDayFor(zoom: ZoomLevel, totalDays: number, availableWidth: number): number {
  return zoom === 'fit' ? fitPxPerDay(totalDays, availableWidth) : PX_PER_DAY[zoom]
}

/** How densely the header can label itself at this scale. */
export function tickScale(pxPerDay: number): 'day' | 'week' | 'month' {
  if (pxPerDay >= DAY_LABEL_MIN_PX) return 'day'
  if (pxPerDay >= WEEK_LABEL_MIN_PX) return 'week'
  return 'month'
}

/** Left edge, in px, of the day `date` falls on, measured from `origin`. */
export function dateToX(date: Date, origin: Date, pxPerDay: number): number {
  return diffInDays(origin, date) * pxPerDay
}

/** Inclusive-span width in px for a bar running `start`..`end`. */
export function spanToWidth(start: Date, end: Date, pxPerDay: number): number {
  return (diffInDays(start, end) + 1) * pxPerDay
}

/** Side length of the square that, rotated 45°, becomes a milestone diamond. */
export const MILESTONE_SIZE = 13

/** The painted box for one item, and which of its ends the visible window cut off. */
export type Mark = {
  left: number
  width: number
  /** True when the item really starts before the window, so its left edge is a cut, not a start. */
  clippedStart: boolean
  clippedEnd: boolean
  /** False when the item lies entirely outside the window and should not be drawn at all. */
  visible: boolean
}

/**
 * The box the chart actually paints for one item, in px from `origin`, clamped to the visible
 * window. A milestone is a fixed diamond centred on its start day rather than a bar covering it,
 * so zero-duration work stays visible at every scale instead of collapsing to a sliver. Bars,
 * the dependency arrows and the drag handles all read their positions from here, so the three
 * can never disagree.
 *
 * `totalWidth` is the window's full width in px. A bar running past either end is cut there and
 * flagged, which is what lets the chart square off the cut edge instead of implying the work
 * stops at the fold.
 */
export function markGeometry(
  start: Date,
  end: Date,
  isMilestone: boolean,
  origin: Date,
  pxPerDay: number,
  totalWidth: number,
): Mark {
  const rawLeft = dateToX(start, origin, pxPerDay)

  if (isMilestone) {
    const left = rawLeft + pxPerDay / 2 - MILESTONE_SIZE / 2
    // A diamond is a point in time: it is either in the window or it is not, never half-drawn.
    const centre = rawLeft + pxPerDay / 2
    return {
      left,
      width: MILESTONE_SIZE,
      clippedStart: false,
      clippedEnd: false,
      visible: centre >= 0 && centre <= totalWidth,
    }
  }

  const rawRight = rawLeft + spanToWidth(start, end, pxPerDay)
  const left = Math.max(rawLeft, 0)
  const right = Math.min(rawRight, totalWidth)
  return {
    left,
    width: right - left,
    clippedStart: rawLeft < 0,
    clippedEnd: rawRight > totalWidth,
    visible: right > 0 && left < totalWidth,
  }
}

/** The day a pixel offset from `origin` lands on, snapped to a whole day. */
export function xToDate(x: number, origin: Date, pxPerDay: number): Date {
  return addDays(startOfUtcDay(origin), Math.round(x / pxPerDay))
}

/** Total timeline width in px for a range. */
export function rangeWidth(start: Date, end: Date, pxPerDay: number): number {
  return (diffInDays(start, end) + 1) * pxPerDay
}

export type HeaderTick = { x: number; label: string; major: boolean }
/** A labelled stretch of the top header tier — a month at day/week scale, a year at month scale. */
export type HeaderBand = { x: number; width: number; label: string }
/** A shaded stretch of non-working days behind the bars. */
export type WeekendBand = { x: number; width: number }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Saturday or Sunday, in UTC — the timeline's day grid is UTC throughout. */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

/** Single-letter weekday initial, for the day-scale tick labels. */
export function weekdayInitial(date: Date): string {
  return WEEKDAYS[date.getUTCDay()]
}

/**
 * Ticks for the lower header tier. A day scale labels every day, a week scale labels Mondays and
 * a month scale labels the first of each month. `major` marks the boundary that starts a new band.
 */
export function headerTicks(rangeStart: Date, rangeEnd: Date, pxPerDay: number): HeaderTick[] {
  const start = startOfUtcDay(rangeStart)
  const totalDays = diffInDays(start, rangeEnd) + 1
  const scale = tickScale(pxPerDay)
  const ticks: HeaderTick[] = []

  for (let i = 0; i < totalDays; i++) {
    const d = addDays(start, i)
    const dom = d.getUTCDate()
    const x = i * pxPerDay

    if (scale === 'day') {
      ticks.push({ x, label: String(dom), major: dom === 1 })
    } else if (scale === 'week') {
      if (d.getUTCDay() === 1) ticks.push({ x, label: String(dom), major: dom <= 7 })
    } else if (dom === 1) {
      ticks.push({ x, label: MONTHS[d.getUTCMonth()], major: d.getUTCMonth() === 0 })
    }
  }
  return ticks
}

/**
 * Bands for the upper header tier. Day and week scales group ticks by month; a month scale groups
 * them by year. Each band spans from its first day to the day before the next band starts, so
 * a partial month at either end of the range still gets a correctly sized label.
 */
export function headerBands(rangeStart: Date, rangeEnd: Date, pxPerDay: number): HeaderBand[] {
  const start = startOfUtcDay(rangeStart)
  const totalDays = diffInDays(start, rangeEnd) + 1
  const monthly = tickScale(pxPerDay) === 'month'
  const bands: HeaderBand[] = []

  for (let i = 0; i < totalDays; i++) {
    const d = addDays(start, i)
    const label = monthly
      ? String(d.getUTCFullYear())
      : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    const last = bands[bands.length - 1]
    if (last && last.label === label) {
      last.width += pxPerDay
    } else {
      bands.push({ x: i * pxPerDay, width: pxPerDay, label })
    }
  }
  return bands
}

/**
 * Contiguous weekend stretches, merged into single bands so the grid paints one rectangle per
 * weekend rather than two. Only worth drawing where a day is wide enough to read.
 */
export function weekendBands(rangeStart: Date, rangeEnd: Date, pxPerDay: number): WeekendBand[] {
  if (pxPerDay < WEEKEND_SHADING_MIN_PX) return []
  const start = startOfUtcDay(rangeStart)
  const totalDays = diffInDays(start, rangeEnd) + 1
  const bands: WeekendBand[] = []

  for (let i = 0; i < totalDays; i++) {
    if (!isWeekend(addDays(start, i))) continue
    const last = bands[bands.length - 1]
    if (last && last.x + last.width === i * pxPerDay) {
      last.width += pxPerDay
    } else {
      bands.push({ x: i * pxPerDay, width: pxPerDay })
    }
  }
  return bands
}
