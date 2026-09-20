import { RateLimiter, type RateLimitResult } from '@/lib/rate-limit'

/**
 * Allows every request unless a test has asked for the next one to be refused, so a
 * router's rate-limited path can be exercised without filling a real window.
 * `test/setup-db.ts` installs one per test file and clears any pending refusal before
 * each test.
 */
export class FakeRateLimiter extends RateLimiter {
  private refusals: RateLimitResult[] = []

  check(): RateLimitResult {
    return this.refusals.shift() ?? { allowed: true, retryAfterMs: 0 }
  }

  /** Refuses the next check, telling the caller to retry after `retryAfterMs`. */
  denyNext(retryAfterMs = 1): void {
    this.refusals.push({ allowed: false, retryAfterMs })
  }

  reset(): void {
    this.refusals = []
  }
}

export const rateLimit = new FakeRateLimiter()
