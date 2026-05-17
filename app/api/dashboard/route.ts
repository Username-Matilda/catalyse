import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { serializeProject, projectInclude, EnrichedProject } from '@/lib/project'

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const volunteerWithSkills = await prisma.volunteer.findUnique({
    where: { id: volunteer.id },
    select: { skills: { select: { skillId: true } } },
  })
  const volunteerSkillIds = new Set((volunteerWithSkills?.skills ?? []).map((s) => s.skillId))

  const alreadyInterestedProjects = await prisma.projectInterest.findMany({
    where: { volunteerId: volunteer.id },
    select: { projectId: true },
  })
  const interestedProjectIds = alreadyInterestedProjects.map((i) => i.projectId)

  const [ownedProjects, proposedProjects, myInterests, suggestedProjects, unreadCount] =
    await Promise.all([
      prisma.project.findMany({
        where: { ownerId: volunteer.id },
        orderBy: { updatedAt: 'desc' },
        include: projectInclude,
      }),

      prisma.project.findMany({
        where: {
          proposedById: volunteer.id,
          OR: [{ ownerId: null }, { ownerId: { not: volunteer.id } }],
        },
        orderBy: { createdAt: 'desc' },
        include: projectInclude,
      }),

      prisma.projectInterest.findMany({
        where: { volunteerId: volunteer.id },
        orderBy: { createdAt: 'desc' },
        include: {
          project: { include: projectInclude },
        },
      }),

      volunteerSkillIds.size > 0
        ? prisma.project.findMany({
            where: {
              skills: { some: { skillId: { in: [...volunteerSkillIds] } } },
              OR: [
                { isSeekingHelp: true },
                { isSeekingOwner: true },
                { status: { in: ['seeking_owner', 'seeking_help'] } },
              ],
              ownerId: { not: volunteer.id },
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

  return Response.json({
    ownedProjects: ownedProjects.map((p) => serializeProject(p as EnrichedProject)),
    proposedProjects: proposedProjects.map((p) => serializeProject(p as EnrichedProject)),
    myInterests: myInterests.map((i) => ({
      interestId: i.id,
      interestType: i.interestType,
      interestStatus: i.status,
      interestMessage: i.message,
      interestCreatedAt: i.createdAt,
      interestResponseMessage: i.responseMessage,
      interestRespondedAt: i.respondedAt,
      ...serializeProject(i.project as EnrichedProject, volunteerSkillIds),
    })),
    suggestedProjects: suggestedProjects.map((p) =>
      serializeProject(p as EnrichedProject, volunteerSkillIds),
    ),
    unreadNotificationCount: unreadCount,
  })
}
