import { afterAll, beforeEach } from 'vitest'
import { createSchema, dropSchema, urlWithSchema, SCHEMA_PREFIX } from './pg'
import { setEmailTransport } from '@/lib/email-transport'
import { setGoogleVerifier } from '@/lib/google-auth'
import { setRateLimiter } from '@/lib/rate-limit'
import { emails } from './fakes/email'
import { google } from './fakes/google'
import { rateLimit } from './fakes/rate-limit'

/**
 * Gives the current test file its own private database schema. vitest isolates module
 * state per file, so `lib/prisma` is instantiated afresh in each and reads DATABASE_URL at
 * that moment — this runs before any test module is imported.
 */
const schema = `${SCHEMA_PREFIX}${process.pid}_${Math.random().toString(36).slice(2)}`
await createSchema(schema)
process.env.DATABASE_URL = urlWithSchema(schema)
afterAll(async () => {
  await dropSchema(schema)
})
// Routers return verification and invite tokens in their responses when email is stubbed.
process.env.STUB_EMAIL = 'true'
process.env.STUB_GOOGLE = 'true'
// A configured client id makes the pages render their Google button; the stub flag above
// keeps the server from verifying real credentials.
process.env.GOOGLE_CLIENT_ID = 'test-google-client'
// Read at module load by CookieConsentBanner, so it must be set before any import.
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST'
// Several listed addresses so a test file can create more than one super-admin.
process.env.ADMIN_EMAILS = Array.from({ length: 20 }, (_, i) => `admin${i || ''}@example.com`).join(
  ',',
)
process.env.APP_URL = 'http://localhost:3000'
process.env.CRON_SECRET = 'cron-secret'
// The network edge is faked: outgoing email lands in the in-memory outbox `emails`, Google
// credentials verify only when a test has registered them with `google.accept`, and
// requests are rate-limited only when a test asks with `rateLimit.denyNext`.
setEmailTransport(emails)
setGoogleVerifier(google)
setRateLimiter(rateLimit)
beforeEach(() => {
  emails.reset()
  google.reset()
  rateLimit.reset()
})
