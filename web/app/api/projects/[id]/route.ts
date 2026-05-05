import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'
import { serializeProject, projectInclude, EnrichedProject, createNotification } from '@/lib/project'

const STATUS_LABELS: Record<string, string> = {
  seeking_owner: 'Seeking Owner',
  seeking_help: 'Seeking Help',
  needs_tasks: 'Needs Tasks',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
}

const OWNER_ALLOWED_STATUSES = new Set([
  'seeking_owner', 'seeking_help', 'needs_tasks', 'in_progress', 'on_hold', 'completed',
])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: projectInclude,
  })

  if (!project) {
    return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  const hiddenStatuses = ['pending_review', 'needs_discussion']
  if (hiddenStatuses.includes(project.status)) {
    if (!volunteer) return Response.json({ detail: 'Project not found' }, { status: 404 })
    const isProposer = project.proposedById === volunteer.id
    const isAdmin = volunteer.isAdmin
    if (!isProposer && !isAdmin) return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  let volunteerSkillIds: Set<number> | undefined
  if (volunteer) {
    const v = await prisma.volunteer.findUnique({
      where: { id: volunteer.id },
      select: { skills: { select: { skillId: true } } },
    })
    volunteerSkillIds = new Set((v?.skills ?? []).map(s => s.skillId))
  }

  const serialized = serializeProject(project as EnrichedProject, volunteerSkillIds) as Record<string, unknown>

  const [updates, tasks] = await Promise.all([
    prisma.projectUpdate.findMany({
      where: { projectId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.projectTask.findMany({
      where: { projectId },
      include: {
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    }),
  ])

  // Reorder tasks: open first, assigned second, done third
  const taskOrder: Record<string, number> = { open: 0, assigned: 1, done: 2 }
  const sortedTasks = tasks.sort((a, b) => (taskOrder[a.status] ?? 0) - (taskOrder[b.status] ?? 0))

  serialized.updates = updates.map(u => ({
    id: u.id,
    project_id: u.projectId,
    author_id: u.authorId,
    content: u.content,
    created_at: u.createdAt,
    author_name: u.author?.name ?? null,
  }))

  serialized.tasks = sortedTasks.map(t => ({
    id: t.id,
    project_id: t.projectId,
    title: t.title,
    description: t.description,
    assigned_to_id: t.assignedToId,
    assigned_to_name: t.assignedTo?.name ?? null,
    created_by_id: t.createdById,
    created_by_name: t.createdBy?.name ?? null,
    status: t.status,
    completed_at: t.completedAt,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }))

  if (volunteer) {
    const isOwner = project.ownerId === volunteer.id
    const isAdmin = volunteer.isAdmin

    if (isOwner || isAdmin) {
      const interests = await prisma.projectInterest.findMany({
        where: { projectId },
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

      serialized.interests = interests.map(i => ({
        id: i.id,
        volunteer_id: i.volunteerId,
        project_id: i.projectId,
        interest_type: i.interestType,
        message: i.message,
        status: i.status,
        response_message: i.responseMessage,
        created_at: i.createdAt,
        responded_at: i.respondedAt,
        volunteer_name: i.volunteer.name,
        volunteer_bio: i.volunteer.bio,
        volunteer_skills: i.volunteer.skills.map(vs => ({
          id: vs.skill.id,
          name: vs.skill.name,
          category_name: vs.skill.category.name,
          proficiency_level: vs.proficiencyLevel,
        })),
      }))
    }

    const myInterest = await prisma.projectInterest.findFirst({
      where: { projectId, volunteerId: volunteer.id, status: { not: 'withdrawn' } },
    })
    serialized.my_interest = myInterest
      ? {
          id: myInterest.id,
          volunteer_id: myInterest.volunteerId,
          project_id: myInterest.projectId,
          interest_type: myInterest.interestType,
          message: myInterest.message,
          status: myInterest.status,
          response_message: myInterest.responseMessage,
          created_at: myInterest.createdAt,
          responded_at: myInterest.respondedAt,
        }
      : null
  }

  return Response.json(serialized)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  const isOwner = project.ownerId === volunteer.id
  const isProposer = project.proposedById === volunteer.id
  const isAdmin = volunteer.isAdmin

  if (!isOwner && !isProposer && !isAdmin) {
    return Response.json({ detail: 'Not authorized to edit this project' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const newStatus = body.status as string | undefined

  if (newStatus && newStatus === 'in_progress' && project.status !== 'in_progress') {
    const openTaskCount = await prisma.projectTask.count({
      where: { projectId, status: { not: 'done' } },
    })
    if (openTaskCount === 0) {
      return Response.json(
        { detail: 'A project cannot be moved to In Progress without at least one open task' },
        { status: 400 }
      )
    }
  }

  const data: Record<string, unknown> = {}

  const stringFields = ['title', 'description', 'project_type', 'estimated_duration',
    'urgency', 'collaboration_link', 'country', 'local_group', 'outcome', 'outcome_notes'] as const
  for (const field of stringFields) {
    if (body[field] !== undefined) data[field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = body[field]
  }

  if (body.time_commitment_hours_per_week !== undefined) {
    data.timeCommitmentHoursPerWeek = body.time_commitment_hours_per_week
  }
  if (body.owner_id !== undefined) {
    data.ownerId = body.owner_id
  }

  if (newStatus !== undefined) {
    if (isAdmin) {
      data.status = newStatus
    } else if (isOwner && OWNER_ALLOWED_STATUSES.has(newStatus)) {
      data.status = newStatus
    }
  }

  if (body.is_seeking_help !== undefined) data.isSeekingHelp = body.is_seeking_help
  if (body.is_seeking_owner !== undefined) data.isSeekingOwner = body.is_seeking_owner

  if (data.status === 'completed' || data.status === 'archived') {
    if (data.isSeekingHelp === undefined) data.isSeekingHelp = false
    if (data.isSeekingOwner === undefined) data.isSeekingOwner = false
  }

  data.updatedAt = new Date()

  await prisma.project.update({ where: { id: projectId }, data })

  if (body.skill_ids !== undefined) {
    const skillIds = Array.isArray(body.skill_ids) ? (body.skill_ids as number[]) : []
    const skillRequiredMap = (body.skill_required_map && typeof body.skill_required_map === 'object')
      ? (body.skill_required_map as Record<string | number, boolean>)
      : {}
    await prisma.projectSkill.deleteMany({ where: { projectId } })
    if (skillIds.length > 0) {
      await prisma.projectSkill.createMany({
        data: skillIds.map(skillId => ({
          projectId,
          skillId,
          isRequired: skillRequiredMap[skillId] !== false,
        })),
      })
    }
  }

  if (newStatus && newStatus !== project.status) {
    const statusLabel = STATUS_LABELS[newStatus] ?? newStatus

    const notifyIds = new Set<number>()
    if (project.ownerId && project.ownerId !== volunteer.id) notifyIds.add(project.ownerId)
    if (project.proposedById && project.proposedById !== volunteer.id) notifyIds.add(project.proposedById)

    const accepted = await prisma.projectInterest.findMany({
      where: { projectId, status: 'accepted' },
      select: { volunteerId: true },
    })
    for (const row of accepted) {
      if (row.volunteerId !== volunteer.id) notifyIds.add(row.volunteerId)
    }

    for (const vid of notifyIds) {
      createNotification(
        vid, 'project_status_changed',
        `'${project.title}' is now ${statusLabel}`,
        `Status changed by ${volunteer.name}`,
        `/projects/${projectId}`
      ).catch(e => console.error('[NOTIFY ERROR]', e))

      const vol = await prisma.volunteer.findFirst({
        where: { id: vid, deletedAt: null },
        select: { name: true, email: true },
      })
      if (vol?.email) {
        sendProjectNotificationEmail(
          vol.email, vol.name,
          `'${project.title}' is now ${statusLabel}`,
          `The project <strong>${project.title}</strong> has been updated to <strong>${statusLabel}</strong>.`,
          project.title, projectId
        ).catch(e => console.error('[EMAIL ERROR]', e))
      }
    }
  }

  const updated = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude })
  return Response.json(serializeProject(updated as EnrichedProject))
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer || !volunteer.isAdmin) {
    return Response.json({ detail: volunteer ? 'Admin access required' : 'Authentication required' }, { status: volunteer ? 403 : 401 })
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  await prisma.project.delete({ where: { id: projectId } })

  return Response.json({ message: `Project '${project.title}' deleted` })
}
