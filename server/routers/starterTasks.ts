import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notify'
import {
  CreateStarterTaskSchema,
  AssignStarterTaskSchema,
  ReviewStarterTaskSchema,
} from '@/lib/schemas'
import { adminProcedure, authedProcedure, publicProcedure } from '../procedures'
import { StarterTaskStatus, WorkItemType } from '@/generated/prisma/enums'

export const starterTasksRouter = {
  list: adminProcedure
    .input(
      z.object({
        status: z.nativeEnum(StarterTaskStatus).optional(),
        skillId: z.number().int().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const tasks = await prisma.workItem.findMany({
        where: {
          type: WorkItemType.STARTER_TASK,
          ...(input.status ? { status: input.status } : {}),
          ...(input.skillId ? { skillId: input.skillId } : {}),
        },
        include: {
          skill: { include: { category: true } },
          contextProject: { select: { title: true } },
          assignee: { select: { name: true } },
          reviewedBy: { select: { name: true } },
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
        skillCategory: t.skill?.category?.name ?? null,
        projectTitle: t.contextProject?.title ?? null,
        assignedToId: t.assigneeId,
        assignedToName: t.assignee?.name ?? null,
        assignedById: t.creatorId,
        status: t.status,
        reviewRating: t.reviewRating,
        reviewNotes: t.reviewNotes,
        reviewedById: t.reviewedById,
        reviewedByName: t.reviewedBy?.name ?? null,
        reviewedAt: t.reviewedAt,
        estimatedHours: t.estimatedHours,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    }),

  available: publicProcedure.handler(async () => {
    const tasks = await prisma.workItem.findMany({
      where: { type: WorkItemType.STARTER_TASK, status: StarterTaskStatus.open, assigneeId: null },
      include: {
        skill: { include: { category: true } },
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
      skillCategory: t.skill?.category?.name ?? null,
      projectTitle: t.contextProject?.title ?? null,
      estimatedHours: t.estimatedHours,
      createdAt: t.createdAt,
    }))
  }),

  create: adminProcedure.input(CreateStarterTaskSchema).handler(async ({ input }) => {
    const task = await prisma.workItem.create({
      data: {
        type: WorkItemType.STARTER_TASK,
        status: StarterTaskStatus.open,
        title: input.title,
        description: input.description,
        skillId: input.skillId ?? null,
        contextProjectId: input.contextProjectId ?? null,
        estimatedHours: input.estimatedHours ?? null,
      },
    })
    return { id: task.id, message: 'Starter task created' }
  }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().optional(),
        description: z.string().optional(),
        skillId: z.number().int().nullable().optional(),
        estimatedHours: z.number().nullable().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.STARTER_TASK },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      const updated = await prisma.workItem.update({
        where: { id: input.id },
        data: {
          ...(input.title !== undefined && { title: input.title.trim() }),
          ...(input.description !== undefined && { description: input.description.trim() }),
          ...('skillId' in input && { skillId: input.skillId }),
          ...('estimatedHours' in input && { estimatedHours: input.estimatedHours }),
        },
      })
      return { id: updated.id, message: 'Task updated' }
    }),

  delete: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const task = await prisma.workItem.findFirst({
      where: { id: input.id, type: WorkItemType.STARTER_TASK },
    })
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

    await prisma.skillEndorsement.deleteMany({
      where: { source: 'starter_task', sourceId: input.id },
    })
    await prisma.workItem.delete({ where: { id: input.id } })
    return { message: 'Task deleted' }
  }),

  assign: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(AssignStarterTaskSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.STARTER_TASK },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      await prisma.workItem.update({
        where: { id: input.id },
        data: {
          assigneeId: input.volunteerId,
          creatorId: admin.id,
          status: StarterTaskStatus.in_progress,
          updatedAt: new Date(),
        },
      })

      notifyUser(
        input.volunteerId,
        'starter_task_assigned',
        `You've been assigned a starter task: ${task.title}`,
        (task.description ?? '').slice(0, 200),
        '/dashboard',
      )

      return { message: 'Task assigned' }
    }),

  unassign: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const task = await prisma.workItem.findFirst({
      where: { id: input.id, type: WorkItemType.STARTER_TASK },
    })
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

    await prisma.workItem.update({
      where: { id: input.id },
      data: {
        assigneeId: null,
        creatorId: null,
        status: StarterTaskStatus.open,
        updatedAt: new Date(),
      },
    })
    return { message: 'Task unassigned' }
  }),

  submit: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.STARTER_TASK, assigneeId: volunteer.id },
      })
      if (!task)
        throw new ORPCError('NOT_FOUND', { message: 'Task not found or not assigned to you' })

      await prisma.workItem.update({
        where: { id: input.id },
        data: { status: StarterTaskStatus.under_review, updatedAt: new Date() },
      })

      if (task.creatorId) {
        notifyUser(
          task.creatorId,
          'starter_task_submitted',
          `${volunteer.name} submitted: ${task.title}`,
          'Ready for review',
          '/admin/starter-tasks',
        )
      }

      return { message: 'Task submitted for review' }
    }),

  review: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(ReviewStarterTaskSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.STARTER_TASK },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      if (task.status !== StarterTaskStatus.under_review)
        throw new ORPCError('BAD_REQUEST', { message: 'Task is not awaiting review' })

      await prisma.workItem.update({
        where: { id: input.id },
        data: {
          status: StarterTaskStatus.completed,
          reviewRating: input.reviewRating,
          reviewNotes: input.reviewNotes ?? null,
          reviewedById: admin.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      })

      if (input.comment && input.comment.trim()) {
        await prisma.workItemComment.create({
          data: { workItemId: input.id, authorId: admin.id, content: input.comment.trim() },
        })
      }

      if (task.assigneeId) {
        const noteContent = `Starter task '${task.title}': ${input.reviewRating}${input.reviewNotes ? ` - ${input.reviewNotes}` : ''}`
        await prisma.adminNote.create({
          data: {
            volunteerId: task.assigneeId,
            authorId: admin.id,
            content: noteContent,
            category: 'skill_feedback',
            relatedWorkItemId: task.contextProjectId ?? null,
          },
        })

        if (['excellent', 'good'].includes(input.reviewRating) && task.skillId) {
          const rating = input.reviewRating === 'excellent' ? 'strong' : 'verified'
          await prisma.skillEndorsement.upsert({
            where: {
              volunteerId_skillId_endorsedById: {
                volunteerId: task.assigneeId,
                skillId: task.skillId,
                endorsedById: admin.id,
              },
            },
            update: {
              rating,
              notes: input.reviewNotes ?? null,
              source: 'starter_task',
              sourceId: input.id,
            },
            create: {
              volunteerId: task.assigneeId,
              skillId: task.skillId,
              endorsedById: admin.id,
              source: 'starter_task',
              sourceId: input.id,
              rating,
              notes: input.reviewNotes ?? null,
            },
          })
        }

        notifyUser(
          task.assigneeId,
          'starter_task_reviewed',
          `Your starter task was reviewed: ${task.title}`,
          `Rating: ${input.reviewRating}${input.comment ? ` - ${input.comment}` : ''}`,
          '/dashboard',
        )
      }

      return { message: 'Task reviewed' }
    }),
}
