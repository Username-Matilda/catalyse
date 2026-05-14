import { NextRequest } from 'next/server'
import { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'
import {
  serializeProject,
  projectInclude,
  EnrichedProject,
  createNotification,
} from '@/lib/project'
import { fieldError, validationError } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const skillIdsParam = searchParams.get('skill_ids')
  const search = searchParams.get('search')
  const urgency = searchParams.get('urgency')
  const country = searchParams.get('country')
  const localGroup = searchParams.get('local_group')
  const isOrgProposedParam = searchParams.get('is_org_proposed')
  const isSeekingHelpParam = searchParams.get('is_seeking_help')
  const isSeekingOwnerParam = searchParams.get('is_seeking_owner')
  // TODO: refactor — is_seeking_any and not_seeking are not in the Python API; added for the Needs filter
  const isSeekingAnyParam = searchParams.get('is_seeking_any')
  const notSeekingParam = searchParams.get('not_seeking')
  const sortBy = searchParams.get('sort_by') ?? 'created_at'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  const skillIds = skillIdsParam
    ? skillIdsParam
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
    : null

  // Build WHERE as raw SQL so we can use CASE WHEN in ORDER BY (Prisma orderBy can't express OR across two fields)
  const conditions: Prisma.Sql[] = []

  if (status) {
    conditions.push(Prisma.sql`status = ${status}`)
  } else {
    conditions.push(Prisma.raw(`status NOT IN ('archived', 'pending_review', 'needs_discussion')`))
  }

  if (skillIds && skillIds.length > 0) {
    conditions.push(
      Prisma.sql`id IN (SELECT project_id FROM project_skills WHERE skill_id IN (${Prisma.join(skillIds)}))`,
    )
  }

  if (search) {
    const like = `%${search}%`
    conditions.push(Prisma.sql`(title LIKE ${like} OR description LIKE ${like})`)
  }

  if (urgency) conditions.push(Prisma.sql`urgency = ${urgency}`)
  if (country) conditions.push(Prisma.sql`country = ${country}`)
  if (localGroup) conditions.push(Prisma.sql`local_group = ${localGroup}`)

  if (isOrgProposedParam !== null) {
    conditions.push(
      Prisma.sql`is_org_proposed = ${isOrgProposedParam === 'true' || isOrgProposedParam === '1' ? 1 : 0}`,
    )
  }
  if (isSeekingHelpParam !== null) {
    conditions.push(
      Prisma.sql`is_seeking_help = ${isSeekingHelpParam === 'true' || isSeekingHelpParam === '1' ? 1 : 0}`,
    )
  }
  if (isSeekingOwnerParam !== null) {
    conditions.push(
      Prisma.sql`is_seeking_owner = ${isSeekingOwnerParam === 'true' || isSeekingOwnerParam === '1' ? 1 : 0}`,
    )
  }
  if (isSeekingAnyParam === 'true') {
    conditions.push(Prisma.raw(`(is_seeking_help = 1 OR is_seeking_owner = 1)`))
  }
  if (notSeekingParam === 'true') {
    conditions.push(Prisma.raw(`is_seeking_help = 0 AND is_seeking_owner = 0`))
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
  const orderClause = Prisma.raw(`ORDER BY
    CASE WHEN is_seeking_help = 1 OR is_seeking_owner = 1 THEN 0 ELSE 1 END,
    CASE urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    created_at DESC`)

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  const isPending = Boolean(volunteer && volunteer.approvalStatus !== 'APPROVED' && !volunteer.isAdmin)

  let volunteerSkillIds: Set<number> | undefined
  if (volunteer) {
    const v = await prisma.volunteer.findUnique({
      where: { id: volunteer.id },
      select: { skills: { select: { skillId: true } } },
    })
    volunteerSkillIds = new Set((v?.skills ?? []).map((s) => s.skillId))
  }

  // For match sort, fetch all IDs ordered; otherwise paginate in SQL
  const [countResult, idRows] = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM projects ${whereClause}`,
    sortBy === 'match'
      ? prisma.$queryRaw<{ id: number }[]>`SELECT id FROM projects ${whereClause} ${orderClause}`
      : prisma.$queryRaw<
          { id: number }[]
        >`SELECT id FROM projects ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
  ])

  const total = Number(countResult[0].count)
  const ids = idRows.map((r) => r.id)

  const rawProjects = await prisma.project.findMany({
    where: { id: { in: ids } },
    include: projectInclude,
  })

  // Reorder to match SQL sort (findMany doesn't preserve IN order)
  const projectMap = new Map(rawProjects.map((p) => [p.id, p]))
  const projects = ids
    .map((id) => projectMap.get(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .map((p) => {
      const serialized = serializeProject(p as EnrichedProject, volunteerSkillIds)
      if (isPending) {
        return { ...serialized, owner: null, owner_id: null, proposed_by: null, proposed_by_id: null }
      }
      return serialized
    })

  if (sortBy === 'match' && volunteerSkillIds && volunteerSkillIds.size > 0) {
    projects.sort((a, b) => (b.match?.overall_score ?? 0) - (a.match?.overall_score ?? 0))
    return Response.json({ projects: projects.slice(offset, offset + limit), total })
  }

  return Response.json({ projects, total })
}

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }
  if (volunteer.approvalStatus !== 'APPROVED' && !volunteer.isAdmin) {
    return Response.json({ detail: 'Your account is pending approval' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    errs.push(fieldError('title', 'Title is required'))
  }
  if (!body.description || typeof body.description !== 'string' || body.description.length < 10) {
    errs.push(fieldError('description', 'Description must be at least 10 characters'))
  }
  const tasks = Array.isArray(body.tasks)
    ? (body.tasks as Array<{ title: string; description?: string }>)
    : []
  if (errs.length) return validationError(errs)
  if (tasks.length === 0) {
    // TODO: should be 422 (validation error), kept as 400 to match FastAPI behaviour
    return Response.json(
      { detail: 'At least one task is required to submit a project proposal' },
      { status: 400 },
    )
  }

  const wantToOwn = body.want_to_own === true
  const skillIds = Array.isArray(body.skill_ids) ? (body.skill_ids as number[]) : []
  const skillRequiredMap =
    body.skill_required_map && typeof body.skill_required_map === 'object'
      ? (body.skill_required_map as Record<string | number, boolean>)
      : {}

  const project = await prisma.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        title: body.title as string,
        description: body.description as string,
        status: 'pending_review',
        ownerId: wantToOwn ? volunteer.id : null,
        proposedById: volunteer.id,
        isOrgProposed: false,
        projectType: (body.project_type as string | null) ?? null,
        estimatedDuration: (body.estimated_duration as string | null) ?? null,
        timeCommitmentHoursPerWeek: (body.time_commitment_hours_per_week as number | null) ?? null,
        urgency: (body.urgency as string) || 'medium',
        collaborationLink: (body.collaboration_link as string | null) ?? null,
        country: (body.country as string | null) ?? null,
        localGroup: (body.local_group as string | null) ?? null,
        isSeekingHelp: body.is_seeking_help !== false,
        isSeekingOwner: !wantToOwn,
      },
    })

    if (skillIds.length > 0) {
      await tx.projectSkill.createMany({
        data: skillIds.map((skillId) => ({
          projectId: newProject.id,
          skillId,
          isRequired: skillRequiredMap[skillId] !== false,
        })),
      })
    }

    await tx.projectTask.createMany({
      data: tasks.map((t) => ({
        projectId: newProject.id,
        title: t.title,
        description: t.description ?? null,
        createdById: volunteer.id,
      })),
    })

    return newProject
  })

  const admins = await prisma.volunteer.findMany({
    where: { isAdmin: true, deletedAt: null },
    select: { id: true, name: true, email: true },
  })

  for (const admin of admins) {
    createNotification(
      admin.id,
      'new_project_proposal',
      `New project proposal: ${project.title}`,
      `Proposed by ${volunteer.name}`,
      '/admin/triage',
    ).catch((e) => console.error('[NOTIFY ERROR]', e))

    if (admin.email) {
      sendProjectNotificationEmail(
        admin.email,
        admin.name,
        `New project proposal: ${project.title}`,
        `<strong>${volunteer.name}</strong> has submitted a new project proposal: <strong>${project.title}</strong>. Please review it in the triage queue.`,
        project.title,
        project.id,
      ).catch((e) => console.error('[EMAIL ERROR]', e))
    }
  }

  return Response.json({ id: project.id, message: 'Project submitted for review' })
}
