import { describe, it, expect, vi, afterEach } from 'vitest'
import { anon } from '@/test/rpc'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('version.get', () => {
  it('falls back to dev/null when Railway variables are absent', async () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', undefined)
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', undefined)
    expect(await anon().version.get()).toEqual({ sha: 'dev', env: null })
  })

  it('reports the Railway commit and environment when set', async () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'abc123')
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production')
    expect(await anon().version.get()).toEqual({ sha: 'abc123', env: 'production' })
  })
})
