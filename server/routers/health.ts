import { prisma } from '@/lib/prisma'
import { publicProcedure } from '../procedures'

export const healthRouter = {
  check: publicProcedure.handler(async () => {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true }
  }),
}
