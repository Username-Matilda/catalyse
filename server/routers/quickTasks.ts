import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notify'
import { CreateQuickTaskSchema, AssignQuickTaskSchema, ReviewQuickTaskSchema } from '@/lib/schemas'
import { CLAIM_BLOCKING_INTEREST_STATUSES } from '@/lib/work-item'
import { adminProcedure, approvedProcedure, authedProcedure } from '../procedures'
import { ApprovalStatus, QuickTaskStatus, TaskStatus, WorkItemType } from '@/generated/prisma/enums'

export const quickTasksRouter = {
  list: adminProcedure
    .input(
      z.object({
        status: z.nativeEnum(QuickTaskStatus).optional(),
        skillId: z.number().int().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const tasks = await prisma.workItem.findMany({
        where: {
          type: WorkItemType.QUICK_TASK,
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

  // Project tasks flagged featuredAsQuickTask, regardless of status/assignee — so an admin
  // checking this page can confirm a flag actually took effect and see who holds it,
  // instead of only being able to see it once claimed via `available` (open+unclaimed only).
  // Management (edit/assign/unassign) still happens on the task's own project page — these
  // aren't WorkItemType.QUICK_TASK rows, so the quick-task-specific mutations don't apply.
  featuredProjectTasks: adminProcedure.handler(async () => {
    const tasks = await prisma.workItem.findMany({
      where: { type: WorkItemType.TASK, featuredAsQuickTask: true },
      include: {
        parent: { select: { id: true, title: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return tasks
      .filter((t) => t.parentId !== null)
      .map((t) => ({
        id: t.id,
        projectId: t.parentId as number,
        projectTitle: t.parent?.title ?? null,
        title: t.title,
        status: t.status,
        assignedToId: t.assigneeId,
        assignedToName: t.assignee?.name ?? null,
        estimatedHours: t.estimatedHours,
        createdAt: t.createdAt,
      }))
  }),

  // The open, unclaimed browse pool: real quick tasks plus project tasks a
  // project owner/admin has flagged to also surface here (featuredAsQuickTask).
  available: approvedProcedure.handler(async ({ context }) => {
    // Projects this volunteer was declined from or withdrew from — they can't claim
    // those tasks, so don't advertise them here either.
    const blockedInterests = await prisma.workItemInterest.findMany({
      where: {
        volunteerId: context.volunteer.id,
        status: { in: CLAIM_BLOCKING_INTEREST_STATUSES },
      },
      select: { workItemId: true },
    })
    const blockedProjectIds = blockedInterests.map((i) => i.workItemId)

    const [quickTasks, projectTasks] = await Promise.all([
      prisma.workItem.findMany({
        where: {
          type: WorkItemType.QUICK_TASK,
          status: QuickTaskStatus.open,
          assigneeId: null,
        },
        include: {
          skill: { include: { category: true } },
          contextProject: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.workItem.findMany({
        where: {
          type: WorkItemType.TASK,
          status: TaskStatus.open,
          assigneeId: null,
          featuredAsQuickTask: true,
          parentId: { not: null, notIn: blockedProjectIds },
        },
        include: { parent: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return [
      ...quickTasks.map((t) => ({
        kind: 'quick' as const,
        id: t.id,
        title: t.title,
        description: t.description,
        skillId: t.skillId,
        skillName: t.skill?.name ?? null,
        skillCategory: t.skill?.category?.name ?? null,
        estimatedHours: t.estimatedHours,
        createdAt: t.createdAt,
      })),
      ...projectTasks
        .filter((t) => t.parentId !== null)
        .map((t) => ({
          kind: 'project_task' as const,
          id: t.id,
          title: t.title,
          description: t.description,
          projectId: t.parentId as number,
          projectTitle: t.parent?.title ?? null,
          estimatedHours: t.estimatedHours,
          createdAt: t.createdAt,
        })),
    ].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  }),

  get: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.QUICK_TASK },
        include: {
          skill: true,
          contextProject: { select: { title: true, id: true } },
        },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      const isOpenAndUnclaimed = task.status === QuickTaskStatus.open && task.assigneeId === null
      if (task.assigneeId !== volunteer.id && !volunteer.isAdmin && !isOpenAndUnclaimed) {
        throw new ORPCError('FORBIDDEN', { message: 'You do not have access to this task' })
      }
      return {
        id: task.id,
        projectId: task.contextProjectId,
        projectTitle: task.contextProject?.title ?? null,
        title: task.title,
        description: task.description,
        skillId: task.skillId,
        skillName: task.skill?.name ?? null,
        assignedToId: task.assigneeId,
        assignedById: task.creatorId,
        status: task.status,
        reviewRating: task.reviewRating,
        reviewNotes: task.reviewNotes,
        reviewedById: task.reviewedById,
        reviewedAt: task.reviewedAt,
        estimatedHours: task.estimatedHours,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }
    }),

  create: adminProcedure.input(CreateQuickTaskSchema).handler(async ({ input }) => {
    const task = await prisma.workItem.create({
      data: {
        type: WorkItemType.QUICK_TASK,
        status: QuickTaskStatus.open,
        title: input.title,
        description: input.description,
        skillId: input.skillId ?? null,
        contextProjectId: input.contextProjectId ?? null,
        estimatedHours: input.estimatedHours ?? null,
      },
    })
    return { id: task.id, message: 'Quick Task created' }
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
        where: { id: input.id, type: WorkItemType.QUICK_TASK },
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
      where: { id: input.id, type: WorkItemType.QUICK_TASK },
    })
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

    await prisma.skillEndorsement.deleteMany({
      where: { source: 'quick_task', sourceId: input.id },
    })
    await prisma.workItem.delete({ where: { id: input.id } })
    return { message: 'Task deleted' }
  }),

  assign: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(AssignQuickTaskSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.QUICK_TASK },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      const assignee = await prisma.volunteer.findFirst({
        where: { id: input.volunteerId, deletedAt: null },
      })
      if (!assignee) throw new ORPCError('BAD_REQUEST', { message: 'Volunteer not found' })
      if (assignee.approvalStatus !== ApprovalStatus.approved) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Cannot assign a task to a volunteer who is not yet approved',
        })
      }

      await prisma.workItem.update({
        where: { id: input.id },
        data: {
          assigneeId: input.volunteerId,
          creatorId: admin.id,
          status: QuickTaskStatus.in_progress,
          updatedAt: new Date(),
        },
      })

      notifyUser(
        input.volunteerId,
        'quick_task_assigned',
        `You've been assigned a Quick Task: ${task.title}`,
        (task.description ?? '').slice(0, 200),
        `/quick-tasks/${input.id}`,
      )

      return { message: 'Task assigned' }
    }),

  claim: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.QUICK_TASK },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      if (task.status !== QuickTaskStatus.open || task.assigneeId !== null) {
        throw new ORPCError('BAD_REQUEST', { message: 'This task has already been claimed' })
      }

      await prisma.workItem.update({
        where: { id: input.id },
        data: {
          assigneeId: volunteer.id,
          status: QuickTaskStatus.in_progress,
          updatedAt: new Date(),
        },
      })

      return { message: 'Task claimed' }
    }),

  unassign: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const task = await prisma.workItem.findFirst({
      where: { id: input.id, type: WorkItemType.QUICK_TASK },
    })
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

    await prisma.workItem.update({
      where: { id: input.id },
      data: {
        assigneeId: null,
        creatorId: null,
        status: QuickTaskStatus.open,
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
        where: { id: input.id, type: WorkItemType.QUICK_TASK, assigneeId: volunteer.id },
      })
      if (!task)
        throw new ORPCError('NOT_FOUND', { message: 'Task not found or not assigned to you' })

      await prisma.workItem.update({
        where: { id: input.id },
        data: { status: QuickTaskStatus.under_review, updatedAt: new Date() },
      })

      if (task.creatorId) {
        notifyUser(
          task.creatorId,
          'quick_task_submitted',
          `${volunteer.name} submitted: ${task.title}`,
          'Ready for review',
          `/quick-tasks#task-${input.id}`,
        )
      }

      return { message: 'Task submitted for review' }
    }),

  review: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(ReviewQuickTaskSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const task = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.QUICK_TASK },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      if (task.status !== QuickTaskStatus.under_review)
        throw new ORPCError('BAD_REQUEST', { message: 'Task is not awaiting review' })

      await prisma.workItem.update({
        where: { id: input.id },
        data: {
          status: QuickTaskStatus.completed,
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
        const noteContent = `Quick Task '${task.title}': ${input.reviewRating}${input.reviewNotes ? ` - ${input.reviewNotes}` : ''}`
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
              source: 'quick_task',
              sourceId: input.id,
            },
            create: {
              volunteerId: task.assigneeId,
              skillId: task.skillId,
              endorsedById: admin.id,
              source: 'quick_task',
              sourceId: input.id,
              rating,
              notes: input.reviewNotes ?? null,
            },
          })
        }

        notifyUser(
          task.assigneeId,
          'quick_task_reviewed',
          `Your Quick Task was reviewed: ${task.title}`,
          `Rating: ${input.reviewRating}${input.comment ? ` - ${input.comment}` : ''}`,
          `/quick-tasks/${input.id}`,
        )
      }

      return { message: 'Task reviewed' }
    }),
}
