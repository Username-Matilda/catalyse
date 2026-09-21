import { describe, it, expect } from 'vitest'
import { daysQuiet } from './staleness'

describe('daysQuiet', () => {
  const now = new Date('2026-09-21T12:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

  it('is null until a task has been quiet for more than a week', () => {
    expect(daysQuiet(daysAgo(0), now)).toBeNull()
    expect(daysQuiet(daysAgo(7), now)).toBeNull()
    expect(daysQuiet(null, now)).toBeNull()
  })

  it('counts whole days after that, from a date or an ISO string', () => {
    expect(daysQuiet(daysAgo(8), now)).toBe(8)
    expect(daysQuiet(daysAgo(30).toISOString(), now)).toBe(30)
  })

  it('measures from the current time by default', () => {
    expect(daysQuiet(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000))).toBe(10)
  })
})
