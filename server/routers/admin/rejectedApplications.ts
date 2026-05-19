import { prisma } from '@/lib/prisma'
import { superAdminProcedure } from '../../procedures'

export const adminRejectedApplicationsRouter = {
  list: superAdminProcedure.handler(async () => {
    const records = await prisma.rejectedApplication.findMany({
      orderBy: { rejectedAt: 'desc' },
    })
    return records.map((r) => ({
      id: r.id,
      rejectedAt: r.rejectedAt,
      adminNotes: r.adminNotes,
      applicantNotes: r.applicantNotes,
    }))
  }),
}
