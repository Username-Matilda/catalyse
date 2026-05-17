import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer, serializeVolunteer, serializeSkill } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) return Response.json({ detail: 'Authentication required' }, { status: 401 })

  const [profile, interests, messagesSent, messagesReceived, projects] = await Promise.all([
    prisma.volunteer.findUnique({
      where: { id: volunteer.id },
      include: {
        skills: { include: { skill: { include: { category: true } } } },
      },
    }),
    prisma.projectInterest.findMany({ where: { volunteerId: volunteer.id } }),
    prisma.message.findMany({ where: { fromVolunteerId: volunteer.id } }),
    prisma.message.findMany({ where: { toVolunteerId: volunteer.id } }),
    prisma.project.findMany({
      where: { OR: [{ ownerId: volunteer.id }, { proposedById: volunteer.id }] },
    }),
  ])

  if (!profile) return Response.json({ detail: 'Volunteer not found' }, { status: 404 })

  const serializedProfile = serializeVolunteer(profile as unknown as Record<string, unknown>, {
    showContact: true,
    skills: profile.skills.map(serializeSkill),
  })

  return Response.json({
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
  })
}
