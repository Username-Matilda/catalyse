import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { serializeVolunteer, serializeSkill } from '@/lib/auth'
import { authedProcedure } from '../procedures'

export const privacyRouter = {
  export: authedProcedure.handler(async ({ context }) => {
    const [profile, interests, messagesSent, messagesReceived, projects] = await Promise.all([
      prisma.volunteer.findUnique({
        where: { id: context.volunteer.id },
        include: {
          skills: { include: { skill: { include: { category: true } } } },
        },
      }),
      prisma.projectInterest.findMany({ where: { volunteerId: context.volunteer.id } }),
      prisma.message.findMany({ where: { fromVolunteerId: context.volunteer.id } }),
      prisma.message.findMany({ where: { toVolunteerId: context.volunteer.id } }),
      prisma.project.findMany({
        where: { OR: [{ ownerId: context.volunteer.id }, { proposedById: context.volunteer.id }] },
      }),
    ])

    if (!profile) throw new ORPCError('NOT_FOUND')

    const serializedProfile = serializeVolunteer(profile, {
      showContact: true,
      skills: profile.skills.map(serializeSkill),
    })

    return {
      exportedAt: new Date().toISOString(),
      profile: serializedProfile,
      skills: profile.skills.map(serializeSkill),
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        ownerId: p.ownerId,
        proposedById: p.proposedById,
        outcome: p.outcome,
        outcomeNotes: p.outcomeNotes,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      interests: interests.map((i) => ({
        id: i.id,
        projectId: i.projectId,
        interestType: i.interestType,
        message: i.message,
        status: i.status,
        createdAt: i.createdAt,
        respondedAt: i.respondedAt,
      })),
      messagesSent: messagesSent.map((m) => ({
        id: m.id,
        toVolunteerId: m.toVolunteerId,
        subject: m.subject,
        message: m.message,
        relatedProjectId: m.relatedProjectId,
        createdAt: m.createdAt,
      })),
      messagesReceived: messagesReceived.map((m) => ({
        id: m.id,
        fromVolunteerId: m.fromVolunteerId,
        subject: m.subject,
        message: m.message,
        relatedProjectId: m.relatedProjectId,
        readAt: m.readAt,
        createdAt: m.createdAt,
      })),
    }
  }),
}
