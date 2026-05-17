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

  return Response.json(
    tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      description: t.description,
      skillId: t.skillId,
      skillName: t.skill?.name ?? null,
      projectTitle: t.project?.title ?? null,
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
    })),
  )
}
