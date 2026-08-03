import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { publicProcedure, approvedProcedure } from '../procedures'

export const localGroupsRouter = {
  list: publicProcedure
    .input(z.object({ country: z.string().optional() }))
    .handler(async ({ input }) => {
      const groups = await prisma.localGroup.findMany({
        where: input.country ? { country: input.country } : undefined,
        orderBy: [{ country: 'asc' }, { name: 'asc' }],
      })
      return { groups }
    }),

  getById: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const group = await prisma.localGroup.findUnique({ where: { id: input.id } })
      if (!group) throw new ORPCError('NOT_FOUND', { message: 'Local group not found' })
      return { id: group.id, name: group.name, country: group.country }
    }),
}
