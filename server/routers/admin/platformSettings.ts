import { prisma } from '@/lib/prisma'
import { PlatformSettingsSchema } from '@/lib/schemas'
import { superAdminProcedure } from '../../procedures'

const SINGLETON_ID = 1

export const adminPlatformSettingsRouter = {
  get: superAdminProcedure.handler(async () => {
    const settings = await prisma.platformSettings.findUniqueOrThrow({
      where: { id: SINGLETON_ID },
    })
    return { requireApplicationApproval: settings.requireApplicationApproval }
  }),

  update: superAdminProcedure.input(PlatformSettingsSchema).handler(async ({ input }) => {
    const settings = await prisma.platformSettings.update({
      where: { id: SINGLETON_ID },
      data: { requireApplicationApproval: input.requireApplicationApproval },
    })
    return { requireApplicationApproval: settings.requireApplicationApproval }
  }),
}
