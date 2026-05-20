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
import { StarterTaskStatus } from '@/generated/prisma/enums'

export const starterTasksRouter = {
  list: adminProcedure
    .input(
      z.object({
        status: z.nativeEnum(StarterTaskStatus).optional(),
        skillId: z.number().int().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const tasks = await prisma.starterTask.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.skillId ? { skillId: input.skillId } : {}),
        },
        include: {
          skill: { include: { category: true } },
          project: { select: { title: true } },
          assignedTo: { select: { name: true } },
          reviewedBy: { select: { name: true } },
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
        skillCategory: t.skill?.category?.name ?? null,
        projectTitle: t.project?.title ?? null,
        assignedToId: t.assignedToId,
        assignedToName: t.assignedTo?.name ?? null,
        assignedById: t.assignedById,
        status: t.status,
        reviewRating: t.reviewRating,
        reviewNotes: t.reviewNotes,
        feedbackToVolunteer: t.feedbackToVolunteer,
        reviewedById: t.reviewedById,
        reviewedByName: t.reviewedBy?.name ?? null,
        reviewedAt: t.reviewedAt,
        estimatedHours: t.estimatedHours,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    }),

  available: publicProcedure.handler(async () => {
    const tasks = await prisma.starterTask.findMany({
      where: { status: StarterTaskStatus.open, assignedToId: null },
      include: {
        skill: { include: { category: true } },
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
      skillCategory: t.skill?.category?.name ?? null,
      projectTitle: t.project?.title ?? null,
      estimatedHours: t.estimatedHours,
      createdAt: t.createdAt,
    }))
  }),

  create: adminProcedure.input(CreateStarterTaskSchema).handler(async ({ input }) => {
    const task = await prisma.starterTask.create({
      data: {
        title: input.title,
        description: input.description,
        skillId: input.skillId ?? null,
        projectId: input.projectId ?? null,
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
      const task = await prisma.starterTask.findUnique({ where: { id: input.id } })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      const updated = await prisma.starterTask.update({
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
    const task = await prisma.starterTask.findUnique({ where: { id: input.id } })
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

    await prisma.skillEndorsement.deleteMany({
      where: { source: 'starter_task', sourceId: input.id },
    })
    await prisma.starterTask.delete({ where: { id: input.id } })
    return { message: 'Task deleted' }
  }),

  assign: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(AssignStarterTaskSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const task = await prisma.starterTask.findUnique({ where: { id: input.id } })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      await prisma.starterTask.update({
        where: { id: input.id },
        data: {
          assignedToId: input.volunteerId,
          assignedById: admin.id,
          status: StarterTaskStatus.assigned,
          updatedAt: new Date(),
        },
      })

      notifyUser(
        input.volunteerId,
        'starter_task_assigned',
        `You've been assigned a starter task: ${task.title}`,
        task.description.slice(0, 200),
        '/dashboard',
      )

      return { message: 'Task assigned' }
    }),

  unassign: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const task = await prisma.starterTask.findUnique({ where: { id: input.id } })
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

    await prisma.starterTask.update({
      where: { id: input.id },
      data: {
        assignedToId: null,
        assignedById: null,
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
      const task = await prisma.starterTask.findFirst({
        where: { id: input.id, assignedToId: volunteer.id },
      })
      if (!task)
        throw new ORPCError('NOT_FOUND', { message: 'Task not found or not assigned to you' })

      await prisma.starterTask.update({
        where: { id: input.id },
        data: { status: StarterTaskStatus.submitted, updatedAt: new Date() },
      })

      if (task.assignedById) {
        notifyUser(
          task.assignedById,
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
      const task = await prisma.starterTask.findUnique({ where: { id: input.id } })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      if (task.status !== StarterTaskStatus.submitted)
        throw new ORPCError('BAD_REQUEST', { message: 'Task is not in submitted status' })

      const newStatus = ['excellent', 'good'].includes(input.reviewRating)
        ? StarterTaskStatus.completed
        : StarterTaskStatus.reviewed

      await prisma.starterTask.update({
        where: { id: input.id },
        data: {
          status: newStatus,
          reviewRating: input.reviewRating,
          reviewNotes: input.reviewNotes ?? null,
          feedbackToVolunteer: input.feedbackToVolunteer ?? null,
          reviewedById: admin.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      })

      if (task.assignedToId) {
        const noteContent = `Starter task '${task.title}': ${input.reviewRating}${input.reviewNotes ? ` - ${input.reviewNotes}` : ''}`
        await prisma.adminNote.create({
          data: {
            volunteerId: task.assignedToId,
            authorId: admin.id,
            content: noteContent,
            category: 'skill_feedback',
            relatedProjectId: task.projectId ?? null,
          },
        })

        if (['excellent', 'good'].includes(input.reviewRating) && task.skillId) {
          const rating = input.reviewRating === 'excellent' ? 'strong' : 'verified'
          await prisma.skillEndorsement.upsert({
            where: {
              volunteerId_skillId_endorsedById: {
                volunteerId: task.assignedToId,
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
              volunteerId: task.assignedToId,
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
          task.assignedToId,
          'starter_task_reviewed',
          `Your starter task was reviewed: ${task.title}`,
          `Rating: ${input.reviewRating}${input.feedbackToVolunteer ? ` - ${input.feedbackToVolunteer}` : ''}`,
          '/dashboard',
        )
      }

      return { message: 'Task reviewed' }
    }),
}
