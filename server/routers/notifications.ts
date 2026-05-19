import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { authedProcedure } from '../procedures'

export const notificationsRouter = {
  list: authedProcedure
    .input(z.object({ unreadOnly: z.boolean().optional() }))
    .handler(async ({ input, context }) => {
      const notifications = await prisma.notification.findMany({
        where: {
          volunteerId: context.volunteer.id,
          ...(input.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return notifications.map((n) => ({
        id: n.id,
        volunteerId: n.volunteerId,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt,
        emailedAt: n.emailedAt,
        createdAt: n.createdAt,
      }))
    }),

  readAll: authedProcedure.handler(async ({ context }) => {
    await prisma.notification.updateMany({
      where: { volunteerId: context.volunteer.id, readAt: null },
      data: { readAt: new Date() },
    })
    return { message: 'All marked as read' }
  }),

  markRead: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const result = await prisma.notification.updateMany({
        where: { id: input.id, volunteerId: context.volunteer.id },
        data: { readAt: new Date() },
      })
      if (result.count === 0) throw new ORPCError('NOT_FOUND')
      return { message: 'Marked as read' }
    }),
}
