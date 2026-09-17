#!/usr/bin/env node
/**
 * Restores the anonymised copy of production (published nightly by the backup job) into the
 * database at DATABASE_URL. Needs only the read-only B2_ANON_* credentials; raw backups are
 * never downloaded. Refuses to touch the production environment.
 *
 * Usage:
 *   npx tsx scripts/fetch-anonymised-db.ts              # reads B2 creds from .env.b2
 *   npx tsx scripts/fetch-anonymised-db.ts --env /path/to/.env
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ANONYMISED_DUMP_NAME, libpqUrl } from '../jobs/backup'
import { b2Authorize, b2CredentialsFromEnv, b2DownloadFile } from '../jobs/b2'
import { restoreDump } from '../jobs/anonymise'
import { resolveDbUrl } from '../lib/db-url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const envFlagIndex = args.indexOf('--env')
const envFile = envFlagIndex !== -1 ? args[envFlagIndex + 1] : resolve(ROOT, '.env.b2')

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvFile(envFile)

  // The restore empties the target database first; nothing may ever point this at prod.
  if (process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
    console.error('Refusing to run in the production environment')
    process.exit(1)
  }

  const creds = b2CredentialsFromEnv('B2_ANON')
  if (!creds) {
    console.error('Error: B2_ANON_KEY_ID, B2_ANON_APP_KEY, and B2_ANON_BUCKET_NAME must be set')
    console.error(`       Add them to '${envFile}' or export them as environment variables.`)
    process.exit(1)
  }

  const dbUrl = libpqUrl(resolveDbUrl())
  mkdirSync(resolve(ROOT, 'db'), { recursive: true })
  const dumpPath = resolve(ROOT, 'db/anonymised.dump')

  console.log('Authorising with B2...')
  const auth = await b2Authorize(creds)

  console.log(`Downloading ${creds.bucketName}/${ANONYMISED_DUMP_NAME}...`)
  await b2DownloadFile(auth, creds.bucketName, ANONYMISED_DUMP_NAME, dumpPath)

  console.log(`Restoring into ${new URL(dbUrl).pathname.slice(1)}...`)
  await restoreDump(dumpPath, dbUrl)

  console.log('Done.')
  console.log('  volunteer@example.com  / password1')
  console.log('  admin@example.com      / password1')
  console.log('  superadmin@example.com / password1')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
