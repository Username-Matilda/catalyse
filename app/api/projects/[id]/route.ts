import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'
import { parseBody } from '@/lib/errors'
import { UpdateProjectSchema } from '@/lib/schemas'
import {
  serializeProject,
  projectInclude,
  EnrichedProject,
  createNotification,
} from '@/lib/project'

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
  'seeking_owner',
  'seeking_help',
  'needs_tasks',
  'in_progress',
  'on_hold',
  'completed',
])

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  const isPending = Boolean(
    volunteer && volunteer.approvalStatus !== 'APPROVED' && !volunteer.isAdmin,
  )

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
    if (!isProposer && !isAdmin)
      return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  let volunteerSkillIds: Set<number> | undefined
  if (volunteer) {
    const v = await prisma.volunteer.findUnique({
      where: { id: volunteer.id },
      select: { skills: { select: { skillId: true } } },
    })
    volunteerSkillIds = new Set((v?.skills ?? []).map((s) => s.skillId))
  }

  let serialized = serializeProject(project as EnrichedProject, volunteerSkillIds) as Record<
    string,
    unknown
  >
  if (isPending) {
    serialized = {
      ...serialized,
      owner: null,
      ownerId: null,
      proposedBy: null,
      proposedById: null,
    }
  }

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
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
  ])

  // Reorder tasks: open first, assigned second, done third
  const taskOrder: Record<string, number> = { open: 0, assigned: 1, done: 2 }
  const sortedTasks = tasks.sort((a, b) => (taskOrder[a.status] ?? 0) - (taskOrder[b.status] ?? 0))

  serialized.updates = updates.map((u) => ({
    id: u.id,
    projectId: u.projectId,
    authorId: u.authorId,
    content: u.content,
    createdAt: u.createdAt,
    authorName: u.author?.name ?? null,
  }))

  serialized.tasks = sortedTasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    assignedToId: isPending ? null : t.assignedToId,
    assignedToName: isPending ? null : (t.assignedTo?.name ?? null),
    createdById: isPending ? null : t.createdById,
    createdByName: isPending ? null : (t.createdBy?.name ?? null),
    status: t.status,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
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

      serialized.interests = interests.map((i) => ({
        id: i.id,
        volunteerId: i.volunteerId,
        projectId: i.projectId,
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

    const myInterest = await prisma.projectInterest.findFirst({
      where: { projectId, volunteerId: volunteer.id, status: { not: 'withdrawn' } },
    })
    serialized.myInterest = myInterest
      ? {
          id: myInterest.id,
          volunteerId: myInterest.volunteerId,
          projectId: myInterest.projectId,
          interestType: myInterest.interestType,
          message: myInterest.message,
          status: myInterest.status,
          responseMessage: myInterest.responseMessage,
          createdAt: myInterest.createdAt,
          respondedAt: myInterest.respondedAt,
        }
      : null
  }

  return Response.json(serialized)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(UpdateProjectSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const newStatus = body.status

  if (newStatus && newStatus === 'in_progress' && project.status !== 'in_progress') {
    const openTaskCount = await prisma.projectTask.count({
      where: { projectId, status: { not: 'done' } },
    })
    if (openTaskCount === 0) {
      return Response.json(
        { detail: 'A project cannot be moved to In Progress without at least one open task' },
        { status: 400 },
      )
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

  if (body.timeCommitmentHoursPerWeek !== undefined) {
    data.timeCommitmentHoursPerWeek = body.timeCommitmentHoursPerWeek
  }
  if (body.ownerId !== undefined) {
    data.ownerId = body.ownerId
  }

  if (newStatus !== undefined) {
    if (isAdmin) {
      data.status = newStatus
    } else if (isOwner && OWNER_ALLOWED_STATUSES.has(newStatus)) {
      data.status = newStatus
    }
  }

  if (body.isSeekingHelp !== undefined) data.isSeekingHelp = body.isSeekingHelp
  if (body.isSeekingOwner !== undefined) data.isSeekingOwner = body.isSeekingOwner

  if (data.status === 'completed' || data.status === 'archived') {
    if (data.isSeekingHelp === undefined) data.isSeekingHelp = false
    if (data.isSeekingOwner === undefined) data.isSeekingOwner = false
  }

  data.updatedAt = new Date()

  await prisma.project.update({ where: { id: projectId }, data })

  if (body.skillIds !== undefined) {
    const skillIds = Array.isArray(body.skillIds) ? (body.skillIds as number[]) : []
    const skillRequiredMap =
      body.skillRequiredMap && typeof body.skillRequiredMap === 'object'
        ? (body.skillRequiredMap as Record<string | number, boolean>)
        : {}
    await prisma.projectSkill.deleteMany({ where: { projectId } })
    if (skillIds.length > 0) {
      await prisma.projectSkill.createMany({
        data: skillIds.map((skillId) => ({
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
    if (project.proposedById && project.proposedById !== volunteer.id)
      notifyIds.add(project.proposedById)

    const accepted = await prisma.projectInterest.findMany({
      where: { projectId, status: 'accepted' },
      select: { volunteerId: true },
    })
    for (const row of accepted) {
      if (row.volunteerId !== volunteer.id) notifyIds.add(row.volunteerId)
    }

    for (const vid of notifyIds) {
      createNotification(
        vid,
        'project_status_changed',
        `'${project.title}' is now ${statusLabel}`,
        `Status changed by ${volunteer.name}`,
        `/projects/${projectId}`,
      ).catch((e) => console.error('[NOTIFY ERROR]', e))

      const vol = await prisma.volunteer.findFirst({
        where: { id: vid, deletedAt: null },
        select: { name: true, email: true },
      })
      if (vol?.email) {
        sendProjectNotificationEmail({
          to: vol.email,
          name: vol.name,
          subject: `'${project.title}' is now ${statusLabel}`,
          message: `The project <strong>${project.title}</strong> has been updated to <strong>${statusLabel}</strong>.`,
          projectTitle: project.title,
          projectId,
        }).catch((e) => console.error('[EMAIL ERROR]', e))
      }
    }
  }

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: projectInclude,
  })
  return Response.json(serializeProject(updated as EnrichedProject))
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer || !volunteer.isAdmin) {
    return Response.json(
      { detail: volunteer ? 'Admin access required' : 'Authentication required' },
      { status: volunteer ? 403 : 401 },
    )
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  await prisma.project.delete({ where: { id: projectId } })

  return Response.json({ message: `Project '${project.title}' deleted` })
}
