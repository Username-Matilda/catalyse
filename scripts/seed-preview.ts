import { execSync } from 'child_process'

/**
 * Runs at container start, before migrations. Preview environments (Railway PR deploys) get
 * a fresh anonymised copy of production so reviewers see realistic data; production and
 * environments without B2 credentials are left alone.
 */
const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
const hasB2 = Boolean(process.env.B2_KEY_ID)

if (!isProduction && hasB2) {
  execSync('npm run fetch-prod-db', { stdio: 'inherit' })
} else {
  console.log('[SEED-PREVIEW] Skipped (production or B2 not configured)')
}
