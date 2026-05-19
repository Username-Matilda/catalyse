import { env } from './env'

const store = new Map<string, number[]>()
const DISABLED = env.DISABLE_RATE_LIMIT

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
