type EnvError = { var: string; reason: string }

const stubEmailDefault = process.env.NODE_ENV === 'production' ? '' : 'true'

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  APP_URL: process.env.APP_URL ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  FROM_EMAIL: process.env.FROM_EMAIL ?? 'Catalyse <noreply@pauseai.uk>',
  REPLY_TO_EMAIL: process.env.REPLY_TO_EMAIL,
  STUB_EMAIL: ['1', 'true', 'yes'].includes(
    (process.env.STUB_EMAIL || stubEmailDefault).toLowerCase(),
  ),
  CRON_SECRET: process.env.CRON_SECRET,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? '',
  DISABLE_RATE_LIMIT: ['1', 'true', 'yes'].includes(
    (process.env.DISABLE_RATE_LIMIT ?? '').toLowerCase(),
  ),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  STUB_GOOGLE: ['1', 'true', 'yes'].includes((process.env.STUB_GOOGLE ?? '').toLowerCase()),
  RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
  RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
} as const

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return
  // Railway PR deployments run as NODE_ENV=production but aren't the live environment
  if (process.env.RAILWAY_ENVIRONMENT_NAME && process.env.RAILWAY_ENVIRONMENT_NAME !== 'production')
    return
  // The e2e harness serves a production build locally with the stub flags on (see
  // e2e/global-setup.ts); it is not a deployment and must not be held to these rules.
  if (process.env.E2E === '1') return

  const errors: EnvError[] = []

  if (!env.APP_URL) {
    errors.push({ var: 'APP_URL', reason: 'required for correct links in emails' })
  }

  if (!env.CRON_SECRET) {
    errors.push({ var: 'CRON_SECRET', reason: 'required to authenticate cron endpoints' })
  }

  if (!env.RESEND_API_KEY) {
    errors.push({ var: 'RESEND_API_KEY', reason: 'required to send emails' })
  }

  // Development shortcuts that are unsafe in the live environment: STUB_GOOGLE accepts a
  // sign-in for any email with no Google credential, STUB_EMAIL returns password-reset and
  // invite tokens in API responses instead of mailing them, and DISABLE_RATE_LIMIT turns
  // off every limiter. Refuse to boot rather than run with any of them on.
  const unsafeStubs: Array<[string, boolean]> = [
    ['STUB_GOOGLE', env.STUB_GOOGLE],
    ['STUB_EMAIL', env.STUB_EMAIL],
    ['DISABLE_RATE_LIMIT', env.DISABLE_RATE_LIMIT],
  ]
  for (const [name, enabled] of unsafeStubs) {
    if (enabled) {
      errors.push({ var: name, reason: 'development-only flag, must be off in production' })
    }
  }

  const b2Vars = ['B2_KEY_ID', 'B2_APP_KEY', 'B2_BUCKET_NAME'] as const
  const b2Set = b2Vars.filter((v) => process.env[v])
  if (b2Set.length > 0 && b2Set.length < b2Vars.length) {
    const missing = b2Vars.filter((v) => !process.env[v])
    for (const v of missing) {
      errors.push({ var: v, reason: 'required when any B2 backup var is set' })
    }
  }

  if (errors.length === 0) return

  const lines = errors.map((e) => `  - ${e.var}: ${e.reason}`).join('\n')
  throw new Error(`Missing required environment variables:\n${lines}`)
}
