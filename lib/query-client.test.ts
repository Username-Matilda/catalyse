import { describe, it, expect } from 'vitest'
import { ORPCError } from '@orpc/client'
import { shouldRetry } from './query-client'

describe('shouldRetry', () => {
  it('gives up straight away on a client error', () => {
    expect(shouldRetry(0, new ORPCError('NOT_FOUND'))).toBe(false)
    expect(shouldRetry(0, new ORPCError('FORBIDDEN'))).toBe(false)
  })

  it('retries anything else three times', () => {
    expect(shouldRetry(0, new ORPCError('INTERNAL_SERVER_ERROR'))).toBe(true)
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(true)
    expect(shouldRetry(3, new TypeError('Failed to fetch'))).toBe(false)
  })
})
