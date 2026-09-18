import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  InMemoryRateLimiter,
  DisabledRateLimiter,
  createRateLimiter,
  rateLimiter,
  setRateLimiter,
  checkRateLimit,
  rateLimitResponse,
  type RateLimitConfig,
} from './rate-limit'
import { rateLimit } from '@/test/fakes/rate-limit'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

const req = (ip?: string, header = 'x-forwarded-for') =>
  new Request('http://localhost/', { headers: ip ? { [header]: ip } : {} })

/** A fresh in-memory limiter's check, so each test starts with an empty store. */
function load() {
  const limiter = new InMemoryRateLimiter()
  return (request: Request, route: string, config: RateLimitConfig) =>
    limiter.check(request, route, config)
}

describe('checkRateLimit', () => {
  it('is disabled or in-memory according to the environment, and swappable', () => {
    vi.stubEnv('DISABLE_RATE_LIMIT', 'true')
    expect(createRateLimiter()).toBeInstanceOf(DisabledRateLimiter)
    vi.stubEnv('DISABLE_RATE_LIMIT', 'false')
    expect(createRateLimiter()).toBeInstanceOf(InMemoryRateLimiter)

    expect(setRateLimiter(undefined)).toBe(rateLimit)
    const fromEnv = rateLimiter()
    expect(fromEnv).toBeInstanceOf(InMemoryRateLimiter)
    expect(rateLimiter()).toBe(fromEnv)
    expect(setRateLimiter(rateLimit)).toBe(fromEnv)
  })

  it('always allows when disabled', () => {
    const limiter = new DisabledRateLimiter()
    for (let i = 0; i < 5; i++) {
      expect(limiter.check().allowed).toBe(true)
    }
  })

  it('refuses through the fake only when asked', () => {
    const cfg = { limit: 1, windowMs: 1000 }
    expect(checkRateLimit(req('1.1.1.1'), 'r', cfg).allowed).toBe(true)
    rateLimit.denyNext(7)
    expect(checkRateLimit(req('1.1.1.1'), 'r', cfg)).toEqual({ allowed: false, retryAfterMs: 7 })
    expect(checkRateLimit(req('1.1.1.1'), 'r', cfg).allowed).toBe(true)
  })

  it('limits per route and client IP inside the window, then recovers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const checkRateLimit = load()
    const cfg = { limit: 2, windowMs: 1000 }
    expect(checkRateLimit(req('1.1.1.1, proxy'), 'login', cfg).allowed).toBe(true)
    expect(checkRateLimit(req('1.1.1.1'), 'login', cfg).allowed).toBe(true)
    const blocked = checkRateLimit(req('1.1.1.1'), 'login', cfg)
    expect(blocked).toEqual({ allowed: false, retryAfterMs: 1000 })
    // A different route and a different IP are separate buckets.
    expect(checkRateLimit(req('1.1.1.1'), 'signup', cfg).allowed).toBe(true)
    expect(checkRateLimit(req('2.2.2.2', 'x-real-ip'), 'login', cfg).allowed).toBe(true)
    expect(checkRateLimit(req(), 'login', cfg).allowed).toBe(true)
    vi.advanceTimersByTime(1001)
    expect(checkRateLimit(req('1.1.1.1'), 'login', cfg).allowed).toBe(true)
  })

  it('sweeps stale keys after the sweep interval and caps the store size', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const checkRateLimit = load()
    const cfg = { limit: 1, windowMs: 1000 }
    checkRateLimit(req('stale'), 'r', cfg)
    vi.advanceTimersByTime(11 * 60 * 1000)
    // The sweep runs on this call and drops the stale key, so it starts fresh.
    checkRateLimit(req('fresh'), 'r', cfg)
    expect(checkRateLimit(req('stale'), 'r', cfg).allowed).toBe(true)

    // Flood: more distinct live keys than MAX_KEYS forces the overflow drop.
    for (let i = 0; i < 10_001; i++) checkRateLimit(req(`flood-${i}`), 'r', cfg)
    expect(checkRateLimit(req('flood-0'), 'r', cfg).allowed).toBe(true)
  })
})

describe('rateLimitResponse', () => {
  it('is a 429 with a rounded-up Retry-After', () => {
    const res = rateLimitResponse(1500)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('2')
  })
})
