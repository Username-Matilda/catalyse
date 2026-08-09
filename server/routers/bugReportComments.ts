import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { notifyUser, notifyAdmins } from '@/lib/notify'
import { canViewBugReport, canPostBugReportComment } from '@/lib/bug-report-access'
import { authedProcedure } from '../procedures'

export const bugReportCommentsRouter = {
  list: authedProcedure
    .input(z.object({ bugReportId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const report = await prisma.bugReport.findUnique({
        where: { id: input.bugReportId },
        select: { id: true, reporterId: true, title: true },
      })
      if (!report) throw new ORPCError('NOT_FOUND', { message: 'Bug report not found' })

      const viewer = { id: context.volunteer.id, isAdmin: Boolean(context.volunteer.isAdmin) }
      if (!canViewBugReport(report, viewer)) {
        throw new ORPCError('NOT_FOUND', { message: 'Bug report not found' })
      }

      const comments = await prisma.bugReportComment.findMany({
        where: { bugReportId: input.bugReportId },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      return {
        canPost: canPostBugReportComment(report, viewer),
        comments: comments.map((c) => ({
          id: c.id,
          bugReportId: c.bugReportId,
          authorId: c.authorId,
          authorName: c.author?.name ?? null,
          content: c.content,
          createdAt: c.createdAt,
        })),
      }
    }),

  add: authedProcedure
    .input(z.object({ bugReportId: z.number().int(), content: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const report = await prisma.bugReport.findUnique({
        where: { id: input.bugReportId },
        select: { id: true, reporterId: true, title: true },
      })
      if (!report) throw new ORPCError('NOT_FOUND', { message: 'Bug report not found' })

      const viewer = { id: volunteer.id, isAdmin: Boolean(volunteer.isAdmin) }
      if (!canPostBugReportComment(report, viewer)) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized to comment here' })
      }

      const comment = await prisma.bugReportComment.create({
        data: {
          bugReportId: input.bugReportId,
          authorId: volunteer.id,
          content: input.content.trim(),
        },
      })

      const link = `/bugs/${report.id}`
      if (viewer.isAdmin) {
        if (report.reporterId && report.reporterId !== volunteer.id) {
          await notifyUser(
            report.reporterId,
            'bug_report_comment_reply',
            `New reply on your bug report: ${report.title}`,
            input.content.slice(0, 200),
            link,
          )
        }
      } else {
        await notifyAdmins(
          'bug_report_comment',
          `New comment on bug report: ${report.title}`,
          input.content.slice(0, 200),
          link,
        )
      }

      return { id: comment.id, message: 'Comment added' }
    }),
}
