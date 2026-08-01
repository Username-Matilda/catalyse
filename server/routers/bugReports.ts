import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notify'
import { checkRateLimit } from '@/lib/rate-limit'
import { canViewBugReport } from '@/lib/bug-report-access'
import { CreateBugReportSchema } from '@/lib/schemas'
import { publicProcedure, authedProcedure } from '../procedures'

export const bugReportsRouter = {
  getById: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const report = await prisma.bugReport.findUnique({
        where: { id: input.id },
        include: { reporter: { select: { name: true } } },
      })
      if (!report) throw new ORPCError('NOT_FOUND', { message: 'Bug report not found' })

      const viewer = { id: context.volunteer.id, isAdmin: Boolean(context.volunteer.isAdmin) }
      if (!canViewBugReport(report, viewer)) {
        throw new ORPCError('NOT_FOUND', { message: 'Bug report not found' })
      }

      return {
        id: report.id,
        reporterId: report.reporterId,
        reporterEmail: report.reporterEmail,
        reporterName: report.reporter?.name ?? null,
        title: report.title,
        description: report.description,
        pageUrl: report.pageUrl,
        category: report.category,
        severity: report.severity,
        status: report.status,
        resolutionNotes: report.resolutionNotes,
        resolvedById: report.resolvedById,
        resolvedAt: report.resolvedAt,
        createdAt: report.createdAt,
        isMine: report.reporterId === viewer.id,
      }
    }),

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
