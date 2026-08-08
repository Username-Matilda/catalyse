import { prisma } from '@/lib/prisma'
import { adminProcedure } from '../../procedures'
import { ProjectStatus, WorkItemType, ApprovalStatus } from '@/generated/prisma/enums'
import { ADMIN_NOTIFICATION_TYPES } from '@/lib/admin-notifications'

export const adminOverviewRouter = {
  counts: adminProcedure.handler(async ({ context }) => {
    const [pendingTriage, pendingApplications, openBugReports, unreadNotifications] =
      await Promise.all([
        prisma.workItem.count({
          where: {
            type: WorkItemType.PROJECT,
            status: { in: [ProjectStatus.pending_review, ProjectStatus.needs_discussion] },
          },
        }),
        prisma.volunteer.count({
          where: {
            approvalStatus: { in: [ApprovalStatus.pending, ApprovalStatus.under_review] },
            deletedAt: null,
          },
        }),
        prisma.bugReport.count({ where: { status: { in: ['open', 'in_progress'] } } }),
        prisma.notification.count({
          where: {
            volunteerId: context.volunteer.id,
            readAt: null,
            type: { in: ADMIN_NOTIFICATION_TYPES },
          },
        }),
      ])

    return { pendingTriage, pendingApplications, openBugReports, unreadNotifications }
  }),
}
