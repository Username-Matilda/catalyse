import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/project'
import { checkRateLimit } from '@/lib/rate-limit'
import { CreateBugReportSchema } from '@/lib/schemas'
import { publicProcedure } from '../procedures'

export const bugReportsRouter = {
  create: publicProcedure.input(CreateBugReportSchema).handler(async ({ input, context }) => {
    const { allowed, retryAfterMs } = checkRateLimit(context.request, 'bug-reports', {
      limit: 5,
      windowMs: 60_000,
    })
    if (!allowed) throw new ORPCError('TOO_MANY_REQUESTS', { cause: { retryAfterMs } })

    const volunteer = context.volunteer

    const report = await prisma.bugReport.create({
      data: {
        reporterId: volunteer?.id ?? null,
        reporterEmail: volunteer ? volunteer.email : (input.reporterEmail ?? null),
        title: input.title.trim(),
        description: input.description,
        pageUrl: input.pageUrl ?? null,
        category: input.category ?? 'bug',
        severity: input.severity ?? 'medium',
      },
    })

    const admins = await prisma.volunteer.findMany({
      where: { isAdmin: true },
      select: { id: true },
    })
    await Promise.all(
      admins.map((admin) =>
        createNotification(
          admin.id,
          'new_bug_report',
          `New ${input.category ?? 'bug'}: ${input.title.trim()}`,
          `Severity: ${input.severity ?? 'medium'}`,
          '/admin/bugs',
        ).catch((e) => console.error('[NOTIFY ERROR]', e)),
      ),
    )

    return { id: report.id, message: 'Thank you for your feedback!' }
  }),
}
