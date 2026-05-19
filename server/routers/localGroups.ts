import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { publicProcedure } from '../procedures'

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
}
