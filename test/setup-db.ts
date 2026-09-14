import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATE_DB, TEST_DB_DIR } from './db-paths'

/**
 * Gives the current test file its own private database. vitest isolates module state per
 * file, so `lib/prisma` is instantiated afresh in each and reads DATABASE_URL at that moment
 * — this runs before any test module is imported.
 */
const fileDb = path.join(TEST_DB_DIR, `${process.pid}-${Math.random().toString(36).slice(2)}.db`)
fs.copyFileSync(TEMPLATE_DB, fileDb)
process.env.DATABASE_URL = `file:${fileDb}`
process.env.STUB_EMAIL = 'true'
process.env.STUB_GOOGLE = 'true'
// A configured client id makes the pages render their Google button; the stub flag above
// keeps the server from verifying real credentials.
process.env.GOOGLE_CLIENT_ID = 'test-google-client'
// Read at module load by CookieConsentBanner, so it must be set before any import.
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST'
process.env.DISABLE_RATE_LIMIT = 'true'
// Several listed addresses so a test file can create more than one super-admin.
process.env.ADMIN_EMAILS = Array.from({ length: 20 }, (_, i) => `admin${i || ''}@example.com`).join(
  ',',
)
process.env.APP_URL = 'http://localhost:3000'
process.env.CRON_SECRET = 'cron-secret'
