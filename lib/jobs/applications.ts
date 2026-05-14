import { prisma } from '@/lib/prisma'
import { sendPendingApplicationsSummaryEmail } from '@/lib/email'

export async function runApplicationsSummaryJob(): Promise<Record<string, unknown>> {
  const count = await prisma.volunteer.count({
    where: { approvalStatus: 'PENDING', deletedAt: null },
  })

  if (!count) return { skipped: true, reason: 'no pending applications' }

  const admins = await prisma.volunteer.findMany({
    where: { isAdmin: true, deletedAt: null },
    select: { name: true, email: true },
  })

  let sent = 0
  for (const admin of admins) {
    if (admin.email) {
      await sendPendingApplicationsSummaryEmail(admin.email, admin.name, count).catch((e) =>
        console.error('[APPLICATIONS SUMMARY] Email failed:', e),
      )
      sent++
    }
  }

  return { sent, pending: count }
}
