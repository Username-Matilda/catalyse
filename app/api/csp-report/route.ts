import { prisma } from '@/lib/prisma'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const SINGLETON_ID = 1

// Browsers POST here unauthenticated whenever the page's CSP (see next.config.ts) blocks
// something, per the `report-uri` directive. Full details go to Railway logs for
// debugging; only a running count is persisted, and jobs/csp-summary.ts digests it into
// a daily email so a burst of reports can't spam admins.
export async function POST(request: Request) {
  const { allowed, retryAfterMs } = checkRateLimit(request, 'csp-report', {
    limit: 30,
    windowMs: 60_000,
  })
  if (!allowed) return rateLimitResponse(retryAfterMs)

  let violation: unknown
  try {
    const payload = await request.json()
    violation = payload?.['csp-report'] ?? (Array.isArray(payload) ? payload[0]?.body : payload)
  } catch {
    // Malformed report body; still record that something was blocked.
  }

  console.error('[CSP VIOLATION]', JSON.stringify(violation ?? {}))

  await prisma.platformSettings
    .update({ where: { id: SINGLETON_ID }, data: { cspViolationCount: { increment: 1 } } })
    .catch((e) => console.error('[CSP VIOLATION] Failed to record count:', e))

  return new Response(null, { status: 204 })
}
