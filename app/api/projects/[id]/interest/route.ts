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
  if (volunteer.approvalStatus !== 'APPROVED' && !volunteer.isAdmin) {
    return Response.json({ detail: 'Your account is pending approval' }, { status: 403 })
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      status: { notIn: ['completed', 'archived'] },
      OR: [
        { isSeekingHelp: true },
        { isSeekingOwner: true },
        { status: { in: ['seeking_owner', 'seeking_help'] } },
      ],
    },
  })

  if (!project) {
    return Response.json(
      { detail: 'This project is not currently seeking volunteers' },
      { status: 404 },
    )
  }

  const existing = await prisma.projectInterest.findFirst({
    where: { projectId, volunteerId: volunteer.id },
  })

  if (existing && existing.status !== 'withdrawn') {
    return Response.json({ detail: "You've already expressed interest" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const interestType = body.interest_type as string
  if (!interestType || !['want_to_contribute', 'want_to_own'].includes(interestType)) {
    return Response.json({ detail: 'Invalid interest_type' }, { status: 400 })
  }

  const message = (body.message as string | null) ?? null

  if (existing) {
    await prisma.projectInterest.update({
      where: { volunteerId_projectId: { volunteerId: volunteer.id, projectId } },
      data: { interestType, message, status: 'pending', respondedAt: null, responseMessage: null },
    })
  } else {
    await prisma.projectInterest.create({
      data: { volunteerId: volunteer.id, projectId, interestType, message },
    })
  }

  const interestLabel = interestType === 'want_to_own' ? 'own / lead' : 'contribute to'

  if (project.ownerId) {
    try {
      await createNotification(
        project.ownerId,
        'new_interest',
        `Someone's interested in '${project.title}'!`,
        `${volunteer.name} wants to ${interestLabel}`,
        `/projects/${projectId}`,
      )
      const owner = await prisma.volunteer.findFirst({
        where: { id: project.ownerId },
        select: { name: true, email: true },
      })
      if (owner?.email) {
        const extra = message
          ? `<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Their message:</strong> ${message}</div>`
          : ''
        sendProjectNotificationEmail({
          to: owner.email,
          name: owner.name,
          subject: `${volunteer.name} wants to ${interestLabel} '${project.title}'`,
          message: `<strong>${volunteer.name}</strong> has expressed interest in your project <strong>${project.title}</strong>. Log in to review and accept or decline.`,
          projectTitle: project.title,
          projectId,
          extraHtml: extra,
        }).catch((e) => console.error('[EMAIL ERROR]', e))
      }
    } catch (e) {
      console.error('[NOTIFY ERROR] Owner notification failed for interest:', e)
    }
  }

  try {
    const admins = await prisma.volunteer.findMany({
      where: { isAdmin: true, deletedAt: null },
      select: { id: true, name: true, email: true },
    })
    for (const admin of admins) {
      if (admin.id === project.ownerId) continue
      createNotification(
        admin.id,
        'new_interest',
        `New interest in '${project.title}'`,
        `${volunteer.name} wants to ${interestLabel}`,
        `/projects/${projectId}`,
      ).catch((e) => console.error('[NOTIFY ERROR]', e))
      if (admin.email) {
        sendProjectNotificationEmail({
          to: admin.email,
          name: admin.name,
          subject: `New interest: ${volunteer.name} → '${project.title}'`,
          message: `<strong>${volunteer.name}</strong> wants to ${interestLabel} the project <strong>${project.title}</strong>.`,
          projectTitle: project.title,
          projectId,
        }).catch((e) => console.error('[EMAIL ERROR]', e))
      }
    }
  } catch (e) {
    console.error('[NOTIFY ERROR] Admin notification failed for interest:', e)
  }

  return Response.json({ message: 'Interest expressed successfully' })
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
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const result = await prisma.projectInterest.updateMany({
    where: { projectId, volunteerId: volunteer.id, status: 'pending' },
    data: { status: 'withdrawn' },
  })

  if (result.count === 0) {
    return Response.json({ detail: 'No pending interest found' }, { status: 404 })
  }

  return Response.json({ message: 'Interest withdrawn' })
}
