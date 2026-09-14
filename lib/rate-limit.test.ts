import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.useRealTimers()
})

const req = (ip?: string, header = 'x-forwarded-for') =>
  new Request('http://localhost/', { headers: ip ? { [header]: ip } : {} })

async function load(disabled = false) {
  vi.stubEnv('DISABLE_RATE_LIMIT', disabled ? 'true' : 'false')
  return import('./rate-limit')
}

describe('checkRateLimit', () => {
  it('always allows when disabled', async () => {
    const { checkRateLimit } = await load(true)
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(req('1.1.1.1'), 'r', { limit: 1, windowMs: 1000 }).allowed).toBe(true)
    }
  })

  it('limits per route and client IP inside the window, then recovers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { checkRateLimit } = await load()
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
    const { checkRateLimit } = await load()
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
  it('is a 429 with a rounded-up Retry-After', async () => {
    const { rateLimitResponse } = await load()
    const res = rateLimitResponse(1500)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('2')
  })
})
