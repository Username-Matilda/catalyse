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
    admin_notes: adminNotes.map((n) => ({
      id: n.id,
      volunteer_id: n.volunteerId,
      author_id: n.authorId,
      content: n.content,
      category: n.category,
      related_project_id: n.relatedProjectId,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      author_name: n.author.name,
    })),
    endorsements: endorsements.map((e) => ({
      id: e.id,
      volunteer_id: e.volunteerId,
      skill_id: e.skillId,
      endorsed_by_id: e.endorsedById,
      source: e.source,
      source_id: e.sourceId,
      rating: e.rating,
      notes: e.notes,
      created_at: e.createdAt,
      skill_name: e.skill.name,
      skill_category: e.skill.category.name,
      endorsed_by_name: e.endorsedBy.name,
    })),
    starter_tasks: starterTasks.map((t) => ({
      id: t.id,
      project_id: t.projectId,
      title: t.title,
      description: t.description,
      skill_id: t.skillId,
      assigned_to_id: t.assignedToId,
      assigned_by_id: t.assignedById,
      status: t.status,
      review_rating: t.reviewRating,
      review_notes: t.reviewNotes,
      feedback_to_volunteer: t.feedbackToVolunteer,
      reviewed_by_id: t.reviewedById,
      reviewed_at: t.reviewedAt,
      estimated_hours: t.estimatedHours,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
      skill_name: t.skill?.name ?? null,
    })),
    project_history: projectHistory.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      owner_id: p.ownerId,
      proposed_by_id: p.proposedById,
      outcome: p.outcome,
      outcome_notes: p.outcomeNotes,
      completed_at: p.completedAt,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })),
  })
}
