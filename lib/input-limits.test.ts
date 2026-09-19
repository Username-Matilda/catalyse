import { describe, it, expect } from 'vitest'
import { inputLimitViolation, DEFAULT_MAX_STRING, MAX_ARRAY_ITEMS } from './input-limits'

describe('inputLimitViolation', () => {
  it('passes input within the limits, whatever its shape', () => {
    expect(inputLimitViolation(undefined)).toBeNull()
    expect(inputLimitViolation(null)).toBeNull()
    expect(inputLimitViolation(42)).toBeNull()
    expect(inputLimitViolation('x'.repeat(DEFAULT_MAX_STRING))).toBeNull()
    expect(
      inputLimitViolation({
        title: 'ok',
        tasks: [{ title: 'ok', description: 'x'.repeat(20_000) }],
      }),
    ).toBeNull()
  })

  it('names the field that is too long, at any depth', () => {
    expect(inputLimitViolation('x'.repeat(DEFAULT_MAX_STRING + 1))).toBe(
      'input must be 2000 characters or fewer',
    )
    expect(inputLimitViolation({ tasks: [{ title: 'x'.repeat(2001) }] })).toBe(
      'title must be 2000 characters or fewer',
    )
    expect(inputLimitViolation({ tags: ['fine', 'x'.repeat(2001)] })).toBe(
      'tags must be 2000 characters or fewer',
    )
  })

  it('gives named fields their own, higher ceiling', () => {
    expect(inputLimitViolation({ applicationMessage: 'x'.repeat(5000) })).toBeNull()
    expect(inputLimitViolation({ applicationMessage: 'x'.repeat(5001) })).toBe(
      'applicationMessage must be 5000 characters or fewer',
    )
    expect(inputLimitViolation({ description: 'x'.repeat(20_001) })).toBe(
      'description must be 20000 characters or fewer',
    )
  })

  it('bounds arrays', () => {
    expect(inputLimitViolation({ skillIds: Array(MAX_ARRAY_ITEMS).fill(1) })).toBeNull()
    expect(inputLimitViolation({ skillIds: Array(MAX_ARRAY_ITEMS + 1).fill(1) })).toBe(
      'skillIds must have 1000 items or fewer',
    )
  })
})
