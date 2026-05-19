import { publicProcedure } from '../procedures'
import { env } from '@/lib/env'

export const versionRouter = {
  get: publicProcedure.handler(async () => ({
    sha: env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
    env: env.RAILWAY_ENVIRONMENT_NAME ?? null,
  })),
}
