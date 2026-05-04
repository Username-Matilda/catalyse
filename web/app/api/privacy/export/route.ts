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

  const serializedProfile = serializeVolunteer(
    profile as unknown as Record<string, unknown>,
    { showContact: true, skills: profile.skills.map(serializeSkill) }
  )

  return Response.json({
    exported_at: new Date().toISOString(),
    profile: serializedProfile,
    projects: projects.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      owner_id: p.ownerId,
      proposed_by_id: p.proposedById,
      outcome: p.outcome,
      outcome_notes: p.outcomeNotes,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })),
    interests: interests.map(i => ({
      id: i.id,
      project_id: i.projectId,
      interest_type: i.interestType,
      message: i.message,
      status: i.status,
      created_at: i.createdAt,
      responded_at: i.respondedAt,
    })),
    messages_sent: messagesSent.map(m => ({
      id: m.id,
      to_volunteer_id: m.toVolunteerId,
      subject: m.subject,
      message: m.message,
      related_project_id: m.relatedProjectId,
      created_at: m.createdAt,
    })),
    messages_received: messagesReceived.map(m => ({
      id: m.id,
      from_volunteer_id: m.fromVolunteerId,
      subject: m.subject,
      message: m.message,
      related_project_id: m.relatedProjectId,
      read_at: m.readAt,
      created_at: m.createdAt,
    })),
  })
}
