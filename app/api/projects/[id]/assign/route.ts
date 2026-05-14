import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'
import { createNotification } from '@/lib/project'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const isAdmin = volunteer.isAdmin
  if (!isOwner && !isAdmin) {
    return Response.json(
      { detail: 'Only project owner or admin can assign volunteers' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const volunteerId = body.volunteer_id as number
  const interestType = (body.interest_type as string) || 'want_to_contribute'

  if (!volunteerId) {
    return Response.json({ detail: 'volunteer_id is required' }, { status: 400 })
  }

  const existing = await prisma.projectInterest.findFirst({
    where: { projectId, volunteerId, status: { not: 'withdrawn' } },
  })

  if (existing) {
    if (existing.status === 'pending') {
      await prisma.projectInterest.update({
        where: { id: existing.id },
        data: { status: 'accepted', respondedAt: new Date() },
      })
    } else if (existing.status === 'accepted') {
      return Response.json({ message: 'This volunteer is already assigned to this project' })
    }
  } else {
    await prisma.projectInterest.create({
      data: {
        volunteerId,
        projectId,
        interestType,
        message: 'Assigned by admin/owner',
        status: 'accepted',
        respondedAt: new Date(),
      },
    })
  }

  if (interestType === 'want_to_own' && project.isSeekingOwner) {
    await prisma.project.update({ where: { id: projectId }, data: { isSeekingOwner: false } })
  }

  const assignee = await prisma.volunteer.findFirst({
    where: { id: volunteerId },
    select: { name: true, email: true },
  })

  if (assignee) {
    createNotification(
      volunteerId,
      'assigned_to_project',
      `You've been assigned to '${project.title}'`,
      `Assigned by ${volunteer.name}`,
      `/projects/${projectId}`,
    ).catch((e) => console.error('[NOTIFY ERROR]', e))

    if (assignee.email) {
      sendProjectNotificationEmail(
        assignee.email,
        assignee.name,
        `You've been assigned to '${project.title}'`,
        `<strong>${volunteer.name}</strong> has assigned you to the project <strong>${project.title}</strong>.`,
        project.title,
        projectId,
      ).catch((e) => console.error('[EMAIL ERROR]', e))
    }
  }

  return Response.json({ message: 'Volunteer assigned to project' })
}
