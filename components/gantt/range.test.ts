import { describe, expect, it } from 'vitest'
import { windowDays, windowFor } from './range'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const ymd = (d: Date) => d.toISOString().slice(0, 10)

const scopeStart = day('2026-03-02')
const scopeEnd = day('2026-12-31')
const today = day('2026-06-10') // a Wednesday, inside the scope

const win = (range: Parameters<typeof windowFor>[0], now = today) => {
  const w = windowFor(range, scopeStart, scopeEnd, now)
  return [ymd(w.start), ymd(w.end)] as const
}

describe('windowFor', () => {
  it('shows the whole scope for "all"', () => {
    expect(win('all')).toEqual(['2026-03-02', '2026-12-31'])
  })

  it('snaps "this week" to the Monday and Sunday around today', () => {
    expect(win('week')).toEqual(['2026-06-08', '2026-06-14'])
  })

  it('runs a fortnight from the same Monday', () => {
    expect(win('fortnight')).toEqual(['2026-06-08', '2026-06-21'])
  })

  it('snaps "this month" to the calendar month, not thirty days from today', () => {
    expect(win('month')).toEqual(['2026-06-01', '2026-06-30'])
  })

  it('keeps a calendar window whole even where it overruns the scope', () => {
    // A scope of a single midweek day still shows the entire month around it.
    const w = windowFor('month', day('2026-06-10'), day('2026-06-10'), today)
    expect([ymd(w.start), ymd(w.end)]).toEqual(['2026-06-01', '2026-06-30'])
  })

  it('runs a rolling window forward from today', () => {
    expect(win('d30')).toEqual(['2026-06-10', '2026-07-09'])
    expect(win('d90')).toEqual(['2026-06-10', '2026-09-07'])
    expect(win('d180')).toEqual(['2026-06-10', '2026-12-06'])
  })

  it('pulls a rolling window back so it keeps its full width near the end of the scope', () => {
    // 20 days left, but "90 days" should still show 90 days of calendar.
    expect(win('d90', day('2026-12-11'))).toEqual(['2026-10-03', '2026-12-31'])
    const late = windowFor('d90', scopeStart, scopeEnd, day('2026-12-11'))
    expect(windowDays(late.start, late.end)).toBe(90)
  })

  it('anchors on the scope start when today is before the whole plan', () => {
    expect(win('d30', day('2020-01-01'))).toEqual(['2026-03-02', '2026-03-31'])
  })

  it('anchors on the scope end when today is past the whole plan', () => {
    // Clamped to the end, then pulled back to keep 30 days of width.
    expect(win('d30', day('2030-01-01'))).toEqual(['2026-12-02', '2026-12-31'])
  })

  it('never returns a window shorter than the scope allows for a rolling range', () => {
    const shortScope = windowFor('d90', day('2026-06-01'), day('2026-06-05'), today)
    expect(ymd(shortScope.start)).toBe('2026-06-01')
    expect(ymd(shortScope.end)).toBe('2026-06-05')
  })
})

describe('windowDays', () => {
  it('counts both ends, so a single day is one day', () => {
    expect(windowDays(day('2026-06-10'), day('2026-06-10'))).toBe(1)
    expect(windowDays(day('2026-06-10'), day('2026-06-12'))).toBe(3)
  })
})
