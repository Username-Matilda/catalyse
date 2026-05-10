import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const tasks = await prisma.starterTask.findMany({
    where: { assignedToId: volunteer.id },
    include: {
      skill: true,
      project: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(tasks.map(t => ({
    id: t.id,
    project_id: t.projectId,
    title: t.title,
    description: t.description,
    skill_id: t.skillId,
    skill_name: t.skill?.name ?? null,
    project_title: t.project?.title ?? null,
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
  })))
}
