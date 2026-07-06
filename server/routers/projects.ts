import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { withProjectExtras, projectInclude, EnrichedProject } from '@/lib/work-item'
import { notifyUser } from '@/lib/notify'
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectInterestBodySchema,
  CreateProjectTaskSchema,
  UpdateProjectTaskSchema,
} from '@/lib/schemas'
import { publicProcedure, authedProcedure, adminProcedure } from '../procedures'
import {
  ApprovalStatus,
  InterestStatus,
  ProjectStatus,
  TaskStatus,
  WorkItemType,
} from '@/generated/prisma/enums'

const STATUS_LABELS: Record<string, string> = {
  seeking_owner: 'Seeking Owner',
  seeking_help: 'Seeking Help',
  needs_tasks: 'Needs Tasks',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
}

const OWNER_ALLOWED_STATUSES: ProjectStatus[] = [
  ProjectStatus.seeking_owner,
  ProjectStatus.seeking_help,
  ProjectStatus.needs_tasks,
  ProjectStatus.in_progress,
  ProjectStatus.on_hold,
  ProjectStatus.completed,
]

// open and in_progress share a bucket so claiming/assigning a task doesn't
// disturb its priority position — only completed tasks sink to the bottom.
const TASK_ORDER: Record<string, number> = {
  [TaskStatus.open]: 0,
  [TaskStatus.in_progress]: 0,
  [TaskStatus.completed]: 1,
}

export const projectsRouter = {
  list: publicProcedure
    .input(
      z.object({
        status: z.string().optional(),
        skillIds: z.array(z.number().int()).optional(),
        search: z.string().optional(),
        urgency: z.string().optional(),
        country: z.string().optional(),
        localGroup: z.string().optional(),
        isOrgProposed: z.boolean().optional(),
        isSeekingHelp: z.boolean().optional(),
        isSeekingOwner: z.boolean().optional(),
        isSeekingAny: z.boolean().optional(),
        notSeeking: z.boolean().optional(),
        sortBy: z.string().optional().default('created_at'),
        limit: z.number().int().min(1).max(100).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      if (volunteer && !volunteer.emailConfirmed && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Please confirm your email address to browse projects',
        })
      }

      const isPending = Boolean(
        volunteer && volunteer.approvalStatus !== ApprovalStatus.approved && !volunteer.isAdmin,
      )

      let volunteerSkillIds: Set<number> | undefined
      if (volunteer) {
        const v = await prisma.volunteer.findUnique({
          where: { id: volunteer.id },
          select: { skills: { select: { skillId: true } } },
        })
        volunteerSkillIds = new Set((v?.skills ?? []).map((s) => s.skillId))
      }

      const conditions: Prisma.Sql[] = [Prisma.sql`type = ${WorkItemType.PROJECT}`]

      if (input.status) {
        conditions.push(Prisma.sql`status = ${input.status}`)
      } else {
        conditions.push(
          Prisma.raw(
            `status NOT IN ('${ProjectStatus.archived}', '${ProjectStatus.pending_review}', '${ProjectStatus.needs_discussion}')`,
          ),
        )
      }

      if (input.skillIds && input.skillIds.length > 0) {
        conditions.push(
          Prisma.sql`id IN (SELECT work_item_id FROM work_item_skills WHERE skill_id IN (${Prisma.join(input.skillIds)}))`,
        )
      }

      if (input.search) {
        const like = `%${input.search}%`
        conditions.push(Prisma.sql`(title LIKE ${like} OR description LIKE ${like})`)
      }

      if (input.urgency) conditions.push(Prisma.sql`urgency = ${input.urgency}`)
      if (input.country) conditions.push(Prisma.sql`country = ${input.country}`)
      if (input.localGroup) conditions.push(Prisma.sql`local_group = ${input.localGroup}`)

      if (input.isOrgProposed !== undefined) {
        conditions.push(Prisma.sql`is_org_proposed = ${input.isOrgProposed ? 1 : 0}`)
      }
      if (input.isSeekingHelp !== undefined) {
        conditions.push(Prisma.sql`is_seeking_help = ${input.isSeekingHelp ? 1 : 0}`)
      }
      if (input.isSeekingOwner !== undefined) {
        conditions.push(Prisma.sql`is_seeking_owner = ${input.isSeekingOwner ? 1 : 0}`)
      }
      if (input.isSeekingAny) {
        conditions.push(Prisma.raw(`(is_seeking_help = 1 OR is_seeking_owner = 1)`))
      }
      if (input.notSeeking) {
        conditions.push(Prisma.raw(`is_seeking_help = 0 AND is_seeking_owner = 0`))
      }

      const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      const orderClause = Prisma.raw(`ORDER BY
        CASE WHEN is_seeking_help = 1 OR is_seeking_owner = 1 THEN 0 ELSE 1 END,
        CASE urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC`)

      const [countResult, idRows] = await Promise.all([
        prisma.$queryRaw<
          [{ count: bigint }]
        >`SELECT COUNT(*) as count FROM work_items ${whereClause}`,
        input.sortBy === 'match'
          ? prisma.$queryRaw<
              { id: number }[]
            >`SELECT id FROM work_items ${whereClause} ${orderClause}`
          : prisma.$queryRaw<
              { id: number }[]
            >`SELECT id FROM work_items ${whereClause} ${orderClause} LIMIT ${input.limit} OFFSET ${input.offset}`,
      ])

      const total = Number(countResult[0].count)
      const ids = idRows.map((r) => r.id)

      const rawProjects = await prisma.workItem.findMany({
        where: { id: { in: ids } },
        include: projectInclude,
      })

      const projectMap = new Map(rawProjects.map((p) => [p.id, p]))
      const projects = ids
        .map((id) => projectMap.get(id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
        .map((p) => {
          const serialized = withProjectExtras(p as EnrichedProject, volunteerSkillIds)
          if (isPending) {
            return {
              ...serialized,
              owner: null,
              ownerId: null,
              proposedBy: null,
              proposedById: null,
            }
          }
          return serialized
        })

      if (input.sortBy === 'match' && volunteerSkillIds && volunteerSkillIds.size > 0) {
        projects.sort((a, b) => (b.match?.overallScore ?? 0) - (a.match?.overallScore ?? 0))
        return { projects: projects.slice(input.offset, input.offset + input.limit), total }
      }

      return { projects, total }
    }),

  create: authedProcedure.input(CreateProjectSchema).handler(async ({ input, context }) => {
    const volunteer = context.volunteer
    if (volunteer.approvalStatus !== ApprovalStatus.approved && !volunteer.isAdmin) {
      throw new ORPCError('FORBIDDEN', { message: 'Your account is pending approval' })
    }

    const { tasks, wantToOwn, skillIds, skillRequiredMap } = input
    if (tasks.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'At least one task is required to submit a project proposal',
      })
    }

    const project = await prisma.$transaction(async (tx) => {
      const newProject = await tx.workItem.create({
        data: {
          type: WorkItemType.PROJECT,
          title: input.title,
          description: input.description,
          status: ProjectStatus.pending_review,
          assigneeId: wantToOwn ? volunteer.id : null,
          creatorId: volunteer.id,
          isOrgProposed: false,
          projectType: input.projectType ?? null,
          estimatedDuration: input.estimatedDuration ?? null,
          timeCommitmentHoursPerWeek: input.timeCommitmentHoursPerWeek ?? null,
          urgency: input.urgency ?? 'medium',
          collaborationLink: input.collaborationLink ?? null,
          country: input.country ?? null,
          localGroup: input.localGroup ?? null,
          isSeekingHelp: input.isSeekingHelp !== false,
          isSeekingOwner: !wantToOwn,
        },
      })

      if (skillIds.length > 0) {
        await tx.workItemSkill.createMany({
          data: skillIds.map((skillId) => ({
            workItemId: newProject.id,
            skillId,
            isRequired: skillRequiredMap[skillId] !== false,
          })),
        })
      }

      await tx.workItem.createMany({
        data: tasks.map((t) => ({
          type: WorkItemType.TASK,
          status: TaskStatus.open,
          parentId: newProject.id,
          title: t.title,
          description: t.description ?? null,
          creatorId: volunteer.id,
        })),
      })

      return newProject
    })

    const admins = await prisma.volunteer.findMany({
      where: { isAdmin: true, deletedAt: null },
      select: { id: true, name: true, email: true },
    })

    for (const admin of admins) {
      await notifyUser(
        admin.id,
        'new_project_proposal',
        `New project proposal: ${project.title}`,
        `Proposed by ${volunteer.name}`,
        '/admin/triage',
        {
          message: `<strong>${volunteer.name}</strong> has submitted a new project proposal: <strong>${project.title}</strong>. Please review it in the triage queue.`,
          projectTitle: project.title,
          projectId: project.id,
        },
      )
    }

    return { id: project.id, message: 'Project submitted for review' }
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const isPending = Boolean(
        volunteer && volunteer.approvalStatus !== ApprovalStatus.approved && !volunteer.isAdmin,
      )

      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
        include: projectInclude,
      })

      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const hiddenStatuses: string[] = [
        ProjectStatus.pending_review,
        ProjectStatus.needs_discussion,
      ]
      if (hiddenStatuses.includes(project.status)) {
        if (!volunteer) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
        const isCreator = project.creatorId === volunteer.id
        if (!isCreator && !volunteer.isAdmin)
          throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
      }

      let volunteerSkillIds: Set<number> | undefined
      if (volunteer) {
        const v = await prisma.volunteer.findUnique({
          where: { id: volunteer.id },
          select: { skills: { select: { skillId: true } } },
        })
        volunteerSkillIds = new Set((v?.skills ?? []).map((s) => s.skillId))
      }

      const base = withProjectExtras(project as EnrichedProject, volunteerSkillIds)

      const tasks = await prisma.workItem.findMany({
        where: { parentId: input.id, type: WorkItemType.TASK },
        include: {
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
        },
      })

      const sortedTasks = tasks.sort((a, b) => {
        const orderDiff = (TASK_ORDER[a.status] ?? 0) - (TASK_ORDER[b.status] ?? 0)
        if (orderDiff !== 0) return orderDiff
        const sortOrderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        if (sortOrderDiff !== 0) return sortOrderDiff
        return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
      })

      const mappedTasks = sortedTasks.map((t) => ({
        id: t.id,
        projectId: t.parentId,
        title: t.title,
        description: t.description,
        assignedToId: isPending ? null : t.assigneeId,
        assignedToName: isPending ? null : (t.assignee?.name ?? null),
        createdById: isPending ? null : t.creatorId,
        createdByName: isPending ? null : (t.creator?.name ?? null),
        status: t.status,
        sortOrder: t.sortOrder,
        estimatedHours: t.estimatedHours,
        deadline: t.deadline,
        completedAt: t.completedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))

      let interests:
        | Array<{
            id: number
            volunteerId: number
            projectId: number
            interestType: string
            message: string | null
            status: string
            responseMessage: string | null
            createdAt: Date | null
            respondedAt: Date | null
            volunteerName: string
            volunteerBio: string | null
            volunteerSkills: Array<{
              id: number
              name: string
              categoryName: string
              proficiencyLevel: string | null
            }>
          }>
        | undefined
      let myInterest:
        | {
            id: number
            volunteerId: number
            projectId: number
            interestType: string
            message: string | null
            status: string
            responseMessage: string | null
            createdAt: Date | null
            respondedAt: Date | null
          }
        | null
        | undefined

      if (volunteer) {
        const isAssignee = project.assigneeId === volunteer.id
        if (isAssignee || volunteer.isAdmin) {
          const rawInterests = await prisma.workItemInterest.findMany({
            where: { workItemId: input.id },
            include: {
              volunteer: {
                select: {
                  id: true,
                  name: true,
                  bio: true,
                  skills: { include: { skill: { include: { category: true } } } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
          interests = rawInterests.map((i) => ({
            id: i.id,
            volunteerId: i.volunteerId,
            projectId: i.workItemId,
            interestType: i.interestType,
            message: i.message,
            status: i.status,
            responseMessage: i.responseMessage,
            createdAt: i.createdAt,
            respondedAt: i.respondedAt,
            volunteerName: i.volunteer.name,
            volunteerBio: i.volunteer.bio,
            volunteerSkills: i.volunteer.skills.map((vs) => ({
              id: vs.skill.id,
              name: vs.skill.name,
              categoryName: vs.skill.category.name,
              proficiencyLevel: vs.proficiencyLevel,
            })),
          }))
        }

        const rawMyInterest = await prisma.workItemInterest.findFirst({
          where: {
            workItemId: input.id,
            volunteerId: volunteer.id,
            status: { not: InterestStatus.withdrawn },
          },
        })
        myInterest = rawMyInterest
          ? {
              id: rawMyInterest.id,
              volunteerId: rawMyInterest.volunteerId,
              projectId: rawMyInterest.workItemId,
              interestType: rawMyInterest.interestType,
              message: rawMyInterest.message,
              status: rawMyInterest.status,
              responseMessage: rawMyInterest.responseMessage,
              createdAt: rawMyInterest.createdAt,
              respondedAt: rawMyInterest.respondedAt,
            }
          : null
      }

      return {
        ...base,
        ...(isPending && { owner: null, ownerId: null, proposedBy: null, proposedById: null }),
        tasks: mappedTasks,
        interests,
        myInterest,
      }
    }),

  update: authedProcedure
    .input(z.object({ id: z.number().int() }).merge(UpdateProjectSchema))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const isAssignee = project.assigneeId === volunteer.id
      const isCreator = project.creatorId === volunteer.id
      if (!isAssignee && !isCreator && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized to edit this project' })
      }

      const body = input
      const newStatus = body.status

      if (
        newStatus &&
        newStatus === ProjectStatus.in_progress &&
        project.status !== ProjectStatus.in_progress
      ) {
        const openTaskCount = await prisma.workItem.count({
          where: {
            parentId: input.id,
            type: WorkItemType.TASK,
            status: { not: TaskStatus.completed },
          },
        })
        if (openTaskCount === 0) {
          throw new ORPCError('BAD_REQUEST', {
            message: 'A project cannot be moved to In Progress without at least one open task',
          })
        }
      }

      const data: Record<string, unknown> = {}
      const stringFields = [
        'title',
        'description',
        'projectType',
        'estimatedDuration',
        'urgency',
        'collaborationLink',
        'country',
        'localGroup',
        'outcome',
        'outcomeNotes',
      ] as const
      for (const field of stringFields) {
        if (body[field] !== undefined) data[field] = body[field]
      }
      if (body.timeCommitmentHoursPerWeek !== undefined)
        data.timeCommitmentHoursPerWeek = body.timeCommitmentHoursPerWeek
      if (body.assigneeId !== undefined) {
        data.assigneeId = body.assigneeId
        if (body.assigneeId !== null && body.isSeekingOwner === undefined) {
          data.isSeekingOwner = false
        }
      }

      if (newStatus !== undefined) {
        if (volunteer.isAdmin) {
          data.status = newStatus
        } else if (isAssignee && OWNER_ALLOWED_STATUSES.includes(newStatus as ProjectStatus)) {
          data.status = newStatus
        }
      }

      if (body.isSeekingHelp !== undefined) data.isSeekingHelp = body.isSeekingHelp
      if (body.isSeekingOwner !== undefined) data.isSeekingOwner = body.isSeekingOwner

      if (data.status === ProjectStatus.completed || data.status === ProjectStatus.archived) {
        if (data.isSeekingHelp === undefined) data.isSeekingHelp = false
        if (data.isSeekingOwner === undefined) data.isSeekingOwner = false
      }

      data.updatedAt = new Date()
      await prisma.workItem.update({ where: { id: input.id }, data })

      if (body.skillIds !== undefined) {
        const skillRequiredMap = body.skillRequiredMap ?? {}
        await prisma.workItemSkill.deleteMany({ where: { workItemId: input.id } })
        if (body.skillIds.length > 0) {
          await prisma.workItemSkill.createMany({
            data: body.skillIds.map((skillId) => ({
              workItemId: input.id,
              skillId,
              isRequired: skillRequiredMap[skillId] !== false,
            })),
          })
        }
      }

      if (newStatus && newStatus !== project.status) {
        const statusLabel = STATUS_LABELS[newStatus] ?? newStatus
        const notifyIds = new Set<number>()
        if (project.assigneeId && project.assigneeId !== volunteer.id)
          notifyIds.add(project.assigneeId)
        if (project.creatorId && project.creatorId !== volunteer.id)
          notifyIds.add(project.creatorId)

        const accepted = await prisma.workItemInterest.findMany({
          where: { workItemId: input.id, status: InterestStatus.accepted },
          select: { volunteerId: true },
        })
        for (const row of accepted) {
          if (row.volunteerId !== volunteer.id) notifyIds.add(row.volunteerId)
        }

        for (const vid of notifyIds) {
          await notifyUser(
            vid,
            'project_status_changed',
            `'${project.title}' is now ${statusLabel}`,
            `Status changed by ${volunteer.name}`,
            `/projects/${input.id}`,
            {
              message: `The project <strong>${project.title}</strong> has been updated to <strong>${statusLabel}</strong>.`,
              projectTitle: project.title,
              projectId: input.id,
            },
          )
        }
      }

      const updated = await prisma.workItem.findUnique({
        where: { id: input.id },
        include: projectInclude,
      })
      return withProjectExtras(updated as EnrichedProject)
    }),

  delete: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const project = await prisma.workItem.findFirst({
      where: { id: input.id, type: WorkItemType.PROJECT },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
    await prisma.workItem.delete({ where: { id: input.id } })
    return { message: `Project '${project.title}' deleted` }
  }),

  expressInterest: authedProcedure
    .input(z.object({ projectId: z.number().int() }).merge(ProjectInterestBodySchema))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      if (volunteer.approvalStatus !== ApprovalStatus.approved && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', { message: 'Your account is pending approval' })
      }

      const project = await prisma.workItem.findFirst({
        where: {
          id: input.projectId,
          type: WorkItemType.PROJECT,
          status: { notIn: [ProjectStatus.completed, ProjectStatus.archived] },
          OR: [
            { isSeekingHelp: true },
            { isSeekingOwner: true },
            { status: { in: [ProjectStatus.seeking_owner, ProjectStatus.seeking_help] } },
          ],
        },
      })
      if (!project) {
        throw new ORPCError('NOT_FOUND', {
          message: 'This project is not currently seeking volunteers',
        })
      }

      const existing = await prisma.workItemInterest.findFirst({
        where: { workItemId: input.projectId, volunteerId: volunteer.id },
      })
      if (existing && existing.status !== InterestStatus.withdrawn) {
        throw new ORPCError('BAD_REQUEST', { message: "You've already expressed interest" })
      }

      const { interestType, message = null } = input

      if (existing) {
        await prisma.workItemInterest.update({
          where: {
            volunteerId_workItemId: { volunteerId: volunteer.id, workItemId: input.projectId },
          },
          data: {
            interestType,
            message,
            status: InterestStatus.pending,
            respondedAt: null,
            responseMessage: null,
          },
        })
      } else {
        await prisma.workItemInterest.create({
          data: {
            volunteerId: volunteer.id,
            workItemId: input.projectId,
            interestType,
            message,
            status: InterestStatus.pending,
          },
        })
      }

      const interestLabel = interestType === 'want_to_own' ? 'own / lead' : 'contribute to'

      if (project.assigneeId) {
        await notifyUser(
          project.assigneeId,
          'new_interest',
          `Someone's interested in '${project.title}'!`,
          `${volunteer.name} wants to ${interestLabel}`,
          `/projects/${input.projectId}`,
          {
            subject: `${volunteer.name} wants to ${interestLabel} '${project.title}'`,
            message: `<strong>${volunteer.name}</strong> has expressed interest in your project <strong>${project.title}</strong>.`,
            projectTitle: project.title,
            projectId: input.projectId,
            extraHtml: message
              ? `<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Their message:</strong> ${message}</div>`
              : undefined,
          },
        )
      }

      return { message: 'Interest expressed successfully' }
    }),

  withdrawInterest: authedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const result = await prisma.workItemInterest.updateMany({
        where: {
          workItemId: input.projectId,
          volunteerId: context.volunteer.id,
          status: InterestStatus.pending,
        },
        data: { status: InterestStatus.withdrawn },
      })
      if (result.count === 0)
        throw new ORPCError('NOT_FOUND', { message: 'No pending interest found' })
      return { message: 'Interest withdrawn' }
    }),

  respondToInterest: authedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        interestId: z.number().int(),
        status: z.enum([InterestStatus.accepted, InterestStatus.declined]),
        responseMessage: z.string().optional().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      const isAssignee = project && project.assigneeId === volunteer.id
      if (!project || (!isAssignee && !volunteer.isAdmin)) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized' })
      }

      const interest = await prisma.workItemInterest.findFirst({
        where: { id: input.interestId, workItemId: input.projectId },
      })
      if (!interest) throw new ORPCError('NOT_FOUND', { message: 'Interest not found' })

      await prisma.workItemInterest.update({
        where: { id: input.interestId },
        data: {
          status: input.status,
          responseMessage: input.responseMessage ?? null,
          respondedAt: new Date(),
        },
      })

      if (input.status === InterestStatus.accepted && interest.interestType === 'want_to_own') {
        const openTaskCount = await prisma.workItem.count({
          where: {
            parentId: input.projectId,
            type: WorkItemType.TASK,
            status: { not: TaskStatus.completed },
          },
        })
        await prisma.workItem.update({
          where: { id: input.projectId },
          data: {
            assigneeId: interest.volunteerId,
            status: openTaskCount > 0 ? ProjectStatus.in_progress : ProjectStatus.needs_tasks,
          },
        })
      }

      await notifyUser(
        interest.volunteerId,
        `interest_${input.status}`,
        `Your interest in '${project.title}' was ${input.status}`,
        input.responseMessage ?? null,
        `/projects/${input.projectId}`,
        {
          message: `The team has <strong>${input.status}</strong> your interest in the project <strong>${project.title}</strong>.`,
          projectTitle: project.title,
          projectId: input.projectId,
          extraHtml: input.responseMessage
            ? `<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Message:</strong> ${input.responseMessage}</div>`
            : undefined,
        },
      )

      return { message: `Interest ${input.status}` }
    }),

  assign: authedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        volunteerId: z.number().int(),
        interestType: z.string().optional().default('want_to_contribute'),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      if (project.assigneeId !== volunteer.id && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Only project owner or admin can assign volunteers',
        })
      }

      const existing = await prisma.workItemInterest.findFirst({
        where: {
          workItemId: input.projectId,
          volunteerId: input.volunteerId,
          status: { not: InterestStatus.withdrawn },
        },
      })

      if (existing) {
        if (existing.status === InterestStatus.pending) {
          await prisma.workItemInterest.update({
            where: { id: existing.id },
            data: { status: InterestStatus.accepted, respondedAt: new Date() },
          })
        } else if (existing.status === InterestStatus.accepted) {
          return { message: 'This volunteer is already assigned to this project' }
        }
      } else {
        await prisma.workItemInterest.create({
          data: {
            volunteerId: input.volunteerId,
            workItemId: input.projectId,
            interestType: input.interestType,
            status: InterestStatus.accepted,
            respondedAt: new Date(),
          },
        })
      }

      if (input.interestType === 'want_to_own' && project.isSeekingOwner) {
        await prisma.workItem.update({
          where: { id: input.projectId },
          data: { isSeekingOwner: false },
        })
      }

      await notifyUser(
        input.volunteerId,
        'assigned_to_project',
        `You've been assigned to '${project.title}'`,
        `Assigned by ${volunteer.name}`,
        `/projects/${input.projectId}`,
        {
          message: `<strong>${volunteer.name}</strong> has assigned you to the project <strong>${project.title}</strong>.`,
          projectTitle: project.title,
          projectId: input.projectId,
        },
      )

      return { message: 'Volunteer assigned to project' }
    }),

  listTasks: publicProcedure
    .input(z.object({ projectId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const isPending = Boolean(
        volunteer && volunteer.approvalStatus !== ApprovalStatus.approved && !volunteer.isAdmin,
      )

      const tasks = await prisma.workItem.findMany({
        where: { parentId: input.projectId, type: WorkItemType.TASK },
        include: {
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
        },
      })

      tasks.sort((a, b) => {
        const orderDiff = (TASK_ORDER[a.status] ?? 0) - (TASK_ORDER[b.status] ?? 0)
        if (orderDiff !== 0) return orderDiff
        const sortOrderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        if (sortOrderDiff !== 0) return sortOrderDiff
        return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
      })

      return tasks.map((t) => ({
        id: t.id,
        projectId: t.parentId,
        title: t.title,
        description: t.description,
        assignedToId: isPending ? null : t.assigneeId,
        assignedToName: isPending ? null : (t.assignee?.name ?? null),
        createdById: isPending ? null : t.creatorId,
        createdByName: isPending ? null : (t.creator?.name ?? null),
        status: t.status,
        sortOrder: t.sortOrder,
        estimatedHours: t.estimatedHours,
        deadline: t.deadline,
        completedAt: t.completedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    }),

  createTask: authedProcedure
    .input(z.object({ projectId: z.number().int() }).merge(CreateProjectTaskSchema))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      if (project.assigneeId !== volunteer.id && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Only project owner or admin can create tasks',
        })
      }

      const task = await prisma.$transaction(async (tx) => {
        const max = await tx.workItem.aggregate({
          where: { parentId: input.projectId, type: WorkItemType.TASK },
          _max: { sortOrder: true },
        })
        const newTask = await tx.workItem.create({
          data: {
            type: WorkItemType.TASK,
            status: TaskStatus.open,
            parentId: input.projectId,
            title: input.title,
            description: input.description ?? null,
            estimatedHours: input.estimatedHours ?? null,
            deadline: input.deadline ?? null,
            creatorId: volunteer.id,
            sortOrder: (max._max.sortOrder ?? 0) + 1,
          },
        })
        if (project.status === ProjectStatus.needs_tasks) {
          await tx.workItem.update({
            where: { id: input.projectId },
            data: { status: ProjectStatus.in_progress },
          })
        }
        return newTask
      })

      return { id: task.id, message: 'Task created' }
    }),

  reorderTasks: authedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        items: z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      if (project.assigneeId !== volunteer.id && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Only project owner or admin can reorder tasks',
        })
      }

      await prisma.$transaction(
        input.items.map(({ id, sortOrder }) =>
          prisma.workItem.updateMany({
            where: { id, parentId: input.projectId, type: WorkItemType.TASK },
            data: { sortOrder },
          }),
        ),
      )

      return { success: true }
    }),

  updateTask: authedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        taskId: z.number().int(),
        data: UpdateProjectTaskSchema,
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      const [project, task] = await Promise.all([
        prisma.workItem.findFirst({ where: { id: input.projectId, type: WorkItemType.PROJECT } }),
        prisma.workItem.findFirst({
          where: { id: input.taskId, parentId: input.projectId, type: WorkItemType.TASK },
        }),
      ])

      if (!project || !task)
        throw new ORPCError('NOT_FOUND', { message: 'Project or task not found' })

      const isAssignee = project.assigneeId === volunteer.id
      const isTaskAssignee = task.assigneeId === volunteer.id

      if (!isAssignee && !volunteer.isAdmin) {
        const newStatus = input.data.status
        const newAssigneeId = input.data.assigneeId
        const isSelfClaim =
          newStatus === TaskStatus.in_progress &&
          newAssigneeId === volunteer.id &&
          task.status === TaskStatus.open
        const isMarkingDone =
          newStatus === TaskStatus.completed &&
          isTaskAssignee &&
          task.status === TaskStatus.in_progress
        if (!isSelfClaim && !isMarkingDone) {
          throw new ORPCError('FORBIDDEN', { message: 'Not authorized to update this task' })
        }
      }

      const data: Record<string, unknown> = {}
      if (input.data.title !== undefined) data.title = input.data.title
      if (input.data.description !== undefined) data.description = input.data.description
      if (input.data.status !== undefined) {
        data.status = input.data.status
        if (input.data.status === TaskStatus.completed) data.completedAt = new Date()
        else if (input.data.status === TaskStatus.open) {
          data.assigneeId = null
          data.completedAt = null
        }
      }
      if (input.data.assigneeId !== undefined) data.assigneeId = input.data.assigneeId
      data.updatedAt = new Date()
      data.nudgeSentAt = null
      data.finalWarningSentAt = null

      await prisma.workItem.update({ where: { id: input.taskId }, data })
      return { message: 'Task updated' }
    }),

  assignTask: authedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        taskId: z.number().int(),
        assigneeId: z.number().int(),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const [project, task] = await Promise.all([
        prisma.workItem.findFirst({ where: { id: input.projectId, type: WorkItemType.PROJECT } }),
        prisma.workItem.findFirst({
          where: { id: input.taskId, parentId: input.projectId, type: WorkItemType.TASK },
        }),
      ])
      if (!project || !task)
        throw new ORPCError('NOT_FOUND', { message: 'Project or task not found' })

      if (project.assigneeId !== volunteer.id && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', { message: 'Only project owner or admin can assign' })
      }
      if (task.status === TaskStatus.completed) {
        throw new ORPCError('BAD_REQUEST', { message: 'Cannot assign a completed task' })
      }

      const assignee = await prisma.volunteer.findFirst({
        where: { id: input.assigneeId, deletedAt: null },
      })
      if (!assignee) throw new ORPCError('BAD_REQUEST', { message: 'Volunteer not found' })

      await prisma.workItem.update({
        where: { id: input.taskId },
        data: {
          assigneeId: input.assigneeId,
          status: TaskStatus.in_progress,
          updatedAt: new Date(),
          nudgeSentAt: null,
          finalWarningSentAt: null,
        },
      })

      await notifyUser(
        input.assigneeId,
        'task_assigned',
        `You've been assigned a task on '${project.title}'`,
        task.title,
        `/projects/${input.projectId}`,
        {
          message: `You've been assigned the task <strong>${task.title}</strong> on the project <strong>${project.title}</strong>.`,
          projectTitle: project.title,
          projectId: input.projectId,
        },
      )

      return { message: 'Task assigned' }
    }),

  deleteTask: authedProcedure
    .input(z.object({ projectId: z.number().int(), taskId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      if (project.assigneeId !== volunteer.id && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized' })
      }

      const deleted = await prisma.workItem.deleteMany({
        where: { id: input.taskId, parentId: input.projectId, type: WorkItemType.TASK },
      })
      if (deleted.count === 0) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      return { message: 'Task deleted' }
    }),
}
