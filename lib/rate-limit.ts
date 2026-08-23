import { env } from './env'

const store = new Map<string, number[]>()
const DISABLED = env.DISABLE_RATE_LIMIT

// The store is in-process, so it only limits the instance that took the request and it
// resets on deploy. Good enough for slowing down guessing and spam; it is not a shared
// quota. Entries are swept so a long-running instance doesn't accumulate one array per
// IP seen, and MAX_KEYS caps the worst case if a flood outruns the sweep.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000
const MAX_KEYS = 10_000
let lastSweep = Date.now()

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS && store.size < MAX_KEYS) return
  lastSweep = now
  const cutoff = now - windowMs
  for (const [key, timestamps] of store) {
    if (timestamps.every((t) => t <= cutoff)) store.delete(key)
  }
  // Still oversized after dropping everything stale (a flood of distinct IPs inside one
  // window): drop the oldest entries rather than growing without bound.
  if (store.size > MAX_KEYS) {
    const excess = store.size - MAX_KEYS
    let dropped = 0
    for (const key of store.keys()) {
      store.delete(key)
      if (++dropped >= excess) break
    }
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

export function checkRateLimit(
  request: Request,
  route: string,
  config: { limit: number; windowMs: number },
): { allowed: boolean; retryAfterMs: number } {
  const key = `${route}:${getClientIp(request)}`
  const { limit, windowMs } = config
  if (DISABLED) return { allowed: true, retryAfterMs: 0 }

  const now = Date.now()
  const cutoff = now - windowMs
  sweep(now, windowMs)

  let timestamps = store.get(key) ?? []
  timestamps = timestamps.filter((t) => t > cutoff)

  if (timestamps.length >= limit) {
    const retryAfterMs = timestamps[0] + windowMs - now
    store.set(key, timestamps)
    return { allowed: false, retryAfterMs }
  }

  timestamps.push(now)
  store.set(key, timestamps)
  return { allowed: true, retryAfterMs: 0 }
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
