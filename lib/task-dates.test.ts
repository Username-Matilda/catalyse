import { describe, expect, it } from 'vitest'
import {
  EMPTY_DATES,
  datesPayload,
  datesValueFrom,
  daysBetween,
  endInputValue,
  finishSentence,
  plannedEnd,
  windowReading,
  windowText,
} from './task-dates'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('task dates', () => {
  it('round-trips a task through the form and back to the API', () => {
    const value = datesValueFrom({
      startDate: day('2026-09-14'),
      durationDays: 7,
      estimatedHours: 6,
      deadline: day('2026-09-17'),
    })
    expect(value).toEqual({
      timing: 'flexible',
      startDate: '2026-09-14',
      durationDays: '7',
      estimatedHours: '6',
      deadline: '2026-09-17',
    })
    expect(datesPayload(value)).toEqual({
      timing: 'flexible',
      startDate: day('2026-09-14'),
      durationDays: 7,
      estimatedHours: 6,
      deadline: day('2026-09-17'),
    })
    expect(datesPayload(EMPTY_DATES)).toEqual({
      timing: 'flexible',
      startDate: null,
      durationDays: null,
      estimatedHours: null,
      deadline: null,
    })
    // A fixed task's dates are the commitment, so any deadline it carried is not sent.
    expect(datesPayload({ ...value, timing: 'fixed' }).deadline).toBeNull()
    expect(
      datesValueFrom({
        timing: 'fixed',
        startDate: null,
        durationDays: null,
        estimatedHours: null,
        deadline: null,
      }),
    ).toEqual({ ...EMPTY_DATES, timing: 'fixed' })
  })

  it('keeps the end date and the day count in step', () => {
    expect(endInputValue('2026-09-14', '7')).toBe('2026-09-20')
    // Empty days and a milestone both occupy their start day.
    expect(endInputValue('2026-09-14', '')).toBe('2026-09-14')
    expect(endInputValue('2026-09-14', '0')).toBe('2026-09-14')
    expect(endInputValue('', '7')).toBe('')
    expect(daysBetween('2026-09-14', '2026-09-20')).toBe(7)
    expect(daysBetween('2026-09-14', '2026-09-14')).toBe(1)
    expect(daysBetween('2026-09-14', '2026-09-13')).toBeNull()
    expect(daysBetween('', '2026-09-13')).toBeNull()
  })

  it('finds the planned end from a set start or the derived one', () => {
    const v = { ...EMPTY_DATES, durationDays: '3' }
    expect(plannedEnd({ ...v, startDate: '2026-09-14' }, null)).toEqual(day('2026-09-16'))
    expect(plannedEnd(v, day('2026-09-20'))).toEqual(day('2026-09-22'))
    expect(plannedEnd(v, null)).toBeNull()
  })

  it('relates the planned finish to the deadline', () => {
    expect(finishSentence(day('2026-09-20'), day('2026-09-17'))).toBe(
      'Planned to finish 20 Sept 2026, 3 days after the deadline.',
    )
    expect(finishSentence(day('2026-09-16'), day('2026-09-17'))).toBe(
      'Planned to finish 16 Sept 2026, 1 day before the deadline.',
    )
    expect(finishSentence(day('2026-09-17'), day('2026-09-17'))).toBe(
      'Planned to finish 17 Sept 2026, on the deadline.',
    )
  })

  it('says how to read a window', () => {
    expect(windowText(day('2026-09-14'), day('2026-09-14'))).toBe('14 Sept 2026')
    expect(windowText(day('2026-09-14'), day('2026-09-20'))).toBe('14 Sept 2026 – 20 Sept 2026')
    expect(windowReading('flexible', 7, 6)).toBe('Any time in this window, about 6 hours of work')
    expect(windowReading('flexible', 1, 1)).toBe('Any time that day, about 1 hour of work')
    expect(windowReading('flexible', 7, null)).toBe('Takes the whole window')
    expect(windowReading('flexible', 1, null)).toBe('Takes the day')
    expect(windowReading('fixed', 2, 4)).toBe('On these dates, about 4 hours of work')
    expect(windowReading('fixed', 1, null)).toBe('On this day')
    expect(windowReading('fixed', 0, 4)).toBe('A moment, not a stretch of work')
  })
})
