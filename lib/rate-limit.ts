import { env } from './env'

export type RateLimitConfig = { limit: number; windowMs: number }
export type RateLimitResult = { allowed: boolean; retryAfterMs: number }

/**
 * Decides whether a request may proceed. Routers call whichever limiter `rateLimiter()`
 * returns; tests swap in their own with `setRateLimiter`.
 */
export abstract class RateLimiter {
  abstract check(request: Request, route: string, config: RateLimitConfig): RateLimitResult
}

/**
 * Sliding-window limiter keyed by route and client IP. The store is in-process, so it only
 * limits the instance that took the request and it resets on deploy. Good enough for
 * slowing down guessing and spam; it is not a shared quota. Entries are swept so a
 * long-running instance doesn't accumulate one array per IP seen, and MAX_KEYS caps the
 * worst case if a flood outruns the sweep.
 */
export class InMemoryRateLimiter extends RateLimiter {
  private static readonly SWEEP_INTERVAL_MS = 10 * 60 * 1000
  private static readonly MAX_KEYS = 10_000
  private readonly store = new Map<string, number[]>()
  private lastSweep = Date.now()

  private sweep(now: number, windowMs: number): void {
    const { SWEEP_INTERVAL_MS, MAX_KEYS } = InMemoryRateLimiter
    if (now - this.lastSweep < SWEEP_INTERVAL_MS && this.store.size < MAX_KEYS) return
    this.lastSweep = now
    const cutoff = now - windowMs
    for (const [key, timestamps] of this.store) {
      if (timestamps.every((t) => t <= cutoff)) this.store.delete(key)
    }
    // Still oversized after dropping everything stale (a flood of distinct IPs inside one
    // window): drop the oldest entries rather than growing without bound.
    if (this.store.size > MAX_KEYS) {
      const excess = this.store.size - MAX_KEYS
      let dropped = 0
      for (const key of this.store.keys()) {
        this.store.delete(key)
        if (++dropped >= excess) break
      }
    }
  }

  check(request: Request, route: string, { limit, windowMs }: RateLimitConfig): RateLimitResult {
    const key = `${route}:${getClientIp(request)}`
    const now = Date.now()
    const cutoff = now - windowMs
    this.sweep(now, windowMs)

    let timestamps = this.store.get(key) ?? []
    timestamps = timestamps.filter((t) => t > cutoff)

    if (timestamps.length >= limit) {
      const retryAfterMs = timestamps[0] + windowMs - now
      this.store.set(key, timestamps)
      return { allowed: false, retryAfterMs }
    }

    timestamps.push(now)
    this.store.set(key, timestamps)
    return { allowed: true, retryAfterMs: 0 }
  }
}

/** Development limiter: lets everything through. */
export class DisabledRateLimiter extends RateLimiter {
  check(): RateLimitResult {
    return { allowed: true, retryAfterMs: 0 }
  }
}

// Trusts x-forwarded-for, which is only meaningful because the app is served behind a
// proxy (Railway) that overwrites it. Reachable directly, this header is caller-supplied
// and a client can rotate it to reset its own limit.
function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

export function createRateLimiter(disabled = env.DISABLE_RATE_LIMIT): RateLimiter {
  return disabled ? new DisabledRateLimiter() : new InMemoryRateLimiter()
}

let current: RateLimiter | undefined

/** The process-wide limiter, built from the environment on first use. */
export function rateLimiter(): RateLimiter {
  return (current ??= createRateLimiter())
}

/**
 * Replaces the process-wide limiter; `undefined` makes the next call rebuild it from the
 * environment. Returns the previous limiter so a caller can restore it.
 */
export function setRateLimiter(limiter: RateLimiter | undefined): RateLimiter | undefined {
  const previous = current
  current = limiter
  return previous
}

export function checkRateLimit(
  request: Request,
  route: string,
  config: RateLimitConfig,
): RateLimitResult {
  return rateLimiter().check(request, route, config)
}

export function rateLimitResponse(retryAfterMs: number): Response {
  return Response.json(
    { detail: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
    },
  )
}
