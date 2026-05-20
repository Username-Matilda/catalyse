import { prisma } from '@/lib/prisma'
import { authedProcedure } from '../procedures'
import { WorkItemType } from '@/generated/prisma/enums'

export const myRouter = {
  starterTasks: authedProcedure.handler(async ({ context }) => {
    const tasks = await prisma.workItem.findMany({
      where: { type: WorkItemType.STARTER_TASK, assigneeId: context.volunteer.id },
      include: {
        skill: true,
        contextProject: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return tasks.map((t) => ({
      id: t.id,
      projectId: t.contextProjectId,
      title: t.title,
      description: t.description,
      skillId: t.skillId,
      skillName: t.skill?.name ?? null,
      projectTitle: t.contextProject?.title ?? null,
      assignedToId: t.assigneeId,
      assignedById: t.creatorId,
      status: t.status,
      reviewRating: t.reviewRating,
      reviewNotes: t.reviewNotes,
      reviewedById: t.reviewedById,
      reviewedAt: t.reviewedAt,
      estimatedHours: t.estimatedHours,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  }),
}
