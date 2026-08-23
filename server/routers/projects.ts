import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  withProjectExtras,
  projectInclude,
  EnrichedProject,
  canViewWorkItem,
  resolveTeamPrivy,
  CLAIM_BLOCKING_INTEREST_STATUSES,
  serializeTask,
} from '@/lib/work-item'
import { notifyUser, notifyAdmins, notifyTeamOfProject, clearNotifications } from '@/lib/notify'
import { html } from '@/lib/email'
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectInterestBodySchema,
  CreateProjectTaskSchema,
  UpdateProjectTaskSchema,
} from '@/lib/schemas'
import { authedProcedure, approvedProcedure, adminProcedure } from '../procedures'
import {
  OWNER_ALLOWED_STATUSES,
  SEEKING_OWNER_SQL,
  TERMINAL_STATUSES,
  UNAPPROVED_STATUSES,
  projectStatusLabel,
} from '@/lib/project-status'
import {
  ApprovalStatus,
  InterestStatus,
  ProjectStatus,
  TaskStatus,
  WorkItemType,
} from '@/generated/prisma/enums'

/**
 * Can this volunteer reach a team-restricted project at all? Mirrors the list/getById
 * gate: a project tagged to a team is only reachable by that team's members, its
 * owner/proposer, an accepted helper, or an admin.
 */
async function canReachProject(
  project: {
    id: number
    teamId: number | null
    creatorId: number | null
    assigneeId: number | null
  },
  volunteer: { id: number; isAdmin: boolean | null },
): Promise<boolean> {
  if (project.teamId === null || volunteer.isAdmin) return true
  if (project.creatorId === volunteer.id || project.assigneeId === volunteer.id) return true
  return resolveTeamPrivy(project.teamId, project.id, volunteer.id)
}

/** Has this volunteer been declined from, or withdrawn from, this project? */
async function isBlockedFromClaiming(projectId: number, volunteerId: number): Promise<boolean> {
  const blocking = await prisma.workItemInterest.findFirst({
    where: {
      workItemId: projectId,
      volunteerId,
      status: { in: CLAIM_BLOCKING_INTEREST_STATUSES },
    },
    select: { id: true },
  })
  return Boolean(blocking)
}

/**
 * Leaving a project — by withdrawing, or by the owner declining you — also gives up the
 * tasks you hold on it. Completed tasks keep their assignee: they are a record of work
 * done, not an outstanding commitment.
 */
async function releaseTasksHeldBy(projectId: number, volunteerId: number): Promise<void> {
  await prisma.workItem.updateMany({
    where: {
      parentId: projectId,
      type: WorkItemType.TASK,
      assigneeId: volunteerId,
      status: { not: TaskStatus.completed },
    },
    data: {
      assigneeId: null,
      status: TaskStatus.open,
      updatedAt: new Date(),
      nudgeSentAt: null,
      finalWarningSentAt: null,
    },
  })
}

// open and in_progress share a bucket so claiming/assigning a task doesn't
// disturb its priority position — only completed tasks sink to the bottom.
const TASK_ORDER: Record<string, number> = {
  [TaskStatus.open]: 0,
  [TaskStatus.in_progress]: 0,
  [TaskStatus.completed]: 1,
}

export const projectsRouter = {
  list: approvedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        skillIds: z.array(z.number().int()).optional(),
        search: z.string().optional(),
        urgency: z.string().optional(),
        country: z.string().optional(),
        localGroup: z.string().optional(),
        teamId: z.number().int().optional(),
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

      if (!volunteer.emailConfirmed && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Please confirm your email address to browse projects',
        })
      }

      const v = await prisma.volunteer.findUnique({
        where: { id: volunteer.id },
        select: { skills: { select: { skillId: true } } },
      })
      const volunteerSkillIds = new Set((v?.skills ?? []).map((s) => s.skillId))

      const teamMemberships = await prisma.teamMembership.findMany({
        where: { volunteerId: volunteer.id },
        select: { teamId: true },
      })
      const viewerTeamIds = new Set(teamMemberships.map((m) => m.teamId))

      const conditions: Prisma.Sql[] = [Prisma.sql`type = ${WorkItemType.PROJECT}`]

      if (input.status) {
        conditions.push(Prisma.sql`status = ${input.status}`)
      } else {
        conditions.push(
          Prisma.raw(
            `status NOT IN ('${ProjectStatus.archived}', ${UNAPPROVED_STATUSES.map((s) => `'${s}'`).join(', ')})`,
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
      if (input.teamId) conditions.push(Prisma.sql`team_id = ${input.teamId}`)

      if (input.isOrgProposed !== undefined) {
        conditions.push(Prisma.sql`is_org_proposed = ${input.isOrgProposed ? 1 : 0}`)
      }
      if (input.isSeekingHelp !== undefined) {
        conditions.push(Prisma.sql`is_seeking_help = ${input.isSeekingHelp ? 1 : 0}`)
      }
      if (input.isSeekingOwner !== undefined) {
        conditions.push(
          Prisma.raw(input.isSeekingOwner ? SEEKING_OWNER_SQL : `NOT ${SEEKING_OWNER_SQL}`),
        )
      }
      if (input.isSeekingAny) {
        conditions.push(Prisma.raw(`(is_seeking_help = 1 OR ${SEEKING_OWNER_SQL})`))
      }
      if (input.notSeeking) {
        conditions.push(Prisma.raw(`is_seeking_help = 0 AND NOT ${SEEKING_OWNER_SQL}`))
      }

      // A project tagged to a team is only browsable by that team's members, its
      // owner/proposer, or an admin — everyone else never sees it in the list.
      if (!volunteer.isAdmin) {
        conditions.push(Prisma.sql`(
          team_id IS NULL
          OR creator_id = ${volunteer.id}
          OR assignee_id = ${volunteer.id}
          OR team_id IN (SELECT team_id FROM team_memberships WHERE volunteer_id = ${volunteer.id})
          OR id IN (
            SELECT work_item_id FROM work_item_interests
            WHERE volunteer_id = ${volunteer.id} AND status = ${InterestStatus.accepted}
          )
        )`)
      }

      const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      const orderClause = Prisma.raw(`ORDER BY
        CASE WHEN is_seeking_help = 1 OR ${SEEKING_OWNER_SQL} THEN 0 ELSE 1 END,
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
        .map((p) => withProjectExtras(p as EnrichedProject, volunteerSkillIds, viewerTeamIds))

      // Match sorting can't be done in SQL, so this branch fetched every matching id and
      // paginates here. The slice has to happen whether or not the volunteer has skills to
      // sort by — without it, a volunteer with no skills got the entire result set back.
      if (input.sortBy === 'match') {
        if (volunteerSkillIds.size > 0) {
          projects.sort((a, b) => (b.match?.overallScore ?? 0) - (a.match?.overallScore ?? 0))
        }
        return { projects: projects.slice(input.offset, input.offset + input.limit), total }
      }

      return { projects, total }
    }),

  /**
   * The unfiltered projects page groups by status/seeking-state into sections (Your Team,
   * Looking for People, In Progress, On Hold, Completed). A single capped `list` query can't
   * back that: whichever 50 rows happen to come back get sliced client-side into sections, so
   * a section can silently lose members to whichever other section ate the cap first. Each
   * section gets its own capped query + total here instead, so every section is complete up
   * to its own cap and knows how many more there are.
   */
  listGrouped: approvedProcedure
    .input(
      z.object({
        skillIds: z.array(z.number().int()).optional(),
        search: z.string().optional(),
        urgency: z.string().optional(),
        country: z.string().optional(),
        localGroup: z.string().optional(),
        teamId: z.number().int().optional(),
        isOrgProposed: z.boolean().optional(),
        previewLimit: z.number().int().min(1).max(100).optional().default(50),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      if (!volunteer.emailConfirmed && !volunteer.isAdmin) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Please confirm your email address to browse projects',
        })
      }

      const v = await prisma.volunteer.findUnique({
        where: { id: volunteer.id },
        select: { skills: { select: { skillId: true } } },
      })
      const volunteerSkillIds = new Set((v?.skills ?? []).map((s) => s.skillId))

      const teamMemberships = await prisma.teamMembership.findMany({
        where: { volunteerId: volunteer.id },
        select: { teamId: true },
      })
      const viewerTeamIds = new Set(teamMemberships.map((m) => m.teamId))

      const sharedConditions: Prisma.Sql[] = [
        Prisma.sql`type = ${WorkItemType.PROJECT}`,
        Prisma.raw(
          `status NOT IN ('${ProjectStatus.archived}', ${UNAPPROVED_STATUSES.map((s) => `'${s}'`).join(', ')})`,
        ),
      ]
      if (input.skillIds && input.skillIds.length > 0) {
        sharedConditions.push(
          Prisma.sql`id IN (SELECT work_item_id FROM work_item_skills WHERE skill_id IN (${Prisma.join(input.skillIds)}))`,
        )
      }
      if (input.search) {
        const like = `%${input.search}%`
        sharedConditions.push(Prisma.sql`(title LIKE ${like} OR description LIKE ${like})`)
      }
      if (input.urgency) sharedConditions.push(Prisma.sql`urgency = ${input.urgency}`)
      if (input.country) sharedConditions.push(Prisma.sql`country = ${input.country}`)
      if (input.localGroup) sharedConditions.push(Prisma.sql`local_group = ${input.localGroup}`)
      if (input.teamId) sharedConditions.push(Prisma.sql`team_id = ${input.teamId}`)
      if (input.isOrgProposed !== undefined) {
        sharedConditions.push(Prisma.sql`is_org_proposed = ${input.isOrgProposed ? 1 : 0}`)
      }
      if (!volunteer.isAdmin) {
        sharedConditions.push(Prisma.sql`(
          team_id IS NULL
          OR creator_id = ${volunteer.id}
          OR assignee_id = ${volunteer.id}
          OR team_id IN (SELECT team_id FROM team_memberships WHERE volunteer_id = ${volunteer.id})
          OR id IN (
            SELECT work_item_id FROM work_item_interests
            WHERE volunteer_id = ${volunteer.id} AND status = ${InterestStatus.accepted}
          )
        )`)
      }

      const seekingSqlStr = `(is_seeking_help = 1 OR ${SEEKING_OWNER_SQL})`
      const orderClause = Prisma.raw(`ORDER BY
        CASE WHEN is_seeking_help = 1 OR ${SEEKING_OWNER_SQL} THEN 0 ELSE 1 END,
        CASE urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC`)

      const bucketDefs: { key: string; extra: Prisma.Sql }[] = [
        { key: 'seeking', extra: Prisma.raw(seekingSqlStr) },
        {
          key: 'in_progress',
          extra: Prisma.raw(`NOT ${seekingSqlStr} AND status = '${ProjectStatus.in_progress}'`),
        },
        {
          key: 'on_hold',
          extra: Prisma.raw(`NOT ${seekingSqlStr} AND status = '${ProjectStatus.on_hold}'`),
        },
        { key: 'completed', extra: Prisma.sql`status = ${ProjectStatus.completed}` },
        {
          key: 'other',
          extra: Prisma.raw(
            `NOT ${seekingSqlStr} AND status NOT IN ('${ProjectStatus.ready}', '${ProjectStatus.in_progress}', '${ProjectStatus.on_hold}', '${ProjectStatus.completed}')`,
          ),
        },
        // Cross-cuts the other buckets rather than partitioning them — a project can be both
        // "your team" and "seeking". Only meaningful for non-admins, to whom "your team" is a
        // quick-jump; admins see every team's projects so it isn't a distinguishing cut.
        ...(!volunteer.isAdmin
          ? [
              {
                key: 'your_team',
                extra:
                  viewerTeamIds.size > 0
                    ? Prisma.sql`team_id IN (${Prisma.join([...viewerTeamIds])})`
                    : Prisma.sql`1 = 0`,
              },
            ]
          : []),
      ]

      const bucketResults = await Promise.all(
        bucketDefs.map(async ({ key, extra }) => {
          const whereClause = Prisma.sql`WHERE ${Prisma.join([...sharedConditions, extra], ' AND ')}`
          const [countResult, idRows] = await Promise.all([
            prisma.$queryRaw<
              [{ count: bigint }]
            >`SELECT COUNT(*) as count FROM work_items ${whereClause}`,
            prisma.$queryRaw<{ id: number }[]>`
              SELECT id FROM work_items ${whereClause} ${orderClause} LIMIT ${input.previewLimit}`,
          ])
          return { key, total: Number(countResult[0].count), ids: idRows.map((r) => r.id) }
        }),
      )

      const allIds = [...new Set(bucketResults.flatMap((b) => b.ids))]
      const rawProjects = await prisma.workItem.findMany({
        where: { id: { in: allIds } },
        include: projectInclude,
      })
      const projectMap = new Map(rawProjects.map((p) => [p.id, p]))

      return {
        groups: bucketResults.map(({ key, total, ids }) => ({
          key,
          total,
          projects: ids
            .map((id) => projectMap.get(id))
            .filter((p): p is NonNullable<typeof p> => p !== undefined)
            .map((p) => withProjectExtras(p as EnrichedProject, volunteerSkillIds, viewerTeamIds)),
        })),
      }
    }),

  create: approvedProcedure.input(CreateProjectSchema).handler(async ({ input, context }) => {
    const volunteer = context.volunteer
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
          remoteEligibility: input.remoteEligibility ?? 'NONE',
          isSeekingHelp: input.isSeekingHelp !== false,
          teamId: input.teamId ?? null,
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

    await notifyAdmins(
      'new_project_proposal',
      `New project proposal: ${project.title}`,
      `Proposed by ${volunteer.name}`,
      '/admin/triage',
      {
        message: html`<strong>${volunteer.name}</strong> has submitted a new project proposal:
          <strong>${project.title}</strong>. Please review it in the triage queue.`,
        projectTitle: project.title,
        projectId: project.id,
      },
      project.id,
    )

    return { id: project.id, message: 'Project submitted for review' }
  }),

  getById: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
        include: projectInclude,
      })

      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      if (project.teamId !== null && !volunteer.isAdmin) {
        const isDirectParticipant =
          project.creatorId === volunteer.id || project.assigneeId === volunteer.id
        if (
          !isDirectParticipant &&
          !(await resolveTeamPrivy(project.teamId, project.id, volunteer.id))
        ) {
          throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
        }
      }

      const hiddenStatuses: string[] = [
        ProjectStatus.pending_review,
        ProjectStatus.needs_discussion,
      ]
      if (hiddenStatuses.includes(project.status)) {
        const isCreator = project.creatorId === volunteer.id
        if (!isCreator && !volunteer.isAdmin)
          throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
      }

      const v = await prisma.volunteer.findUnique({
        where: { id: volunteer.id },
        select: { skills: { select: { skillId: true } } },
      })
      const volunteerSkillIds = new Set((v?.skills ?? []).map((s) => s.skillId))

      const teamMemberships = await prisma.teamMembership.findMany({
        where: { volunteerId: volunteer.id },
        select: { teamId: true },
      })
      const viewerTeamIds = new Set(teamMemberships.map((m) => m.teamId))

      const base = withProjectExtras(project as EnrichedProject, volunteerSkillIds, viewerTeamIds)

      const tasks = await prisma.workItem.findMany({
        where: { parentId: input.id, type: WorkItemType.TASK },
        include: {
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
          _count: { select: { comments: true } },
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
        ...serializeTask(t),
        assignedToName: t.assignee?.name ?? null,
        createdByName: t.creator?.name ?? null,
        sortOrder: t.sortOrder,
        commentCount: t._count.comments,
        featuredAsQuickTask: t.featuredAsQuickTask ?? false,
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
      const myInterest = rawMyInterest
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

      const canClaimTasks =
        isAssignee ||
        Boolean(volunteer.isAdmin) ||
        !(await isBlockedFromClaiming(input.id, volunteer.id))

      return {
        ...base,
        tasks: mappedTasks,
        interests,
        myInterest,
        canClaimTasks,
      }
    }),

  update: approvedProcedure
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
        'remoteEligibility',
        'outcome',
        'outcomeNotes',
      ] as const
      // Handing the project to a different owner or team is the owner's call (or an
      // admin's) — a proposer who never owned it can't appoint themselves. Submitting the
      // current value is always fine: the edit form posts every field back unchanged.
      const canReassign = isAssignee || Boolean(volunteer.isAdmin)

      if (body.teamId !== undefined && body.teamId !== project.teamId) {
        if (!canReassign) {
          throw new ORPCError('FORBIDDEN', {
            message: 'Only the project owner or an admin can change the team',
          })
        }
        if (body.teamId !== null) {
          const team = await prisma.team.findUnique({
            where: { id: body.teamId },
            select: { id: true },
          })
          if (!team) throw new ORPCError('BAD_REQUEST', { message: 'Team not found' })
        }
        data.teamId = body.teamId
      }

      for (const field of stringFields) {
        if (body[field] !== undefined) data[field] = body[field]
      }
      if (body.timeCommitmentHoursPerWeek !== undefined)
        data.timeCommitmentHoursPerWeek = body.timeCommitmentHoursPerWeek

      if (body.assigneeId !== undefined && body.assigneeId !== project.assigneeId) {
        if (!canReassign) {
          throw new ORPCError('FORBIDDEN', {
            message: 'Only the project owner or an admin can change the owner',
          })
        }
        if (body.assigneeId !== null) {
          const newOwner = await prisma.volunteer.findFirst({
            where: { id: body.assigneeId, deletedAt: null },
            select: { approvalStatus: true },
          })
          if (!newOwner) throw new ORPCError('BAD_REQUEST', { message: 'Volunteer not found' })
          if (newOwner.approvalStatus !== ApprovalStatus.approved) {
            throw new ORPCError('BAD_REQUEST', {
              message: 'Cannot assign a project to a volunteer who is not yet approved',
            })
          }
        }
        data.assigneeId = body.assigneeId
      }

      if (newStatus !== undefined) {
        if (volunteer.isAdmin) {
          data.status = newStatus
        } else if (isAssignee && OWNER_ALLOWED_STATUSES.includes(newStatus as ProjectStatus)) {
          data.status = newStatus
        }
      }

      if (body.isSeekingHelp !== undefined) data.isSeekingHelp = body.isSeekingHelp

      // Gaining an owner starts the work; losing one hands the project back to `ready`
      // rather than leaving it in_progress with nobody on it. isSeekingOwner needs no
      // maintenance here — it is derived from exactly these two fields.
      const resultingAssigneeId =
        body.assigneeId !== undefined ? body.assigneeId : project.assigneeId
      if (data.status === undefined && !TERMINAL_STATUSES.includes(project.status)) {
        if (resultingAssigneeId !== null && project.status === ProjectStatus.ready) {
          data.status = ProjectStatus.in_progress
        } else if (
          resultingAssigneeId === null &&
          project.status !== ProjectStatus.ready &&
          !UNAPPROVED_STATUSES.includes(project.status)
        ) {
          data.status = ProjectStatus.ready
        }
      }

      if (TERMINAL_STATUSES.includes(data.status as string)) {
        if (data.isSeekingHelp === undefined) data.isSeekingHelp = false
      }

      data.updatedAt = new Date()
      await prisma.workItem.update({ where: { id: input.id }, data })

      // Tagging a team onto a project that's already visible alerts that team right away;
      // tagging one still in review waits until it goes live (see admin/projects.ts).
      if (
        typeof data.teamId === 'number' &&
        data.teamId !== project.teamId &&
        !UNAPPROVED_STATUSES.includes(project.status)
      ) {
        notifyTeamOfProject(data.teamId, project.id, project.title).catch((e) =>
          console.error('[TEAM NOTIFY]', e),
        )
      }

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

      // Covers the implicit ready ⇄ in_progress moves above, not just an explicit pick.
      const effectiveStatus = data.status as string | undefined
      if (effectiveStatus && effectiveStatus !== project.status) {
        const statusLabel = projectStatusLabel(effectiveStatus)
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
              message: html`The project <strong>${project.title}</strong> has been updated to
                <strong>${statusLabel}</strong>.`,
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

  expressInterest: approvedProcedure
    .input(z.object({ projectId: z.number().int() }).merge(ProjectInterestBodySchema))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: {
          id: input.projectId,
          type: WorkItemType.PROJECT,
          status: { notIn: TERMINAL_STATUSES },
          // Seeking help is a stored flag; seeking an owner is simply having none.
          OR: [{ isSeekingHelp: true }, { assigneeId: null }],
        },
      })
      if (!project) {
        throw new ORPCError('NOT_FOUND', {
          message: 'This project is not currently seeking volunteers',
        })
      }

      if (!(await canReachProject(project, volunteer))) {
        throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
      }

      const existing = await prisma.workItemInterest.findFirst({
        where: { workItemId: input.projectId, volunteerId: volunteer.id },
      })
      if (existing && existing.status !== InterestStatus.withdrawn) {
        throw new ORPCError('BAD_REQUEST', { message: "You've already expressed interest" })
      }

      const { interestType, message = null } = input

      const interest = existing
        ? await prisma.workItemInterest.update({
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
        : await prisma.workItemInterest.create({
            data: {
              volunteerId: volunteer.id,
              workItemId: input.projectId,
              interestType,
              message,
              status: InterestStatus.pending,
            },
          })

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
            message: html`<strong>${volunteer.name}</strong> has expressed interest in your project
              <strong>${project.title}</strong>.`,
            projectTitle: project.title,
            projectId: input.projectId,
            extraHtml: message
              ? html`<div
                  style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"
                >
                  <strong>Their message:</strong> ${message}
                </div>`
              : undefined,
          },
          interest.id,
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
          status: { in: [InterestStatus.pending, InterestStatus.accepted] },
        },
        data: { status: InterestStatus.withdrawn },
      })
      if (result.count === 0) throw new ORPCError('NOT_FOUND', { message: 'No interest found' })

      await releaseTasksHeldBy(input.projectId, context.volunteer.id)

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
        include: { volunteer: { select: { approvalStatus: true } } },
      })
      if (!interest) throw new ORPCError('NOT_FOUND', { message: 'Interest not found' })
      if (
        input.status === InterestStatus.accepted &&
        interest.volunteer.approvalStatus !== ApprovalStatus.approved
      ) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Cannot accept interest from a volunteer who is not yet approved',
        })
      }

      await prisma.workItemInterest.update({
        where: { id: input.interestId },
        data: {
          status: input.status,
          responseMessage: input.responseMessage ?? null,
          respondedAt: new Date(),
        },
      })

      await clearNotifications('new_interest', input.interestId)

      if (input.status === InterestStatus.declined) {
        await releaseTasksHeldBy(input.projectId, interest.volunteerId)
      }

      if (input.status === InterestStatus.accepted && interest.interestType === 'want_to_own') {
        await prisma.workItem.update({
          where: { id: input.projectId },
          data: { assigneeId: interest.volunteerId, status: ProjectStatus.in_progress },
        })
      }

      await notifyUser(
        interest.volunteerId,
        `interest_${input.status}`,
        `Your interest in '${project.title}' was ${input.status}`,
        input.responseMessage ?? null,
        `/projects/${input.projectId}`,
        {
          message: html`The team has <strong>${input.status}</strong> your interest in the project
            <strong>${project.title}</strong>.`,
          projectTitle: project.title,
          projectId: input.projectId,
          extraHtml: input.responseMessage
            ? html`<div
                style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"
              >
                <strong>Message:</strong> ${input.responseMessage}
              </div>`
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

      const targetVolunteer = await prisma.volunteer.findFirst({
        where: { id: input.volunteerId, deletedAt: null },
      })
      if (!targetVolunteer) throw new ORPCError('BAD_REQUEST', { message: 'Volunteer not found' })
      if (targetVolunteer.approvalStatus !== ApprovalStatus.approved) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Cannot assign a project to a volunteer who is not yet approved',
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

      // Assigning someone as owner has to actually set the owner. This previously only
      // cleared the (now derived) isSeekingOwner flag, leaving the project ownerless and
      // no longer advertising for one — unlike respondToInterest, which took the same
      // intent and did set the assignee.
      if (input.interestType === 'want_to_own' && project.assigneeId === null) {
        await prisma.workItem.update({
          where: { id: input.projectId },
          data: {
            assigneeId: input.volunteerId,
            status: TERMINAL_STATUSES.includes(project.status)
              ? project.status
              : ProjectStatus.in_progress,
            updatedAt: new Date(),
          },
        })
      }

      await notifyUser(
        input.volunteerId,
        'assigned_to_project',
        `You've been assigned to '${project.title}'`,
        `Assigned by ${volunteer.name}`,
        `/projects/${input.projectId}`,
        {
          message: html`<strong>${volunteer.name}</strong> has assigned you to the project
            <strong>${project.title}</strong>.`,
          projectTitle: project.title,
          projectId: input.projectId,
        },
      )

      return { message: 'Volunteer assigned to project' }
    }),

  listTasks: approvedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      // Task visibility follows the project's: without this any approved volunteer could
      // read the task list of a team-restricted or still-unapproved project by id.
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const isTeamPrivy = await resolveTeamPrivy(project.teamId, project.id, volunteer.id)
      if (
        !canViewWorkItem(
          project,
          {
            id: volunteer.id,
            isAdmin: Boolean(volunteer.isAdmin),
            isApproved: volunteer.approvalStatus === ApprovalStatus.approved,
          },
          undefined,
          isTeamPrivy,
        )
      ) {
        throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
      }

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
        ...serializeTask(t),
        assignedToName: t.assignee?.name ?? null,
        createdByName: t.creator?.name ?? null,
        sortOrder: t.sortOrder,
      }))
    }),

  getTask: approvedProcedure
    .input(z.object({ projectId: z.number().int(), taskId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const task = await prisma.workItem.findFirst({
        where: { id: input.taskId, parentId: input.projectId, type: WorkItemType.TASK },
        include: {
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
        },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      const isTeamPrivy = await resolveTeamPrivy(project.teamId, project.id, volunteer.id)
      if (
        !canViewWorkItem(
          task,
          {
            id: volunteer.id,
            isAdmin: Boolean(volunteer.isAdmin),
            isApproved: volunteer.approvalStatus === ApprovalStatus.approved,
          },
          project,
          isTeamPrivy,
        )
      ) {
        throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      }

      const canClaim =
        project.assigneeId === volunteer.id ||
        Boolean(volunteer.isAdmin) ||
        !(await isBlockedFromClaiming(input.projectId, volunteer.id))

      return {
        ...serializeTask(task),
        projectTitle: project.title,
        projectOwnerId: project.assigneeId,
        canClaim,
        assignedToName: task.assignee?.name ?? null,
        createdByName: task.creator?.name ?? null,
        featuredAsQuickTask: task.featuredAsQuickTask ?? false,
      }
    }),

  createTask: approvedProcedure
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
            featuredAsQuickTask: input.featuredAsQuickTask ?? false,
            creatorId: volunteer.id,
            sortOrder: (max._max.sortOrder ?? 0) + 1,
          },
        })
        return newTask
      })

      return { id: task.id, message: 'Task created' }
    }),

  reorderTasks: approvedProcedure
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

  updateTask: approvedProcedure
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

      const newStatus = input.data.status
      const newAssigneeId = input.data.assigneeId
      const onlyTouchesStatusAndAssignee =
        input.data.title === undefined &&
        input.data.description === undefined &&
        input.data.estimatedHours === undefined &&
        input.data.deadline === undefined &&
        input.data.featuredAsQuickTask === undefined
      const isSelfClaim =
        onlyTouchesStatusAndAssignee &&
        newStatus === TaskStatus.in_progress &&
        newAssigneeId === volunteer.id &&
        task.status === TaskStatus.open
      const isMarkingDone =
        onlyTouchesStatusAndAssignee &&
        newStatus === TaskStatus.completed &&
        isTaskAssignee &&
        task.status === TaskStatus.in_progress

      if (!isAssignee && !volunteer.isAdmin && !isSelfClaim && !isMarkingDone) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized to update this task' })
      }

      if (isSelfClaim && !isAssignee && !volunteer.isAdmin) {
        if (await isBlockedFromClaiming(input.projectId, volunteer.id)) {
          throw new ORPCError('FORBIDDEN', {
            message:
              'You are no longer contributing to this project, so you cannot claim its tasks',
          })
        }
        if (!(await canReachProject(project, volunteer))) {
          throw new ORPCError('NOT_FOUND', { message: 'Project or task not found' })
        }
      }

      const data: Record<string, unknown> = {}
      if (input.data.title !== undefined) data.title = input.data.title
      if (input.data.description !== undefined) data.description = input.data.description
      if (input.data.estimatedHours !== undefined) data.estimatedHours = input.data.estimatedHours
      if (input.data.deadline !== undefined) data.deadline = input.data.deadline
      if (input.data.featuredAsQuickTask !== undefined)
        data.featuredAsQuickTask = input.data.featuredAsQuickTask
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

      if (isSelfClaim) {
        // Two volunteers hitting claim at once must not both win — only the update that
        // still sees the task open and unheld takes it.
        const claimed = await prisma.workItem.updateMany({
          where: { id: input.taskId, status: TaskStatus.open, assigneeId: null },
          data,
        })
        if (claimed.count === 0) {
          throw new ORPCError('BAD_REQUEST', { message: 'This task has already been claimed' })
        }
      } else {
        await prisma.workItem.update({ where: { id: input.taskId }, data })
      }

      if (isSelfClaim) {
        const existingInterest = await prisma.workItemInterest.findFirst({
          where: { workItemId: input.projectId, volunteerId: volunteer.id },
        })
        if (!existingInterest) {
          await prisma.workItemInterest.create({
            data: {
              volunteerId: volunteer.id,
              workItemId: input.projectId,
              interestType: 'want_to_contribute',
              status: InterestStatus.accepted,
              respondedAt: new Date(),
              message: `${volunteer.name} has claimed '${task.title}' task`,
            },
          })
        }
      }

      return { message: 'Task updated' }
    }),

  assignTask: approvedProcedure
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
      if (assignee.approvalStatus !== ApprovalStatus.approved) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Cannot assign a task to a volunteer who is not yet approved',
        })
      }

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
          message: html`You've been assigned the task <strong>${task.title}</strong> on the project
            <strong>${project.title}</strong>.`,
          projectTitle: project.title,
          projectId: input.projectId,
        },
      )

      return { message: 'Task assigned' }
    }),

  deleteTask: approvedProcedure
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
