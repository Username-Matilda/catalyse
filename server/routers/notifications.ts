import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { authedProcedure } from '../procedures'
import { ADMIN_NOTIFICATION_TYPES } from '@/lib/admin-notifications'

export const notificationsRouter = {
  list: authedProcedure
    .input(
      z.object({
        filter: z.enum(['all', 'unread', 'read']).optional().default('all'),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const where = {
        volunteerId: context.volunteer.id,
        ...(context.volunteer.isAdmin ? { type: { notIn: ADMIN_NOTIFICATION_TYPES } } : {}),
        ...(input.filter === 'unread' ? { readAt: null } : {}),
        ...(input.filter === 'read' ? { readAt: { not: null } } : {}),
      }

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        prisma.notification.count({ where }),
      ])

      return {
        notifications: notifications.map((n) => ({
          id: n.id,
          volunteerId: n.volunteerId,
          type: n.type,
          title: n.title,
          body: n.body,
          link: n.link,
          readAt: n.readAt,
          emailedAt: n.emailedAt,
          createdAt: n.createdAt,
        })),
        total,
      }
    }),

  readAll: authedProcedure.handler(async ({ context }) => {
    await prisma.notification.updateMany({
      where: {
        volunteerId: context.volunteer.id,
        readAt: null,
        ...(context.volunteer.isAdmin ? { type: { notIn: ADMIN_NOTIFICATION_TYPES } } : {}),
      },
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

  markUnread: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const result = await prisma.notification.updateMany({
        where: { id: input.id, volunteerId: context.volunteer.id },
        data: { readAt: null },
      })
      if (result.count === 0) throw new ORPCError('NOT_FOUND')
      return { message: 'Marked as unread' }
    }),
}
