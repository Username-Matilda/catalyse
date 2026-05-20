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
  RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
  RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
} as const

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return
  // Railway PR deployments run as NODE_ENV=production but aren't the live environment
  if (process.env.RAILWAY_ENVIRONMENT_NAME && process.env.RAILWAY_ENVIRONMENT_NAME !== 'production')
    return

  const errors: EnvError[] = []

  if (!env.APP_URL) {
    errors.push({ var: 'APP_URL', reason: 'required for correct links in emails' })
  }

  if (!env.CRON_SECRET) {
    errors.push({ var: 'CRON_SECRET', reason: 'required to authenticate cron endpoints' })
  }

  if (!env.STUB_EMAIL && !env.RESEND_API_KEY) {
    errors.push({
      var: 'RESEND_API_KEY',
      reason: 'required to send emails (or set STUB_EMAIL=true)',
    })
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
