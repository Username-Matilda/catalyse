import { describe, it, expect, vi, afterAll } from 'vitest'

/**
 * `STUB_GOOGLE` and `GOOGLE_CLIENT_ID` are read when the auth router loads, so the "not
 * configured" refusal needs a fresh module graph under production-like env. Kept apart from
 * auth.test.ts so that file's module instances stay untouched.
 */
vi.stubEnv('NODE_ENV', 'production')
vi.stubEnv('STUB_GOOGLE', '')
vi.stubEnv('GOOGLE_CLIENT_ID', '')
vi.resetModules()

afterAll(() => vi.unstubAllEnvs())

describe('Google sign-in without configuration', () => {
  it('refuses both the sign-in and the signup completion', async () => {
    const { anon } = await import('@/test/rpc')
    await expect(anon().auth.google({ stub: true })).rejects.toMatchObject({
      message: 'Google Sign-In is not configured',
    })
    await expect(
      anon().auth.completeGoogleSignup({
        stub: true,
        bio: 'A biography that is comfortably over twenty characters',
        country: 'UK',
        availabilityHoursPerWeek: 1,
        applicationMessage: 'An application message that is long enough to pass',
      }),
    ).rejects.toMatchObject({ message: 'Google Sign-In is not configured' })
    expect(await anon().auth.googleClientId()).toEqual({ clientId: '', stub: false })
  })
})
