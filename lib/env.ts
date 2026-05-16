type EnvError = { var: string; reason: string }

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return

  const errors: EnvError[] = []

  if (!process.env.APP_URL) {
    errors.push({ var: 'APP_URL', reason: 'required for correct links in emails' })
  }

  if (!process.env.CRON_SECRET) {
    errors.push({ var: 'CRON_SECRET', reason: 'required to authenticate cron endpoints' })
  }

  const stubEmail = ['1', 'true', 'yes'].includes((process.env.STUB_EMAIL ?? '').toLowerCase())
  if (!stubEmail && !process.env.RESEND_API_KEY) {
    errors.push({ var: 'RESEND_API_KEY', reason: 'required to send emails (or set STUB_EMAIL=true)' })
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
