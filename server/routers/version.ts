import { publicProcedure } from '../procedures'

export const versionRouter = {
  get: publicProcedure.handler(async () => ({
    sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
    env: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
  })),
}
