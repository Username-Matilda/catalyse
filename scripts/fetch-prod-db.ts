#!/usr/bin/env node
/**
 * Restores the latest prod backup from B2 into the database at DATABASE_URL, then anonymises
 * it and seeds the dev accounts. Refuses to touch the production environment.
 *
 * Usage:
 *   npx tsx scripts/fetch-prod-db.ts              # reads B2 creds from .env.b2
 *   npx tsx scripts/fetch-prod-db.ts --env /path/to/.env
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Client } from 'pg'
import { faker } from '@faker-js/faker'
import { libpqUrl } from '../jobs/backup'
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

// ── B2 API ────────────────────────────────────────────────────────────────────

interface B2Auth {
  authToken: string
  apiUrl: string
  downloadUrl: string
  accountId: string
}

async function b2Authorize(keyId: string, appKey: string): Promise<B2Auth> {
  const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64')
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) throw new Error(`B2 auth failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Record<string, string>
  return {
    authToken: data.authorizationToken,
    apiUrl: data.apiUrl,
    downloadUrl: data.downloadUrl,
    accountId: data.accountId,
  }
}

async function b2GetBucketId(auth: B2Auth, bucketName: string): Promise<string> {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: 'POST',
    headers: { Authorization: auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: auth.accountId, bucketName }),
  })
  if (!res.ok) throw new Error(`b2_list_buckets failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { buckets: { bucketId: string }[] }
  if (!data.buckets.length) throw new Error(`Bucket '${bucketName}' not found`)
  return data.buckets[0].bucketId
}

interface B2File {
  fileName: string
  uploadTimestamp: number
  contentLength: number
}

async function b2ListFiles(auth: B2Auth, bucketId: string, prefix = ''): Promise<B2File[]> {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: 'POST',
    headers: { Authorization: auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId, prefix, maxFileCount: 1000 }),
  })
  if (!res.ok) throw new Error(`b2_list_file_names failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { files: B2File[] }
  return data.files
}

async function b2DownloadFile(
  auth: B2Auth,
  bucketName: string,
  fileName: string,
  destPath: string,
): Promise<void> {
  const res = await fetch(`${auth.downloadUrl}/file/${bucketName}/${fileName}`, {
    headers: { Authorization: auth.authToken },
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${await res.text()}`)
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
}

// ── Restore ───────────────────────────────────────────────────────────────────

/**
 * Empties the public schema and restores the dump into it. The dump's own
 * `CREATE SCHEMA public` entry is filtered out of the restore list, since the schema
 * is recreated here first; `pg_restore -l`/`-L` is the documented way to skip entries.
 */
export async function restoreDump(dumpPath: string, dbUrl: string): Promise<void> {
  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE')
    await client.query('CREATE SCHEMA public')
  } finally {
    await client.end()
  }
  const listing = execFileSync('pg_restore', ['-l', dumpPath], { encoding: 'utf8' })
  const filtered = listing
    .split('\n')
    .filter((line) => !/ SCHEMA - public /.test(line))
    .join('\n')
  const listPath = `${dumpPath}.list`
  writeFileSync(listPath, filtered)
  execFileSync(
    'pg_restore',
    ['--no-owner', '--no-privileges', '--use-list', listPath, '--dbname', dbUrl, dumpPath],
    { stdio: 'inherit' },
  )
}

// ── Anonymisation ─────────────────────────────────────────────────────────────

// Seed faker with the volunteer ID so all fake fields are deterministic per volunteer.
function fakeVolunteerData(id: number): {
  name: string
  email: string
  bio: string
  discordHandle: string
  signalNumber: string
  whatsappNumber: string
  contactNotes: string
  otherSkills: string
  location: string
  localGroup: string
} {
  faker.seed(id)
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  return {
    name: `${firstName} ${lastName}`,
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    bio: faker.lorem.sentence(),
    discordHandle: faker.internet.username(),
    signalNumber: faker.phone.number({ style: 'international' }),
    whatsappNumber: faker.phone.number({ style: 'international' }),
    contactNotes: faker.lorem.sentence(),
    otherSkills: faker.lorem.words({ min: 2, max: 5 }),
    location: `${faker.location.city()}, ${faker.location.country()}`,
    localGroup: faker.location.city(),
  }
}

function randomToken(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(randomBytes(length), (b) => chars[b % chars.length]).join('')
}

function makePasswordHash(password: string): string {
  const salt = randomBytes(32)
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  return Buffer.concat([salt, key]).toString('base64')
}

export async function anonymise(db: Client): Promise<void> {
  const anonPasswordHash = makePasswordHash('volunteerpass1')

  const { rows: volunteerRows } = await db.query<{
    id: number
    bio: string | null
    discord_handle: string | null
    signal_number: string | null
    whatsapp_number: string | null
    contact_notes: string | null
    other_skills: string | null
    location: string | null
    local_group: string | null
  }>(
    'SELECT id, bio, discord_handle, signal_number, whatsapp_number, contact_notes, other_skills, location, local_group FROM volunteers',
  )
  for (const row of volunteerRows) {
    const f = fakeVolunteerData(row.id)
    await db.query(
      `UPDATE volunteers SET
        name = $1, email = $2, bio = $3, discord_handle = $4, signal_number = $5,
        whatsapp_number = $6, contact_notes = $7, other_skills = $8, location = $9,
        local_group = $10, auth_token = NULL, auth_token_expires_at = NULL, password_hash = $11
      WHERE id = $12`,
      [
        f.name,
        f.email,
        row.bio !== null ? f.bio : null,
        row.discord_handle !== null ? f.discordHandle : null,
        row.signal_number !== null ? f.signalNumber : null,
        row.whatsapp_number !== null ? f.whatsappNumber : null,
        row.contact_notes !== null ? f.contactNotes : null,
        row.other_skills !== null ? f.otherSkills : null,
        row.location !== null ? f.location : null,
        row.local_group !== null ? f.localGroup : null,
        anonPasswordHash,
        row.id,
      ],
    )
  }

  const { rows: adminInvites } = await db.query<{ id: number; invited_by_id: number }>(
    'SELECT id, invited_by_id FROM admin_invites',
  )
  for (const row of adminInvites) {
    await db.query('UPDATE admin_invites SET email = $1, invite_token = $2 WHERE id = $3', [
      fakeVolunteerData(row.invited_by_id).email,
      randomToken(),
      row.id,
    ])
  }

  await db.query("UPDATE admin_notes SET content = '[redacted]'")
  await db.query("UPDATE contact_messages SET subject = '[redacted]', message = '[redacted]'")
  await db.query("UPDATE bug_reports SET reporter_email = NULL, description = '[redacted]'")
  await db.query('UPDATE deletion_requests SET volunteer_email = NULL')

  const { rows: resetTokens } = await db.query<{ id: number }>(
    'SELECT id FROM password_reset_tokens',
  )
  for (const { id } of resetTokens) {
    await db.query('UPDATE password_reset_tokens SET token = $1 WHERE id = $2', [randomToken(), id])
  }

  await db.query('UPDATE notifications SET body = NULL')
  await db.query("UPDATE work_item_comments SET content = '[redacted]'")
  await db.query('DELETE FROM sessions')
}

export async function seedDevAccounts(db: Client): Promise<void> {
  const insert = `
    INSERT INTO volunteers (name, email, password_hash, is_admin, location, country, local_group, location_confirmed_at, created_at, updated_at, approval_status, email_confirmed, consent_make_profile_visible_in_directory)
    VALUES ($1, $2, $3, $4, 'London, UK', 'UK', 'London', now(), now(), now(), 'approved', true, false)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = EXCLUDED.is_admin, deleted_at = NULL
  `
  await db.query(insert, [
    'Dev Volunteer',
    'volunteer@example.com',
    makePasswordHash('password1'),
    false,
  ])
  await db.query(insert, ['Dev Admin', 'admin@example.com', makePasswordHash('password1'), true])
  await db.query(insert, [
    'Dev Super Admin',
    'superadmin@example.com',
    makePasswordHash('password1'),
    true,
  ])
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvFile(envFile)

  // The restore empties the target database first; nothing may ever point this at prod.
  if (process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
    console.error('Refusing to run in the production environment')
    process.exit(1)
  }

  const keyId = process.env.B2_KEY_ID
  const appKey = process.env.B2_APP_KEY
  const bucketName = process.env.B2_BUCKET_NAME

  if (!keyId || !appKey || !bucketName) {
    console.error('Error: B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME must be set')
    console.error(`       Add them to '${envFile}' or export them as environment variables.`)
    process.exit(1)
  }

  const dbUrl = libpqUrl(resolveDbUrl())
  mkdirSync(resolve(ROOT, 'db'), { recursive: true })
  const dumpPath = resolve(ROOT, 'db/prod.dump')

  console.log('Authorising with B2...')
  const auth = await b2Authorize(keyId, appKey)
  const bucketId = await b2GetBucketId(auth, bucketName)

  console.log('Listing backups...')
  const files = (await b2ListFiles(auth, bucketId, 'backups/')).filter((f) =>
    f.fileName.endsWith('.dump'),
  )
  if (!files.length) {
    console.error('No Postgres backups found in B2.')
    process.exit(1)
  }

  const latest = files.reduce((a, b) => (a.uploadTimestamp > b.uploadTimestamp ? a : b))
  console.log(`Latest backup: ${latest.fileName} (${(latest.contentLength / 1024).toFixed(0)} KB)`)

  console.log('Downloading...')
  await b2DownloadFile(auth, bucketName, latest.fileName, dumpPath)

  console.log(`Restoring into ${new URL(dbUrl).pathname.slice(1)}...`)
  await restoreDump(dumpPath, dbUrl)

  const db = new Client({ connectionString: dbUrl })
  await db.connect()
  try {
    console.log('Anonymising...')
    await anonymise(db)
    console.log('Seeding dev accounts...')
    await seedDevAccounts(db)
  } finally {
    await db.end()
  }

  console.log('Done.')
  console.log('  volunteer@example.com  / password1')
  console.log('  admin@example.com      / password1')
  console.log('  superadmin@example.com / password1')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
