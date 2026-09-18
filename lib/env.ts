type EnvError = { var: string; reason: string }

const flag = (value: string | undefined): boolean =>
  ['1', 'true', 'yes'].includes((value ?? '').toLowerCase())

/**
 * Typed view of the process environment. Each property reads `process.env` when accessed,
 * so a value changed after start-up (in tests, or by a script setting up its own) is seen
 * by the next call rather than frozen at import.
 */
export const env = {
  get NODE_ENV(): string {
    return process.env.NODE_ENV ?? 'development'
  },
  get APP_URL(): string {
    return process.env.APP_URL ?? ''
  },
  get RESEND_API_KEY(): string | undefined {
    return process.env.RESEND_API_KEY
  },
  get FROM_EMAIL(): string {
    return process.env.FROM_EMAIL ?? 'Catalyse <noreply@pauseai.uk>'
  },
  get REPLY_TO_EMAIL(): string | undefined {
    return process.env.REPLY_TO_EMAIL
  },
  /** Defaults on outside production, so a fresh dev checkout never tries to send email. */
  get STUB_EMAIL(): boolean {
    const fallback = process.env.NODE_ENV === 'production' ? '' : 'true'
    return flag(process.env.STUB_EMAIL || fallback)
  },
  get CRON_SECRET(): string | undefined {
    return process.env.CRON_SECRET
  },
  get ADMIN_EMAILS(): string {
    return process.env.ADMIN_EMAILS ?? ''
  },
  get DISABLE_RATE_LIMIT(): boolean {
    return flag(process.env.DISABLE_RATE_LIMIT)
  },
  get GOOGLE_CLIENT_ID(): string | undefined {
    return process.env.GOOGLE_CLIENT_ID
  },
  get STUB_GOOGLE(): boolean {
    return flag(process.env.STUB_GOOGLE)
  },
  get RAILWAY_GIT_COMMIT_SHA(): string | undefined {
    return process.env.RAILWAY_GIT_COMMIT_SHA
  },
  get RAILWAY_ENVIRONMENT_NAME(): string | undefined {
    return process.env.RAILWAY_ENVIRONMENT_NAME
  },
}

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
