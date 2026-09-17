import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('version.get', () => {
  it('falls back to dev/null when Railway variables are absent', async () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', '')
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', '')
    delete process.env.RAILWAY_GIT_COMMIT_SHA
    delete process.env.RAILWAY_ENVIRONMENT_NAME
    const { anon } = await import('@/test/rpc')
    expect(await anon().version.get()).toEqual({ sha: 'dev', env: null })
  })

  it('reports the Railway commit and environment when set', async () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'abc123')
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production')
    const { anon } = await import('@/test/rpc')
    expect(await anon().version.get()).toEqual({ sha: 'abc123', env: 'production' })
  })
})
