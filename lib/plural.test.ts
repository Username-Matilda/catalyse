import { describe, it, expect } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('drops the plural for one', () => {
    expect(plural(1, 'day')).toBe('1 day')
  })

  it('pluralises zero and many', () => {
    expect(plural(0, 'day')).toBe('0 days')
    expect(plural(31, 'day')).toBe('31 days')
  })
})
