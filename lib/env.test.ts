import { describe, it, expect, vi, afterEach } from 'vitest'
import { env, validateEnv } from './env'

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Sets the given variables (deleting those given as undefined) and returns the live env. */
function loadEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) vi.stubEnv(k, undefined)
    else vi.stubEnv(k, v)
  }
  return { env, validateEnv }
}

const PROD = { NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'production', E2E: undefined }
const SAFE_PROD = {
  ...PROD,
  APP_URL: 'https://x',
  CRON_SECRET: 's',
  RESEND_API_KEY: 'k',
  STUB_GOOGLE: '',
  STUB_EMAIL: '',
  DISABLE_RATE_LIMIT: '',
}

describe('env', () => {
  it('parses boolean-ish flags and defaults', async () => {
    const { env } = loadEnv({
      NODE_ENV: 'development',
      STUB_EMAIL: undefined,
      DISABLE_RATE_LIMIT: 'YES',
      STUB_GOOGLE: '1',
      FROM_EMAIL: undefined,
      ADMIN_EMAILS: undefined,
      APP_URL: undefined,
    })
    expect(env.STUB_EMAIL).toBe(true) // default outside production
    expect(env.DISABLE_RATE_LIMIT).toBe(true)
    expect(env.STUB_GOOGLE).toBe(true)
    expect(env.FROM_EMAIL).toContain('noreply')
    expect(env.ADMIN_EMAILS).toBe('')
    expect(env.APP_URL).toBe('')
    expect(env.NODE_ENV).toBe('development')
  })

  it('defaults NODE_ENV to development', async () => {
    const { env } = loadEnv({ NODE_ENV: undefined, STUB_EMAIL: undefined })
    expect(env.NODE_ENV).toBe('development')
  })

  it('defaults STUB_EMAIL off in production', async () => {
    const { env } = loadEnv({ NODE_ENV: 'production', STUB_EMAIL: undefined })
    expect(env.STUB_EMAIL).toBe(false)
  })
})

describe('validateEnv', () => {
  it('does nothing outside a live production deployment', async () => {
    loadEnv({ NODE_ENV: 'development' }).validateEnv()
    loadEnv({ NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'pr-12' }).validateEnv()
    loadEnv({ ...PROD, E2E: '1' }).validateEnv()
  })

  it('passes a fully configured production environment', async () => {
    ;(
      await loadEnv({
        ...SAFE_PROD,
        B2_KEY_ID: undefined,
        B2_APP_KEY: undefined,
        B2_BUCKET_NAME: undefined,
      })
    ).validateEnv()
  })

  it('lists every missing variable and unsafe stub', async () => {
    const { validateEnv } = await loadEnv({
      ...PROD,
      APP_URL: '',
      CRON_SECRET: '',
      RESEND_API_KEY: '',
      STUB_GOOGLE: 'true',
      STUB_EMAIL: 'true',
      DISABLE_RATE_LIMIT: 'true',
      B2_KEY_ID: 'id',
      B2_APP_KEY: '',
      B2_BUCKET_NAME: '',
    })
    expect(() => validateEnv()).toThrow(
      /APP_URL[\s\S]*CRON_SECRET[\s\S]*RESEND_API_KEY[\s\S]*STUB_GOOGLE[\s\S]*STUB_EMAIL[\s\S]*DISABLE_RATE_LIMIT[\s\S]*B2_APP_KEY[\s\S]*B2_BUCKET_NAME/,
    )
  })
})
