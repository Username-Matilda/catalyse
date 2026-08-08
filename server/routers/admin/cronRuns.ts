import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { CRON_JOBS } from '@/lib/cron-jobs'
import { CRON_JOB_NAMES, type CronJobName } from '@/lib/cron-job-names'
import { superAdminProcedure } from '../../procedures'

export const adminCronRunsRouter = {
  list: superAdminProcedure
    .input(z.object({ jobName: z.string().optional(), status: z.string().optional() }))
    .handler(async ({ input }) => {
      return prisma.cronJobRun.findMany({
        where: {
          ...(input.jobName ? { jobName: input.jobName } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { startedAt: 'desc' },
        take: 200,
      })
    }),

  run: superAdminProcedure
    .input(z.object({ jobName: z.enum([...CRON_JOB_NAMES] as [CronJobName, ...CronJobName[]]) }))
    .handler(async ({ input }) => {
      const result = await CRON_JOBS[input.jobName]()
      return { result }
    }),
}
