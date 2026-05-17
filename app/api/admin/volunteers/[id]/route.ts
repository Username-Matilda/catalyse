import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, serializeVolunteer, serializeSkill, serializeEndorsement } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const volunteerId = parseInt(idParam, 10)
  if (isNaN(volunteerId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const vol = await prisma.volunteer.findUnique({
    where: { id: volunteerId },
    include: {
      skills: {
        include: { skill: { include: { category: true } } },
        orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
      },
      skillEndorsementsReceived: {
        include: { skill: true },
      },
    },
  })

  if (!vol) {
    return Response.json({ detail: 'Volunteer not found' }, { status: 404 })
  }

  const [adminNotes, endorsements, starterTasks, projectHistory] = await Promise.all([
    prisma.adminNote.findMany({
      where: { volunteerId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.skillEndorsement.findMany({
      where: { volunteerId },
      include: {
        skill: { include: { category: true } },
        endorsedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.starterTask.findMany({
      where: { assignedToId: volunteerId },
      include: { skill: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.findMany({
      where: { OR: [{ ownerId: volunteerId }, { proposedById: volunteerId }] },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const skills = vol.skills.map(serializeSkill)
  const publicEndorsements = vol.skillEndorsementsReceived.map(serializeEndorsement)

  return Response.json({
    ...serializeVolunteer(vol as unknown as Record<string, unknown>, {
      showContact: true,
      skills,
      endorsements: publicEndorsements,
    }),
    adminNotes: adminNotes.map((n) => ({
      id: n.id,
      volunteerId: n.volunteerId,
      authorId: n.authorId,
      content: n.content,
      category: n.category,
      relatedProjectId: n.relatedProjectId,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      authorName: n.author.name,
    })),
    endorsements: endorsements.map((e) => ({
      id: e.id,
      volunteerId: e.volunteerId,
      skillId: e.skillId,
      endorsedById: e.endorsedById,
      source: e.source,
      sourceId: e.sourceId,
      rating: e.rating,
      notes: e.notes,
      createdAt: e.createdAt,
      skillName: e.skill.name,
      skillCategory: e.skill.category.name,
      endorsedByName: e.endorsedBy.name,
    })),
    starterTasks: starterTasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      description: t.description,
      skillId: t.skillId,
      assignedToId: t.assignedToId,
      assignedById: t.assignedById,
      status: t.status,
      reviewRating: t.reviewRating,
      reviewNotes: t.reviewNotes,
      feedbackToVolunteer: t.feedbackToVolunteer,
      reviewedById: t.reviewedById,
      reviewedAt: t.reviewedAt,
      estimatedHours: t.estimatedHours,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      skillName: t.skill?.name ?? null,
    })),
    projectHistory: projectHistory.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      ownerId: p.ownerId,
      proposedById: p.proposedById,
      outcome: p.outcome,
      outcomeNotes: p.outcomeNotes,
      completedAt: p.completedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  })
}
