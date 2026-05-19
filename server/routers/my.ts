import { prisma } from '@/lib/prisma'
import { authedProcedure } from '../procedures'

export const myRouter = {
  starterTasks: authedProcedure.handler(async ({ context }) => {
    const tasks = await prisma.starterTask.findMany({
      where: { assignedToId: context.volunteer.id },
      include: {
        skill: true,
        project: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return tasks.map((t) => ({
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
    }))
  }),
}
