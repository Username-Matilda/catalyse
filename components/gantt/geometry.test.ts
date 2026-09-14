import { describe, expect, it } from 'vitest'
import {
  fitPxPerDay,
  dateToX,
  fitAxisDays,
  headerBands,
  headerTicks,
  markGeometry,
  pxPerDayFor,
  rangeWidth,
  spanToWidth,
  tickScale,
  weekendBands,
  xToDate,
  FIT_PAD_DAYS,
  MILESTONE_SIZE,
  PX_PER_DAY,
} from './geometry'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const ymd = (d: Date) => d.toISOString().slice(0, 10)

const origin = day('2026-03-02') // a Monday

describe('date ↔ pixel conversion', () => {
  it('measures a bar inclusively, so a one-day item is one column wide', () => {
    expect(spanToWidth(day('2026-03-02'), day('2026-03-02'), 32)).toBe(32)
    expect(spanToWidth(day('2026-03-02'), day('2026-03-04'), 32)).toBe(96)
  })

  it('round-trips a pixel offset back to the day it lands on', () => {
    expect(ymd(xToDate(dateToX(day('2026-03-09'), origin, 32), origin, 32))).toBe('2026-03-09')
  })

  it('goes negative for a date before the origin, rather than clamping silently', () => {
    expect(dateToX(day('2026-02-28'), origin, 32)).toBe(-64)
  })
})

describe('fitAxisDays', () => {
  it('pads a short plan with empty calendar rather than stretching the days', () => {
    // 10 days of work in a wide viewport: pad, but never past a week.
    expect(fitAxisDays(10, 4000)).toBe(10 + FIT_PAD_DAYS)
  })

  it('pads only as far as it needs to fill the width', () => {
    // 2000px at the 48px comfortable width wants ~42 days; 40 days of work needs 2 more.
    expect(fitAxisDays(40, 2000)).toBe(42)
  })

  it('never shrinks a plan that already overflows the width', () => {
    expect(fitAxisDays(400, 1000)).toBe(400)
  })

  it('leaves the axis alone when the viewport is not yet measured', () => {
    expect(fitAxisDays(30, 0)).toBe(30)
  })
})

describe('pxPerDayFor', () => {
  it('uses the fixed scale for a named zoom, whatever the viewport', () => {
    expect(pxPerDayFor('day', 30, 5000)).toBe(PX_PER_DAY.day)
    expect(pxPerDayFor('month', 30, 5000)).toBe(PX_PER_DAY.month)
  })

  it('divides the width across the days for a fitted axis', () => {
    expect(pxPerDayFor('fit', 20, 1000)).toBe(50)
  })

  it('holds a floor so a multi-year plan does not collapse to nothing', () => {
    expect(pxPerDayFor('fit', 5000, 1000)).toBeGreaterThanOrEqual(1.5)
  })
})

describe('tickScale', () => {
  it('labels every day only when a day is wide enough to read', () => {
    expect(tickScale(32)).toBe('day')
    expect(tickScale(12)).toBe('week')
    expect(tickScale(2)).toBe('month')
  })
})

describe('markGeometry', () => {
  const width = rangeWidth(origin, day('2026-03-31'), 32)

  it('places a bar at its start, sized to its span', () => {
    const mark = markGeometry(day('2026-03-04'), day('2026-03-06'), false, origin, 32, width)
    expect(mark).toMatchObject({ left: 64, width: 96, visible: true })
    expect(mark.clippedStart).toBe(false)
    expect(mark.clippedEnd).toBe(false)
  })

  it('centres a milestone diamond on its day rather than covering it', () => {
    const mark = markGeometry(day('2026-03-04'), day('2026-03-04'), true, origin, 32, width)
    expect(mark.width).toBe(MILESTONE_SIZE)
    // Centre of the 3rd day column (64..96) is 80; the diamond straddles it.
    expect(mark.left + MILESTONE_SIZE / 2).toBe(80)
  })

  it('cuts a bar that starts before the window and says so', () => {
    const mark = markGeometry(day('2026-02-25'), day('2026-03-04'), false, origin, 32, width)
    expect(mark.left).toBe(0)
    expect(mark.clippedStart).toBe(true)
    expect(mark.visible).toBe(true)
  })

  it('cuts a bar that runs past the window and says so', () => {
    const mark = markGeometry(day('2026-03-28'), day('2026-04-20'), false, origin, 32, width)
    expect(mark.left + mark.width).toBe(width)
    expect(mark.clippedEnd).toBe(true)
  })

  it('reports a bar wholly outside the window as not visible', () => {
    expect(
      markGeometry(day('2026-05-01'), day('2026-05-03'), false, origin, 32, width).visible,
    ).toBe(false)
    expect(
      markGeometry(day('2026-01-01'), day('2026-01-03'), false, origin, 32, width).visible,
    ).toBe(false)
  })

  it('hides a milestone whose day is outside the window, rather than half-drawing it', () => {
    expect(
      markGeometry(day('2026-05-01'), day('2026-05-01'), true, origin, 32, width).visible,
    ).toBe(false)
  })
})

describe('header ticks and bands', () => {
  it('labels each day at a day scale, marking the first of the month major', () => {
    const ticks = headerTicks(origin, day('2026-03-05'), 32)
    expect(ticks.map((t) => t.label)).toEqual(['2', '3', '4', '5'])
    expect(ticks.every((t) => !t.major)).toBe(true)
  })

  it('labels only Mondays at a week scale', () => {
    const ticks = headerTicks(origin, day('2026-03-20'), 12)
    expect(ticks.map((t) => t.label)).toEqual(['2', '9', '16'])
  })

  it('groups a day scale into months and a month scale into years', () => {
    expect(headerBands(origin, day('2026-04-05'), 32).map((b) => b.label)).toEqual([
      'Mar 2026',
      'Apr 2026',
    ])
    expect(headerBands(origin, day('2027-02-01'), 2).map((b) => b.label)).toEqual(['2026', '2027'])
  })

  it('merges a Saturday and Sunday into one shaded band', () => {
    const bands = weekendBands(origin, day('2026-03-15'), 32)
    // Two weekends in the fortnight, each drawn as a single 2-day rectangle.
    expect(bands).toHaveLength(2)
    expect(bands.every((b) => b.width === 64)).toBe(true)
  })

  it('drops weekend shading once a day is too narrow to see', () => {
    expect(weekendBands(origin, day('2026-03-15'), 4)).toEqual([])
  })
})

describe('fitPxPerDay', () => {
  it('falls back to the day scale when there is nothing to fit', () => {
    expect(fitPxPerDay(0, 900)).toBe(fitPxPerDay(10, 0))
    expect(fitPxPerDay(10, 900)).toBe(90)
  })
})
