import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { sendRelayMessage, isEmailConfigured } from '@/lib/email'
import { fieldError, validationError } from '@/lib/errors'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sender = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!sender) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const { id: idParam } = await params
  const recipientId = parseInt(idParam, 10)
  if (isNaN(recipientId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  if (sender.id === recipientId) {
    return Response.json({ detail: 'Cannot message yourself' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.subject || typeof body.subject !== 'string' || body.subject.trim().length === 0) {
    errs.push(fieldError('subject', 'Subject is required'))
  } else if (body.subject.length > 200) {
    errs.push(fieldError('subject', 'Subject must be 200 characters or fewer'))
  }
  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    errs.push(fieldError('message', 'Message is required'))
  }
  if (errs.length) return validationError(errs)

  const subject = (body.subject as string).trim()
  const message = body.message as string
  const relatedProjectId =
    typeof body.related_project_id === 'number' ? body.related_project_id : null

  const recipient = await prisma.volunteer.findFirst({
    where: { id: recipientId, deletedAt: null, consentContactableByProjectOwners: true },
    select: { id: true, name: true, email: true },
  })

  if (!recipient) {
    return Response.json(
      { detail: "Volunteer not found or doesn't accept messages" },
      { status: 404 },
    )
  }

  if (!recipient.email) {
    return Response.json({ detail: 'This volunteer has no email address on file' }, { status: 400 })
  }

  let projectTitle: string | null = null
  if (relatedProjectId) {
    const project = await prisma.project.findUnique({
      where: { id: relatedProjectId },
      select: { title: true },
    })
    if (project) projectTitle = project.title
  }

  // Save message and create notification unconditionally; treat email as best-effort delivery.
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        fromVolunteerId: sender.id,
        toVolunteerId: recipientId,
        subject,
        message,
        relatedProjectId,
      },
    })
    await tx.notification.create({
      data: {
        volunteerId: recipientId,
        type: 'message_received',
        title: `Message from ${sender.name}`,
        body: subject,
        link: '/dashboard',
      },
    })
  })

  if (!isEmailConfigured()) {
    return Response.json({
      message: "Message sent! They'll receive it by email and can reply directly to you.",
    })
  }

  sendRelayMessage({
    to: recipient.email,
    toName: recipient.name,
    fromName: sender.name,
    fromEmail: sender.email ?? '',
    subject,
    message,
    projectTitle: projectTitle ?? undefined,
  }).catch((e) => console.error('[EMAIL ERROR]', e))

  return Response.json({
    message: "Message sent! They'll receive it by email and can reply directly to you.",
  })
}
