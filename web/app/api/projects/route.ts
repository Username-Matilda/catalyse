import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'
import { serializeProject, projectInclude, EnrichedProject, sortProjects, createNotification } from '@/lib/project'
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
  const sortBy = searchParams.get('sort_by') ?? 'created_at'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  const skillIds = skillIdsParam
    ? skillIdsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    : null

  const where: Record<string, unknown> = {}

  if (status) {
    where.status = status
  } else {
    where.status = { notIn: ['archived', 'pending_review', 'needs_discussion'] }
  }

  if (skillIds && skillIds.length > 0) {
    where.skills = { some: { skillId: { in: skillIds } } }
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
    ]
  }

  if (urgency) where.urgency = urgency
  if (country) where.country = country
  if (localGroup) where.localGroup = localGroup
  if (isOrgProposedParam !== null) {
    where.isOrgProposed = isOrgProposedParam === 'true' || isOrgProposedParam === '1'
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))

  let volunteerSkillIds: Set<number> | undefined
  if (volunteer) {
    const v = await prisma.volunteer.findUnique({
      where: { id: volunteer.id },
      select: { skills: { select: { skillId: true } } },
    })
    volunteerSkillIds = new Set((v?.skills ?? []).map(s => s.skillId))
  }

  const [total, rawProjects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({ where, include: projectInclude, orderBy: { createdAt: 'desc' } }),
  ])

  let projects = rawProjects.map(p => serializeProject(p as EnrichedProject, volunteerSkillIds))

  projects = sortProjects(projects)

  if (sortBy === 'match' && volunteerSkillIds && volunteerSkillIds.size > 0) {
    projects.sort((a, b) => (b.match?.overall_score ?? 0) - (a.match?.overall_score ?? 0))
  }

  const paged = projects.slice(offset, offset + limit)

  return Response.json({ projects: paged, total })
}

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
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
  const tasks = Array.isArray(body.tasks) ? body.tasks as Array<{ title: string; description?: string }> : []
  if (errs.length) return validationError(errs)
  if (tasks.length === 0) {
    // TODO: should be 422 (validation error), kept as 400 to match FastAPI behaviour
    return Response.json({ detail: 'At least one task is required to submit a project proposal' }, { status: 400 })
  }

  const wantToOwn = body.want_to_own === true
  const skillIds = Array.isArray(body.skill_ids) ? (body.skill_ids as number[]) : []
  const skillRequiredMap = (body.skill_required_map && typeof body.skill_required_map === 'object')
    ? (body.skill_required_map as Record<string | number, boolean>)
    : {}

  const project = await prisma.$transaction(async tx => {
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
        data: skillIds.map(skillId => ({
          projectId: newProject.id,
          skillId,
          isRequired: skillRequiredMap[skillId] !== false,
        })),
      })
    }

    await tx.projectTask.createMany({
      data: tasks.map(t => ({
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
      admin.id, 'new_project_proposal',
      `New project proposal: ${project.title}`,
      `Proposed by ${volunteer.name}`,
      '/static/admin/triage.html'
    ).catch(e => console.error('[NOTIFY ERROR]', e))

    if (admin.email) {
      sendProjectNotificationEmail(
        admin.email, admin.name,
        `New project proposal: ${project.title}`,
        `<strong>${volunteer.name}</strong> has submitted a new project proposal: <strong>${project.title}</strong>. Please review it in the triage queue.`,
        project.title, project.id
      ).catch(e => console.error('[EMAIL ERROR]', e))
    }
  }

  return Response.json({ id: project.id, message: 'Project submitted for review' })
}
