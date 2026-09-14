import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  friendlyDate,
  toDateInputValue,
  fromDateInputValue,
} from './format-date'

afterEach(() => vi.useRealTimers())

describe('date formatting', () => {
  const d = new Date('2026-09-12T14:05:00Z')

  it('formats long, short and datetime forms from Date or string', () => {
    expect(formatDate(d)).toBe('12 September 2026')
    expect(formatDate('2026-09-12T14:05:00Z')).toBe('12 September 2026')
    expect(formatDateShort(d)).toBe('12 Sept 2026')
    expect(formatDateShort('2026-09-12T14:05:00Z')).toBe('12 Sept 2026')
    expect(formatDateTime(d)).toMatch(/12 September 2026/)
    expect(formatDateTime('2026-09-12T14:05:00Z')).toMatch(/12 September 2026/)
  })
})

describe('friendlyDate', () => {
  it('describes recent dates relatively and older ones absolutely', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T12:00:00Z'))
    const ago = (ms: number) => new Date(Date.now() - ms)
    expect(friendlyDate(ago(10_000))).toBe('just now')
    expect(friendlyDate(ago(60_000))).toBe('1 min ago')
    expect(friendlyDate(ago(5 * 60_000))).toBe('5 mins ago')
    expect(friendlyDate(ago(60 * 60_000))).toBe('1 hour ago')
    expect(friendlyDate(ago(3 * 60 * 60_000))).toBe('3 hours ago')
    expect(friendlyDate(ago(24 * 60 * 60_000))).toBe('1 day ago')
    expect(friendlyDate(ago(3 * 24 * 60 * 60_000))).toBe('3 days ago')
    expect(friendlyDate(ago(10 * 24 * 60 * 60_000).toISOString())).toMatch(/2 September 2026/)
  })
})

describe('date input conversion', () => {
  it('round-trips through yyyy-mm-dd', () => {
    expect(toDateInputValue(new Date('2026-03-04T23:00:00Z'))).toBe('2026-03-04')
    expect(toDateInputValue('2026-03-04T00:00:00Z')).toBe('2026-03-04')
    expect(toDateInputValue(null)).toBe('')
    expect(fromDateInputValue('2026-03-04')).toEqual(new Date('2026-03-04T00:00:00.000Z'))
    expect(fromDateInputValue('')).toBeNull()
  })
})
