import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { anon } from '@/test/rpc'

// Outside production a missing client id falls back to the stub, so this needs production.
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('STUB_GOOGLE', '')
  vi.stubEnv('GOOGLE_CLIENT_ID', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('Google sign-in without configuration', () => {
  it('refuses both the sign-in and the signup completion', async () => {
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
