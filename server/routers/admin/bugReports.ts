import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { UpdateBugReportSchema } from '@/lib/schemas'
import { adminProcedure } from '../../procedures'

export const adminBugReportsRouter = {
  list: adminProcedure
    .input(z.object({ status: z.string().optional(), category: z.string().optional() }))
    .handler(async ({ input }) => {
      const reports = await prisma.bugReport.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.category ? { category: input.category } : {}),
        },
        include: { reporter: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      return reports.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporterEmail: r.reporterEmail,
        title: r.title,
        description: r.description,
        pageUrl: r.pageUrl,
        category: r.category,
        severity: r.severity,
        status: r.status,
        resolutionNotes: r.resolutionNotes,
        resolvedById: r.resolvedById,
        resolvedAt: r.resolvedAt,
        createdAt: r.createdAt,
        reporterName: r.reporter?.name ?? null,
      }))
    }),

  update: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(UpdateBugReportSchema))
    .handler(async ({ input, context }) => {
      const report = await prisma.bugReport.findUnique({ where: { id: input.id } })
      if (!report) throw new ORPCError('NOT_FOUND', { message: 'Bug report not found' })

      const data: Record<string, unknown> = {}

      if (input.status) {
        data.status = input.status
        if (input.status === 'resolved' || input.status === 'wont_fix') {
          data.resolvedById = context.volunteer.id
          data.resolvedAt = new Date()
        }
      }

      if (input.resolutionNotes !== undefined) {
        data.resolutionNotes = input.resolutionNotes
      }

      if (Object.keys(data).length > 0) {
        await prisma.bugReport.update({ where: { id: input.id }, data })
      }

      return { message: 'Bug report updated' }
    }),
}
