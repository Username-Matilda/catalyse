#!/usr/bin/env node
/**
 * Downloads the latest prod backup from B2 and writes an anonymised copy.
 *
 * Usage:
 *   npx tsx scripts/fetch-prod-db.ts              # reads creds from ../../.env.b2
 *   npx tsx scripts/fetch-prod-db.ts --env /path/to/.env
 */

import { copyFileSync, existsSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { faker } from '@faker-js/faker'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

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
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
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
  const data = await res.json() as Record<string, string>
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
  const data = await res.json() as { buckets: { bucketId: string }[] }
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
  const data = await res.json() as { files: B2File[] }
  return data.files
}

async function b2DownloadFile(auth: B2Auth, bucketName: string, fileName: string, destPath: string): Promise<void> {
  const res = await fetch(`${auth.downloadUrl}/file/${bucketName}/${fileName}`, {
    headers: { Authorization: auth.authToken },
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${await res.text()}`)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
}

// ── Anonymisation ─────────────────────────────────────────────────────────────

// Seed faker with the volunteer ID so names/emails are deterministic per volunteer.
function fakeVolunteer(id: number): { name: string; email: string } {
  faker.seed(id)
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  return {
    name: `${firstName} ${lastName}`,
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
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

function anonymise(dbPath: string): void {
  const db = new DatabaseSync(dbPath)

  const anonPasswordHash = makePasswordHash('volunteerpass1')

  const volunteerIds = (db.prepare('SELECT id FROM volunteers').all() as { id: number }[]).map(r => r.id)
  const updateVolunteer = db.prepare(`
    UPDATE volunteers SET
      name                  = ?,
      email                 = ?,
      bio                   = '[redacted]',
      discord_handle        = NULL,
      signal_number         = NULL,
      whatsapp_number       = NULL,
      contact_notes         = NULL,
      other_skills          = NULL,
      location              = NULL,
      local_group           = NULL,
      auth_token            = NULL,
      auth_token_expires_at = NULL,
      password_hash         = ?
    WHERE id = ?
  `)
  for (const vid of volunteerIds) {
    const { name, email } = fakeVolunteer(vid)
    updateVolunteer.run(name, email, anonPasswordHash, vid)
  }

  const adminInvites = db.prepare('SELECT id, invited_by_id FROM admin_invites').all() as { id: number; invited_by_id: number }[]
  const updateInvite = db.prepare('UPDATE admin_invites SET email = ?, invite_token = ? WHERE id = ?')
  for (const row of adminInvites) {
    updateInvite.run(fakeVolunteer(row.invited_by_id).email, randomToken(), row.id)
  }

  db.exec("UPDATE admin_notes SET content = '[redacted]'")
  db.exec("UPDATE contact_messages SET subject = '[redacted]', message = '[redacted]'")
  db.exec("UPDATE bug_reports SET reporter_email = NULL, description = '[redacted]'")
  db.exec('UPDATE deletion_requests SET volunteer_email = NULL')

  const resetTokenIds = (db.prepare('SELECT id FROM password_reset_tokens').all() as { id: number }[]).map(r => r.id)
  const updateToken = db.prepare('UPDATE password_reset_tokens SET token = ? WHERE id = ?')
  for (const id of resetTokenIds) {
    updateToken.run(randomToken(), id)
  }

  db.exec('UPDATE notifications SET body = NULL')
  db.exec("UPDATE project_updates SET content = '[redacted]'")

  db.exec('PRAGMA journal_mode=DELETE')
  db.close()
}

function seedDevAccounts(dbPath: string): void {
  const db = new DatabaseSync(dbPath)
  const insert = db.prepare(`
    INSERT OR REPLACE INTO volunteers (name, email, password_hash, is_admin, profile_visible)
    VALUES (?, ?, ?, ?, 0)
  `)
  insert.run('Dev Volunteer', 'volunteer@example.com', makePasswordHash('volunteer1'), 0)
  insert.run('Dev Admin', 'admin@example.com', makePasswordHash('admin1'), 1)
  db.close()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvFile(envFile)

  const keyId = process.env.B2_KEY_ID
  const appKey = process.env.B2_APP_KEY
  const bucketName = process.env.B2_BUCKET_NAME

  if (!keyId || !appKey || !bucketName) {
    console.error('Error: B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME must be set')
    console.error(`       Add them to '${envFile}' or export them as environment variables.`)
    process.exit(1)
  }

  const prodPath = resolve(ROOT, 'prod.db')
  const destPath = resolve(ROOT, 'anonymised_prod.db')

  console.log('Authorising with B2...')
  const auth = await b2Authorize(keyId, appKey)
  const bucketId = await b2GetBucketId(auth, bucketName)

  console.log('Listing backups...')
  const files = await b2ListFiles(auth, bucketId, 'backups/')
  if (!files.length) {
    console.error('No backups found in B2.')
    process.exit(1)
  }

  const latest = files.reduce((a, b) => a.uploadTimestamp > b.uploadTimestamp ? a : b)
  console.log(`Latest backup: ${latest.fileName} (${(latest.contentLength / 1024).toFixed(0)} KB)`)

  console.log('Downloading...')
  await b2DownloadFile(auth, bucketName, latest.fileName, prodPath)

  if (existsSync(destPath)) {
    console.log(`Removing existing ${destPath}`)
    unlinkSync(destPath)
  }

  console.log(`Copying prod.db → anonymised_prod.db`)
  copyFileSync(prodPath, destPath)

  console.log('Anonymising...')
  anonymise(destPath)

  console.log('Seeding dev accounts...')
  seedDevAccounts(destPath)

  const sizeKb = statSync(destPath).size / 1024
  console.log(`Done. anonymised_prod.db written (${sizeKb.toFixed(0)} KB)`)
  console.log('  volunteer@example.com / volunteer1')
  console.log('  admin@example.com     / admin1')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
