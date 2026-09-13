import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notify'

const SINGLETON_ID = 1
const SEND_INTERVAL_MS = 24 * 60 * 60 * 1000

export async function runCspSummaryJob(): Promise<Record<string, unknown>> {
  const settings = await prisma.platformSettings.findUniqueOrThrow({ where: { id: SINGLETON_ID } })

  if (settings.cspViolationCount === 0) return { skipped: true, reason: 'no violations recorded' }

  const dueSince = settings.cspSummaryLastSentAt
    ? Date.now() - settings.cspSummaryLastSentAt.getTime()
    : Infinity
  if (dueSince < SEND_INTERVAL_MS) return { skipped: true, reason: 'not due yet' }

  const count = settings.cspViolationCount
  const admins = await prisma.volunteer.findMany({
    where: { isTechnicalAdmin: true, deletedAt: null },
    select: { id: true },
  })

  const plural = count === 1 ? 'violation' : 'violations'
  const title = `${count} CSP ${plural} reported today`
  const body = `The browser reported ${count} Content-Security-Policy ${plural} in the last day. Check Railway logs (search "[CSP VIOLATION]") for the blocked URLs and directives.`

  let sent = 0
  for (const admin of admins) {
    await notifyUser(admin.id, 'csp_violation_summary', title, body, '/admin', {
      subject: title,
      message: body,
      ctaLabel: 'Open Admin Dashboard',
      ctaUrl: '/admin',
    }).catch((e) => console.error('[CSP SUMMARY] Notify failed:', e))
    sent++
  }

  await prisma.platformSettings.update({
    where: { id: SINGLETON_ID },
    data: { cspViolationCount: 0, cspSummaryLastSentAt: new Date() },
  })

  return { sent, count }
}
