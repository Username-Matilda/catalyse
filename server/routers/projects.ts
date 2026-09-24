import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  withProjectExtras,
  projectInclude,
  EnrichedProject,
  canViewWorkItem,
  canSeeProjectScope,
  projectScopeSql,
  projectScopeWhere,
  resolveProjectPrivy,
  CLAIM_BLOCKING_INTEREST_STATUSES,
  serializeTask,
  applyScheduleWrite,
  canManageProject,
  canCreateProjectTask,
  canDeleteProjectTask,
  resolveProjectMembership,
} from '@/lib/work-item'
import { notifyUser, notifyAdmins, notifyTeamOfProject, clearNotifications } from '@/lib/notify'
import {
  loadProjectTaskSchedule,
  loadProjectEdges,
  scheduleProjectsByIds,
} from '@/lib/project-schedule'
import { notifyMatchingVolunteers } from '@/lib/project-match-notify'
import { html } from '@/lib/email'
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectInterestBodySchema,
  CreateProjectTaskSchema,
  UpdateProjectTaskSchema,
} from '@/lib/schemas'
import {
  authedProcedure,
  approvedProcedure,
  confirmedProcedure,
  adminProcedure,
} from '../procedures'
import {
  OWNER_ALLOWED_STATUSES,
  SEEKING_OWNER_SQL,
  TERMINAL_STATUSES,
  UNAPPROVED_STATUSES,
  MAX_VOLUNTEER_DRAFTS,
  projectStatusLabel,
} from '@/lib/project-status'
import {
  ApprovalStatus,
  InterestOrigin,
  InterestStatus,
  ProjectStatus,
  TaskStatus,
  WorkItemType,
} from '@/generated/prisma/enums'

/** Is the project within this volunteer's scope (team and country)? See lib/work-item.ts. */
async function canReachProject(
  project: {
    id: number
    teamId: number | null
    creatorId: number | null
    assigneeId: number | null
    country: string | null
    remoteEligibility: string
  },
  volunteer: { id: number; isAdmin: boolean | null; country: string | null },
): Promise<boolean> {
  return canSeeProjectScope(project, volunteer)
}

/**
 * Throws FORBIDDEN unless `volunteer` may manage this project (owner, admin, or the creator
 * of a still-draft project). See canManageProject in lib/work-item.ts for the rule.
 */
function assertCanManageProject(
  project: { creatorId: number | null; assigneeId: number | null; status: string },
  volunteer: { id: number; isAdmin: boolean | null },
  message: string,
): void {
  if (!canManageProject(project, volunteer)) {
    throw new ORPCError('FORBIDDEN', { message })
  }
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

const URGENCY_RANK_SQL = `CASE urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
// Projects looking for people first, then the most urgent, then the newest.
const DEFAULT_PROJECT_ORDER_SQL = `ORDER BY
  CASE WHEN is_seeking_help OR ${SEEKING_OWNER_SQL} THEN 0 ELSE 1 END,
  ${URGENCY_RANK_SQL},
  created_at DESC, id DESC`

export const projectsRouter = {
  list: confirmedProcedure
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
        sortBy: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

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
        // Asking for an unapproved status by name shows a volunteer their own proposals only.
        if (!volunteer.isAdmin && UNAPPROVED_STATUSES.includes(input.status)) {
          conditions.push(
            Prisma.sql`(creator_id = ${volunteer.id} OR assignee_id = ${volunteer.id})`,
          )
        }
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
        conditions.push(Prisma.sql`(title ILIKE ${like} OR description ILIKE ${like})`)
      }

      if (input.urgency) conditions.push(Prisma.sql`urgency = ${input.urgency}`)
      if (input.country) conditions.push(Prisma.sql`country = ${input.country}`)
      if (input.localGroup) conditions.push(Prisma.sql`local_group = ${input.localGroup}`)
      if (input.teamId) conditions.push(Prisma.sql`team_id = ${input.teamId}`)

      if (input.isOrgProposed !== undefined) {
        conditions.push(Prisma.sql`is_org_proposed = ${input.isOrgProposed}`)
      }
      if (input.isSeekingHelp !== undefined) {
        conditions.push(Prisma.sql`is_seeking_help = ${input.isSeekingHelp}`)
      }
      if (input.isSeekingOwner !== undefined) {
        conditions.push(
          Prisma.raw(input.isSeekingOwner ? SEEKING_OWNER_SQL : `NOT ${SEEKING_OWNER_SQL}`),
        )
      }
      if (input.isSeekingAny) {
        conditions.push(Prisma.raw(`(is_seeking_help OR ${SEEKING_OWNER_SQL})`))
      }
      if (input.notSeeking) {
        conditions.push(Prisma.raw(`NOT is_seeking_help AND NOT ${SEEKING_OWNER_SQL}`))
      }

      conditions.push(projectScopeSql(volunteer))

      const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      const orderClause = Prisma.raw(
        input.sortBy === 'created_at'
          ? 'ORDER BY created_at DESC, id DESC'
          : input.sortBy === 'urgency'
            ? `ORDER BY ${URGENCY_RANK_SQL}, created_at DESC, id DESC`
            : DEFAULT_PROJECT_ORDER_SQL,
      )

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
  listGrouped: confirmedProcedure
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
        sharedConditions.push(Prisma.sql`(title ILIKE ${like} OR description ILIKE ${like})`)
      }
      if (input.urgency) sharedConditions.push(Prisma.sql`urgency = ${input.urgency}`)
      if (input.country) sharedConditions.push(Prisma.sql`country = ${input.country}`)
      if (input.localGroup) sharedConditions.push(Prisma.sql`local_group = ${input.localGroup}`)
      if (input.teamId) sharedConditions.push(Prisma.sql`team_id = ${input.teamId}`)
      if (input.isOrgProposed !== undefined) {
        sharedConditions.push(Prisma.sql`is_org_proposed = ${input.isOrgProposed}`)
      }
      sharedConditions.push(projectScopeSql(volunteer))

      const seekingSqlStr = `(is_seeking_help OR ${SEEKING_OWNER_SQL})`
      const orderClause = Prisma.raw(DEFAULT_PROJECT_ORDER_SQL)

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
    const { tasks, wantToOwn, skillIds, skillRequiredMap, saveAsDraft } = input
    if (!saveAsDraft && tasks.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'At least one task is required to submit a project proposal',
      })
    }

    // Admins are trusted staff, not volunteers proposing speculative projects — the cap exists
    // to bound unreviewed volunteer proposals, not to limit admin work.
    if (saveAsDraft && !volunteer.isAdmin) {
      const draftCount = await prisma.workItem.count({
        where: {
          type: WorkItemType.PROJECT,
          creatorId: volunteer.id,
          status: ProjectStatus.draft,
          isOrgProposed: false,
        },
      })
      if (draftCount >= MAX_VOLUNTEER_DRAFTS) {
        throw new ORPCError('BAD_REQUEST', {
          message: `You already have ${MAX_VOLUNTEER_DRAFTS} drafts. Publish or delete one before saving another.`,
        })
      }
    }

    // Dates given at creation are a sketch, not a commitment — the baseline stays unset until
    // someone explicitly sets it.
    const scheduleOnCreate: Record<string, unknown> = {}
    applyScheduleWrite(scheduleOnCreate, {
      startDate: input.startDate ?? null,
      durationDays: input.durationDays ?? null,
    })

    const project = await prisma.$transaction(async (tx) => {
      const newProject = await tx.workItem.create({
        data: {
          type: WorkItemType.PROJECT,
          title: input.title,
          description: input.description,
          // A draft stays invisible to admins until the volunteer explicitly publishes it.
          status: saveAsDraft ? ProjectStatus.draft : ProjectStatus.pending_review,
          assigneeId: wantToOwn ? volunteer.id : null,
          creatorId: volunteer.id,
          isOrgProposed: false,
          projectType: input.projectType ?? null,
          estimatedDuration: input.estimatedDuration ?? null,
          timeCommitmentHoursPerWeek: input.timeCommitmentHoursPerWeek ?? null,
          urgency: input.urgency ?? 'medium',
          collaborationLink: input.collaborationLink ?? null,
          country: input.country ?? null,
          ...scheduleOnCreate,
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

    if (!saveAsDraft) {
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
    }

    return {
      id: project.id,
      message: saveAsDraft ? 'Draft saved' : 'Project submitted for review',
    }
  }),

  myDrafts: approvedProcedure.handler(async ({ context }) => {
    const volunteer = context.volunteer
    const drafts = await prisma.workItem.findMany({
      where: {
        type: WorkItemType.PROJECT,
        creatorId: volunteer.id,
        status: ProjectStatus.draft,
        // Org drafts belong to the "Org Projects" admin page's own My Drafts list.
        isOrgProposed: false,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    })
    return drafts
  }),

  publishDraft: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Draft not found' })
      if (project.creatorId !== volunteer.id || project.status !== ProjectStatus.draft) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized to publish this draft' })
      }

      const taskCount = await prisma.workItem.count({
        where: { parentId: input.id, type: WorkItemType.TASK },
      })
      if (taskCount === 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Add at least one task before submitting this draft for review',
        })
      }

      if (project.isOrgProposed || project.templateOriginId !== null) {
        // Org projects, and projects instantiated from a template, skip review entirely —
        // publishing a draft goes straight live. Template-originated projects already came
        // from a vetted structure, so re-review would be redundant (see
        // lib/template-porting.ts).
        const newStatus =
          project.assigneeId === null ? ProjectStatus.ready : ProjectStatus.in_progress
        await prisma.workItem.update({
          where: { id: input.id },
          data: { status: newStatus, updatedAt: new Date() },
        })

        notifyMatchingVolunteers(project.id).catch((e) => console.error('[MATCH NOTIFY]', e))
        if (project.teamId) {
          notifyTeamOfProject(project.teamId, project.id, project.title).catch((e) =>
            console.error('[TEAM NOTIFY]', e),
          )
        }

        return { message: 'Project published' }
      }

      await prisma.workItem.update({
        where: { id: input.id },
        data: { status: ProjectStatus.pending_review, updatedAt: new Date() },
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

      return { message: 'Project submitted for review' }
    }),

  deleteDraft: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Draft not found' })
      if (project.creatorId !== volunteer.id || project.status !== ProjectStatus.draft) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized to delete this draft' })
      }
      await prisma.workItem.delete({ where: { id: input.id } })
      return { message: 'Draft deleted' }
    }),

  getById: confirmedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
        include: projectInclude,
      })

      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      if (!(await canReachProject(project, volunteer))) {
        throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
      }

      const hiddenStatuses: string[] = [
        ProjectStatus.draft,
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
            origin: string
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
          origin: i.origin,
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
            origin: rawMyInterest.origin,
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

      const isMember =
        (project.teamId !== null && viewerTeamIds.has(project.teamId)) ||
        myInterest?.status === InterestStatus.accepted
      const canCreateTasks = canCreateProjectTask(project, volunteer, isMember)

      // A lightweight, non-sensitive roster (name + role only, no application message/bio)
      // any member can see — unlike `interests`, which carries pending applicants' private
      // messages and is restricted to the owner/admin for review.
      const helperRows = await prisma.workItemInterest.findMany({
        where: { workItemId: input.id, status: InterestStatus.accepted },
        include: { volunteer: { select: { name: true } } },
        orderBy: { respondedAt: 'asc' },
      })
      const helpers = helperRows
        .filter((h) => h.volunteerId !== project.assigneeId)
        .map((h) => ({
          id: h.id,
          volunteerId: h.volunteerId,
          volunteerName: h.volunteer.name,
          interestType: h.interestType,
        }))

      // Change requests are between the admins and whoever proposed or runs the project.
      const canSeeReview =
        isAssignee || project.creatorId === volunteer.id || Boolean(volunteer.isAdmin)
      const reviewRequests = canSeeReview
        ? (
            await prisma.projectReviewRequest.findMany({
              where: { projectId: input.id },
              include: { requestedBy: { select: { name: true } } },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            })
          ).map((r) => ({
            id: r.id,
            message: r.message,
            requestedByName: r.requestedBy?.name ?? null,
            createdAt: r.createdAt,
            resolvedAt: r.resolvedAt,
          }))
        : []

      return {
        ...base,
        tasks: mappedTasks,
        interests,
        helpers,
        myInterest,
        canClaimTasks,
        canCreateTasks,
        reviewRequests,
      }
    }),

  resubmit: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
      if (project.creatorId !== volunteer.id && project.assigneeId !== volunteer.id) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized to resubmit this project' })
      }
      if (project.status !== ProjectStatus.needs_discussion) {
        throw new ORPCError('BAD_REQUEST', { message: 'No changes have been requested' })
      }

      const open = await prisma.projectReviewRequest.findFirst({
        where: { projectId: project.id, resolvedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { requestedBy: { select: { id: true, deletedAt: true } } },
      })
      await prisma.workItem.update({
        where: { id: project.id },
        data: { status: ProjectStatus.pending_review, updatedAt: new Date() },
      })
      await prisma.projectReviewRequest.updateMany({
        where: { projectId: project.id, resolvedAt: null },
        data: { resolvedAt: new Date() },
      })
      await clearNotifications('project_needs_discussion', project.id)

      // The admin who asked hears back; with nobody to tell, every admin does.
      const args = [
        'project_resubmitted',
        `Resubmitted: '${project.title}' is ready for another look`,
        `${volunteer.name} made the changes you asked for`,
        `/projects/${project.id}`,
        undefined,
        project.id,
      ] as const
      const requester = open?.requestedBy
      if (requester && !requester.deletedAt) await notifyUser(requester.id, ...args)
      else await notifyAdmins(...args)

      return { message: 'Project resubmitted for review' }
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

      // Until an admin has triaged it, a proposal's status is the admins' to change; the
      // proposer's one move, submitting a draft, goes through publishDraft.
      if (
        newStatus !== undefined &&
        newStatus !== project.status &&
        !volunteer.isAdmin &&
        UNAPPROVED_STATUSES.includes(project.status)
      ) {
        throw new ORPCError('FORBIDDEN', {
          message: 'This project is awaiting admin review, so its status cannot be changed yet',
        })
      }

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
      // A draft has no owner yet, so its creator can set themselves as owner while it's
      // still a draft — the "I want to lead this project" choice from the create form.
      const canReassign =
        isAssignee ||
        Boolean(volunteer.isAdmin) ||
        (isCreator && project.status === ProjectStatus.draft)

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
      applyScheduleWrite(data, body)

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

  expressInterest: confirmedProcedure
    .input(z.object({ projectId: z.number().int() }).merge(ProjectInterestBodySchema))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: {
          id: input.projectId,
          type: WorkItemType.PROJECT,
          status: { notIn: [...TERMINAL_STATUSES, ...UNAPPROVED_STATUSES] },
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
              origin: InterestOrigin.applied,
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
              origin: InterestOrigin.applied,
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

      // Turning down someone already on the project is a removal, not a decline.
      const status =
        input.status === InterestStatus.declined && interest.status === InterestStatus.accepted
          ? InterestStatus.removed
          : input.status

      await prisma.workItemInterest.update({
        where: { id: input.interestId },
        data: {
          status,
          responseMessage: input.responseMessage ?? null,
          respondedAt: new Date(),
        },
      })

      await clearNotifications('new_interest', input.interestId)

      if (status !== InterestStatus.accepted) {
        await releaseTasksHeldBy(input.projectId, interest.volunteerId)
      }

      if (input.status === InterestStatus.accepted && interest.interestType === 'want_to_own') {
        await prisma.workItem.update({
          where: { id: input.projectId },
          data: {
            assigneeId: interest.volunteerId,
            // A new owner starts the work, but never carries a proposal past triage.
            ...(UNAPPROVED_STATUSES.includes(project.status)
              ? {}
              : { status: ProjectStatus.in_progress }),
          },
        })
      }

      await notifyUser(
        interest.volunteerId,
        `interest_${status}`,
        status === InterestStatus.removed
          ? `Removed: you're no longer on '${project.title}'`
          : `${status === InterestStatus.accepted ? 'Accepted' : 'Declined'}: your interest in '${project.title}'`,
        input.responseMessage ?? null,
        `/projects/${input.projectId}`,
        {
          message:
            status === InterestStatus.removed
              ? html`The team has taken you off the project <strong>${project.title}</strong>.`
              : html`The team has <strong>${status}</strong> your interest in the project
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

      return { message: `Interest ${status}` }
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

      // One row per person and project, whatever happened before.
      const existing = await prisma.workItemInterest.findFirst({
        where: { workItemId: input.projectId, volunteerId: input.volunteerId },
      })

      if (existing?.status === InterestStatus.accepted) {
        return { message: 'This volunteer is already assigned to this project' }
      }
      if (existing?.status === InterestStatus.pending) {
        // They applied; the owner said yes.
        await prisma.workItemInterest.update({
          where: { id: existing.id },
          data: { status: InterestStatus.accepted, respondedAt: new Date() },
        })
      } else if (existing) {
        // Declined, removed or withdrawn earlier: this time the owner added them.
        await prisma.workItemInterest.update({
          where: { id: existing.id },
          data: {
            status: InterestStatus.accepted,
            origin: InterestOrigin.added,
            interestType: input.interestType,
            respondedAt: new Date(),
          },
        })
      } else {
        await prisma.workItemInterest.create({
          data: {
            volunteerId: input.volunteerId,
            workItemId: input.projectId,
            interestType: input.interestType,
            status: InterestStatus.accepted,
            origin: InterestOrigin.added,
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
        `Assigned: you're on '${project.title}'`,
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

  listTasks: confirmedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer

      // Task visibility follows the project's: without this any approved volunteer could
      // read the task list of a team-restricted or still-unapproved project by id.
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      if (
        !canViewWorkItem(
          project,
          {
            id: volunteer.id,
            isAdmin: Boolean(volunteer.isAdmin),
            isApproved: volunteer.approvalStatus === ApprovalStatus.approved,
            country: volunteer.country,
          },
          undefined,
          await resolveProjectPrivy(project, volunteer),
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

      const { schedule, origin } = await loadProjectTaskSchedule(project, tasks)

      // Loaded here with the row id so the timeline panel can edit/remove links directly.
      const dependencyRows = await prisma.workItemDependency.findMany({
        where: {
          predecessor: { parentId: input.projectId, type: WorkItemType.TASK },
          successor: { parentId: input.projectId, type: WorkItemType.TASK },
        },
        select: { id: true, predecessorId: true, successorId: true, lagDays: true },
      })

      return {
        tasks: tasks.map((t) => ({
          ...serializeTask(t),
          assignedToName: t.assignee?.name ?? null,
          createdByName: t.creator?.name ?? null,
          sortOrder: t.sortOrder,
        })),
        dependencies: dependencyRows,
        // The Map in `schedule` doesn't cross the wire; the array is keyed by `id`.
        scheduled: schedule.scheduled,
        // The origin is where *derived* tasks begin counting from — today, for a project with
        // no pinned start. A task pinned earlier than that still has to fit on the axis, so the
        // scope runs from whichever comes first.
        scopeStart: schedule.start.getTime() < origin.getTime() ? schedule.start : origin,
        scopeEnd: schedule.end,
        // Sent so the client can recompute this exact schedule while a drag is in flight.
        scopeOrigin: origin,
        canManageTasks: canManageProject(project, volunteer),
        canCreateTasks: canCreateProjectTask(
          project,
          volunteer,
          await resolveProjectMembership(project.teamId, project.id, volunteer.id),
        ),
      }
    }),

  getTask: confirmedProcedure
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
          assignee: { select: { name: true, consentContactableByProjectOwners: true } },
          creator: { select: { name: true } },
        },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      if (
        !canViewWorkItem(
          task,
          {
            id: volunteer.id,
            isAdmin: Boolean(volunteer.isAdmin),
            isApproved: volunteer.approvalStatus === ApprovalStatus.approved,
            country: volunteer.country,
          },
          project,
          await resolveProjectPrivy(project, volunteer),
        )
      ) {
        throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      }

      const canClaim =
        project.assigneeId === volunteer.id ||
        Boolean(volunteer.isAdmin) ||
        !(await isBlockedFromClaiming(input.projectId, volunteer.id))

      const [predecessorRows, siblingTasks, assigneeUpdates] = await Promise.all([
        prisma.workItemDependency.findMany({
          where: { successorId: input.taskId },
          include: { predecessor: { select: { id: true, title: true } } },
        }),
        prisma.workItem.findMany({
          where: {
            parentId: input.projectId,
            type: WorkItemType.TASK,
            id: { not: input.taskId },
          },
          select: { id: true, title: true },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.workItemComment.count({
          where: { workItemId: task.id, authorId: task.assigneeId ?? -1 },
        }),
      ])

      return {
        ...serializeTask(task),
        // The assignee has said something on the task, so it reads as under way.
        assigneeHasPosted: assigneeUpdates > 0,
        projectTitle: project.title,
        projectOwnerId: project.assigneeId,
        canClaim,
        canManage: canManageProject(project, volunteer),
        assignedToName: task.assignee?.name ?? null,
        assigneeContactable: task.assignee?.consentContactableByProjectOwners ?? false,
        createdByName: task.creator?.name ?? null,
        featuredAsQuickTask: task.featuredAsQuickTask ?? false,
        predecessors: predecessorRows.map((r) => ({
          dependencyId: r.id,
          predecessorId: r.predecessorId,
          predecessorTitle: r.predecessor.title,
          lagDays: r.lagDays,
        })),
        siblingTasks,
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

      const isMember = await resolveProjectMembership(project.teamId, project.id, volunteer.id)
      if (!canCreateProjectTask(project, volunteer, isMember)) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Only project owner, admin, or a project member can create tasks',
        })
      }

      // Dates given at creation are a sketch; the baseline is set deliberately, later.
      const scheduleOnCreate: Record<string, unknown> = {}
      applyScheduleWrite(scheduleOnCreate, {
        startDate: input.startDate ?? null,
        durationDays: input.durationDays ?? null,
      })

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
            ...scheduleOnCreate,
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

      assertCanManageProject(project, volunteer, 'Only project owner or admin can reorder tasks')

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

  /**
   * Re-baseline: copy the current schedule onto the baseline track. This is the only thing
   * that moves a baseline after it is first captured, so the plan-vs-actual comparison stays
   * anchored to a deliberate commitment. Skips items with no current schedule.
   */
  setBaseline: approvedProcedure
    .input(
      z.object({ projectId: z.number().int(), includeTasks: z.boolean().optional().default(true) }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const project = await prisma.workItem.findFirst({
        where: { id: input.projectId, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })
      assertCanManageProject(project, volunteer, 'Only project owner or admin can re-baseline')

      const targets = [
        project,
        ...(input.includeTasks
          ? await prisma.workItem.findMany({
              where: { parentId: input.projectId, type: WorkItemType.TASK },
            })
          : []),
      ]
      const now = new Date()
      await prisma.$transaction(
        targets
          .filter((t) => t.startDate !== null || t.durationDays !== null)
          .map((t) =>
            prisma.workItem.update({
              where: { id: t.id },
              data: {
                baselineStartDate: t.startDate,
                baselineDurationDays: t.durationDays,
                baselineSetAt: now,
              },
            }),
          ),
      )
      return { message: 'Baseline updated' }
    }),

  /**
   * Portfolio roadmap: one placed bar per visible project, plus the project-to-project edges
   * between them. Defaults to active statuses; completed/archived are opt-in via `statuses`.
   * Reuses the team-visibility rule from `list` — a team-tagged project stays hidden from
   * non-members.
   */
  ganttOverview: confirmedProcedure
    .input(
      z.object({
        statuses: z.array(z.string()).optional(),
        teamId: z.number().int().optional(),
        country: z.string().optional(),
        localGroup: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const requested =
        input.statuses && input.statuses.length > 0
          ? input.statuses
          : [ProjectStatus.ready, ProjectStatus.in_progress, ProjectStatus.on_hold]
      // Proposals awaiting triage are the admins' to see across the organisation.
      const statuses = volunteer.isAdmin
        ? requested
        : requested.filter((s) => !UNAPPROVED_STATUSES.includes(s))

      const visible = await prisma.workItem.findMany({
        where: {
          type: WorkItemType.PROJECT,
          status: { in: statuses },
          ...(input.teamId ? { teamId: input.teamId } : {}),
          ...(input.country ? { country: input.country } : {}),
          ...(input.localGroup ? { localGroup: input.localGroup } : {}),
          AND: [projectScopeWhere(volunteer)],
        },
        select: { id: true, title: true, status: true },
      })

      const visibleIds = visible.map((p) => p.id)
      const allEdges = await loadProjectEdges()
      const edges = allEdges.filter(
        (e) => visibleIds.includes(e.predecessorId) && visibleIds.includes(e.successorId),
      )
      const schedule = await scheduleProjectsByIds(visibleIds, edges)

      // Task counts in one grouped query.
      const counts = await prisma.workItem.groupBy({
        by: ['parentId'],
        where: { type: WorkItemType.TASK, parentId: { in: visibleIds } },
        _count: { _all: true },
      })
      const countByProject = new Map(counts.map((c) => [c.parentId, c._count._all]))

      return {
        projects: visible.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          taskCount: countByProject.get(p.id) ?? 0,
          placement: schedule.byId.get(p.id) ?? null,
        })),
        dependencies: edges,
        scopeStart: schedule.start,
        scopeEnd: schedule.end,
      }
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
      // Every editable field except status/assigneeId must be listed here. A field missing
      // from this check would ride along on the self-claim path below, letting any volunteer
      // who can claim the task edit it too.
      const onlyTouchesStatusAndAssignee =
        input.data.title === undefined &&
        input.data.description === undefined &&
        input.data.estimatedHours === undefined &&
        input.data.deadline === undefined &&
        input.data.featuredAsQuickTask === undefined &&
        input.data.isAnchor === undefined &&
        input.data.startDate === undefined &&
        input.data.durationDays === undefined
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

      const isDraftCreator =
        project.creatorId === volunteer.id && project.status === ProjectStatus.draft
      if (!isAssignee && !volunteer.isAdmin && !isSelfClaim && !isMarkingDone && !isDraftCreator) {
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
      if (input.data.isAnchor !== undefined) data.isAnchor = input.data.isAnchor
      applyScheduleWrite(data, input.data)
      if (input.data.status !== undefined) {
        data.status = input.data.status
        if (input.data.status === TaskStatus.completed) data.completedAt = new Date()
        else if (input.data.status === TaskStatus.in_progress) {
          // Actual start, recorded once. Re-entering in_progress after a pause keeps the
          // original date — the work did start then.
          if (task.startedAt === null) data.startedAt = new Date()
        } else if (input.data.status === TaskStatus.open) {
          data.assigneeId = null
          data.completedAt = null
          // Back to unstarted: the actuals describe work that is no longer claimed.
          data.startedAt = null
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
          // Actual start, recorded once — reassigning a task in flight does not restart it.
          ...(task.startedAt === null ? { startedAt: new Date() } : {}),
        },
      })

      await notifyUser(
        input.assigneeId,
        'task_assigned',
        `Assigned: a task on '${project.title}'`,
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

      const task = await prisma.workItem.findFirst({
        where: { id: input.taskId, parentId: input.projectId, type: WorkItemType.TASK },
        select: { creatorId: true },
      })
      if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })

      if (!canDeleteProjectTask(project, task, volunteer)) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Only project owner, admin, or the task creator can delete this task',
        })
      }

      const deleted = await prisma.workItem.deleteMany({
        where: { id: input.taskId, parentId: input.projectId, type: WorkItemType.TASK },
      })
      if (deleted.count === 0) throw new ORPCError('NOT_FOUND', { message: 'Task not found' })
      return { message: 'Task deleted' }
    }),
}
