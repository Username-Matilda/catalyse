import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { withProjectExtras, projectInclude, EnrichedProject } from '@/lib/work-item'
import { notifyUser } from '@/lib/notify'
import { adminProcedure } from '../../procedures'
import { ProjectStatus, WorkItemType } from '@/generated/prisma/enums'

export const adminTriageRouter = {
  list: adminProcedure.handler(async () => {
    const projects = await prisma.workItem.findMany({
      where: {
        type: WorkItemType.PROJECT,
        status: { in: [ProjectStatus.pending_review, ProjectStatus.needs_discussion] },
      },
      include: {
        ...projectInclude,
        comments: {
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((p) => ({
      ...withProjectExtras(p as EnrichedProject),
      comments: p.comments.map((c) => ({
        id: c.id,
        authorId: c.authorId,
        authorName: c.author?.name ?? null,
        content: c.content,
        createdAt: c.createdAt,
      })),
    }))
  }),

  addComment: adminProcedure
    .input(z.object({ projectId: z.number().int(), content: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const comment = await prisma.workItemComment.create({
        data: { workItemId: input.projectId, authorId: admin.id, content: input.content.trim() },
      })

      if (project.creatorId && project.creatorId !== admin.id) {
        await notifyUser(
          project.creatorId,
          'project_needs_discussion',
          `New message on your project '${project.title}'`,
          input.content.slice(0, 200),
          `/projects/${input.projectId}`,
          {
            message: `A team lead added a message to the discussion on <strong>${project.title}</strong>.`,
            projectTitle: project.title,
            projectId: input.projectId,
            extraHtml: `<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;">${input.content}</div>`,
          },
        )
      }

      return { id: comment.id, message: 'Comment added' }
    }),
}
