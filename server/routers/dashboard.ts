import { prisma } from '@/lib/prisma'
import {
  withProjectExtras,
  projectInclude,
  projectScopeWhere,
  EnrichedProject,
} from '@/lib/work-item'
import { authedProcedure } from '../procedures'
import { ADVERTISABLE_STATUSES } from '@/lib/project-status'
import { WorkItemType } from '@/generated/prisma/enums'
import { ADMIN_NOTIFICATION_TYPES } from '@/lib/admin-notifications'

export const dashboardRouter = {
  get: authedProcedure.handler(async ({ context }) => {
    const volunteer = context.volunteer

    const volunteerWithSkills = await prisma.volunteer.findUnique({
      where: { id: volunteer.id },
      select: {
        emailConfirmed: true,
        skills: { select: { skillId: true } },
      },
    })
    const approvalWelcome = await prisma.notification.findFirst({
      where: { volunteerId: volunteer.id, type: 'application_approved', readAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    const volunteerSkillIds = new Set((volunteerWithSkills?.skills ?? []).map((s) => s.skillId))

    const alreadyInterestedProjects = await prisma.workItemInterest.findMany({
      where: { volunteerId: volunteer.id },
      select: { workItemId: true },
    })
    const interestedProjectIds = alreadyInterestedProjects.map((i) => i.workItemId)

    const [ownedProjects, proposedProjects, myInterests, suggestedProjects, unreadCount] =
      await Promise.all([
        prisma.workItem.findMany({
          where: { type: WorkItemType.PROJECT, assigneeId: volunteer.id },
          orderBy: { updatedAt: 'desc' },
          include: projectInclude,
        }),

        prisma.workItem.findMany({
          where: {
            type: WorkItemType.PROJECT,
            creatorId: volunteer.id,
            OR: [{ assigneeId: null }, { assigneeId: { not: volunteer.id } }],
          },
          orderBy: { createdAt: 'desc' },
          include: projectInclude,
        }),

        prisma.workItemInterest.findMany({
          where: { volunteerId: volunteer.id },
          orderBy: { createdAt: 'desc' },
          include: {
            workItem: { include: projectInclude },
          },
        }),

        volunteerSkillIds.size > 0
          ? prisma.workItem.findMany({
              where: {
                type: WorkItemType.PROJECT,
                skills: { some: { skillId: { in: [...volunteerSkillIds] } } },
                // Approved and unfinished only. Without this, proposals still awaiting
                // review were recommended to volunteers — every project is created with
                // isSeekingHelp true, so the flag alone matched them before an admin had
                // even seen them.
                status: { in: ADVERTISABLE_STATUSES },
                AND: [
                  { OR: [{ isSeekingHelp: true }, { assigneeId: null }] },
                  // `{ not: id }` alone drops rows where assignee_id IS NULL, which meant
                  // ownerless projects — the ones most in need of someone — were never
                  // suggested to anyone. Same workaround as proposedProjects above.
                  { OR: [{ assigneeId: null }, { assigneeId: { not: volunteer.id } }] },
                  projectScopeWhere(volunteer),
                ],
                id: { notIn: interestedProjectIds.length > 0 ? interestedProjectIds : [-1] },
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: projectInclude,
            })
          : Promise.resolve([]),

        prisma.notification.count({
          where: {
            volunteerId: volunteer.id,
            readAt: null,
            ...(volunteer.isAdmin ? { type: { notIn: ADMIN_NOTIFICATION_TYPES } } : {}),
          },
        }),
      ])

    return {
      ownedProjects: ownedProjects.map((p) => withProjectExtras(p as EnrichedProject)),
      proposedProjects: proposedProjects.map((p) => withProjectExtras(p as EnrichedProject)),
      myInterests: myInterests.map((i) => ({
        interestId: i.id,
        interestType: i.interestType,
        interestStatus: i.status,
        interestMessage: i.message,
        interestCreatedAt: i.createdAt,
        interestResponseMessage: i.responseMessage,
        interestRespondedAt: i.respondedAt,
        ...withProjectExtras(i.workItem as EnrichedProject, volunteerSkillIds),
      })),
      suggestedProjects: suggestedProjects.map((p) =>
        withProjectExtras(p as EnrichedProject, volunteerSkillIds),
      ),
      unreadNotificationCount: unreadCount,
      // Shown once as a welcome dialog; reading the notification dismisses it for good.
      approvalWelcome: approvalWelcome
        ? {
            notificationId: approvalWelcome.id,
            emailConfirmed: volunteerWithSkills?.emailConfirmed ?? false,
          }
        : null,
    }
  }),
}
