import { prisma } from '@/lib/prisma'
import { withProjectExtras, projectInclude, EnrichedProject } from '@/lib/work-item'
import { authedProcedure } from '../procedures'
import { ProjectStatus, WorkItemType } from '@/generated/prisma/enums'

export const dashboardRouter = {
  get: authedProcedure.handler(async ({ context }) => {
    const volunteer = context.volunteer

    const volunteerWithSkills = await prisma.volunteer.findUnique({
      where: { id: volunteer.id },
      select: { skills: { select: { skillId: true } } },
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
                OR: [
                  { isSeekingHelp: true },
                  { isSeekingOwner: true },
                  { status: { in: [ProjectStatus.seeking_owner, ProjectStatus.seeking_help] } },
                ],
                assigneeId: { not: volunteer.id },
                id: { notIn: interestedProjectIds.length > 0 ? interestedProjectIds : [-1] },
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: projectInclude,
            })
          : Promise.resolve([]),

        prisma.notification.count({
          where: { volunteerId: volunteer.id, readAt: null },
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
    }
  }),
}
