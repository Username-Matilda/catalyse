import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { sendRelayMessage, isEmailConfigured } from '@/lib/email'
import { authedProcedure } from '../procedures'

const ContactSchema = z.object({
  recipientId: z.number().int(),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(200, 'Subject must be 200 characters or fewer'),
  message: z.string().min(1, 'Message is required'),
  relatedProjectId: z.number().int().optional().nullable(),
})

export const messagesRouter = {
  list: authedProcedure.handler(async ({ context }) => {
    const [received, sent] = await Promise.all([
      prisma.message.findMany({
        where: { toVolunteerId: context.volunteer.id },
        include: { from: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.message.findMany({
        where: { fromVolunteerId: context.volunteer.id },
        include: { to: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return {
      received: received.map((m) => ({
        id: m.id,
        fromVolunteerId: m.fromVolunteerId,
        toVolunteerId: m.toVolunteerId,
        subject: m.subject,
        message: m.message,
        relatedProjectId: m.relatedProjectId,
        readAt: m.readAt,
        createdAt: m.createdAt,
        fromName: m.from.name,
      })),
      sent: sent.map((m) => ({
        id: m.id,
        fromVolunteerId: m.fromVolunteerId,
        toVolunteerId: m.toVolunteerId,
        subject: m.subject,
        message: m.message,
        relatedProjectId: m.relatedProjectId,
        readAt: m.readAt,
        createdAt: m.createdAt,
        toName: m.to.name,
      })),
    }
  }),

  markRead: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const result = await prisma.message.updateMany({
        where: { id: input.id, toVolunteerId: context.volunteer.id },
        data: { readAt: new Date() },
      })
      if (result.count === 0) throw new ORPCError('NOT_FOUND')
      return { message: 'Marked as read' }
    }),

  send: authedProcedure.input(ContactSchema).handler(async ({ input, context }) => {
    const sender = context.volunteer
    if (sender.id === input.recipientId) {
      throw new ORPCError('BAD_REQUEST', { message: 'Cannot message yourself' })
    }

    const recipient = await prisma.volunteer.findFirst({
      where: { id: input.recipientId, deletedAt: null, consentContactableByProjectOwners: true },
      select: { id: true, name: true, email: true },
    })
    if (!recipient) {
      throw new ORPCError('NOT_FOUND', {
        message: "Volunteer not found or doesn't accept messages",
      })
    }
    if (!recipient.email) {
      throw new ORPCError('BAD_REQUEST', { message: 'This volunteer has no email address on file' })
    }

    let projectTitle: string | null = null
    if (input.relatedProjectId) {
      const project = await prisma.project.findUnique({
        where: { id: input.relatedProjectId },
        select: { title: true },
      })
      if (project) projectTitle = project.title
    }

    await prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          fromVolunteerId: sender.id,
          toVolunteerId: input.recipientId,
          subject: input.subject,
          message: input.message,
          relatedProjectId: input.relatedProjectId ?? null,
        },
      })
      await tx.notification.create({
        data: {
          volunteerId: input.recipientId,
          type: 'message_received',
          title: `Message from ${sender.name}`,
          body: input.subject,
          link: '/dashboard',
        },
      })
    })

    if (isEmailConfigured()) {
      sendRelayMessage({
        to: recipient.email,
        toName: recipient.name,
        fromName: sender.name,
        fromEmail: sender.email ?? '',
        subject: input.subject,
        message: input.message,
        projectTitle: projectTitle ?? undefined,
      }).catch((e) => console.error('[EMAIL ERROR]', e))
    }

    return { message: "Message sent! They'll receive it by email and can reply directly to you." }
  }),
}
