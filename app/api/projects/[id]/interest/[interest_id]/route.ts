import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'
import { createNotification } from '@/lib/project'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; interest_id: string }> },
) {
  const { id: idParam, interest_id: interestIdParam } = await params
  const projectId = parseInt(idParam, 10)
  const interestId = parseInt(interestIdParam, 10)
  if (isNaN(projectId) || isNaN(interestId)) {
    return Response.json({ detail: 'Invalid ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const isOwner = project && project.ownerId === volunteer.id
  const isAdmin = volunteer.isAdmin

  if (!project || (!isOwner && !isAdmin)) {
    return Response.json({ detail: 'Not authorized' }, { status: 403 })
  }

  const interest = await prisma.projectInterest.findFirst({
    where: { id: interestId, projectId },
  })
  if (!interest) {
    return Response.json({ detail: 'Interest not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const newStatus = body.status as string
  if (!newStatus || !['accepted', 'declined'].includes(newStatus)) {
    return Response.json({ detail: 'Status must be accepted or declined' }, { status: 400 })
  }

  const responseMessage = (body.response_message as string | null) ?? null

  await prisma.projectInterest.update({
    where: { id: interestId },
    data: { status: newStatus, responseMessage, respondedAt: new Date() },
  })

  const statusText = newStatus === 'accepted' ? 'accepted' : 'declined'
  createNotification(
    interest.volunteerId,
    `interest_${statusText}`,
    `Your interest in '${project.title}' was ${statusText}`,
    responseMessage,
    `/projects/${projectId}`,
  ).catch((e) => console.error('[NOTIFY ERROR]', e))

  if (newStatus === 'accepted' && interest.interestType === 'want_to_own') {
    const openTaskCount = await prisma.projectTask.count({
      where: { projectId, status: { not: 'done' } },
    })
    const newProjectStatus = openTaskCount > 0 ? 'in_progress' : 'needs_tasks'
    await prisma.project.update({
      where: { id: projectId },
      data: { ownerId: interest.volunteerId, status: newProjectStatus },
    })
  }

  const vol = await prisma.volunteer.findFirst({
    where: { id: interest.volunteerId, deletedAt: null },
    select: { name: true, email: true },
  })
  if (vol?.email) {
    const extra = responseMessage
      ? `<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Message:</strong> ${responseMessage}</div>`
      : ''
    sendProjectNotificationEmail(
      vol.email,
      vol.name,
      `Your interest in '${project.title}' was ${statusText}`,
      `The team has <strong>${statusText}</strong> your interest in the project <strong>${project.title}</strong>.`,
      project.title,
      projectId,
      extra,
    ).catch((e) => console.error('[EMAIL ERROR]', e))
  }

  return Response.json({ message: `Interest ${statusText}` })
}
