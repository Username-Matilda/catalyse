import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDbUrl } from '@/lib/db-url'
import {
  b2Authorize,
  b2CredentialsFromEnv,
  b2DeleteFile,
  b2GetBucketId,
  b2ListFiles,
  b2Upload,
} from '@/jobs/b2'
import { anonymisedDbUrl, buildAnonymisedCopy } from '@/jobs/anonymise'

const LOCAL_RETENTION_DAYS = 7
const B2_RETENTION_DAYS = 30
// One fixed name in the anonymised bucket; each upload replaces the previous version.
export const ANONYMISED_DUMP_NAME = 'latest.dump'

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '')
}

// ── Backup logic ──────────────────────────────────────────────────────────────

// Dumps live on the volume when Railway provides one, so the last week survives a redeploy.
function localBackupDir(): string {
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH
  return join(/*turbopackIgnore: true*/ mount ?? tmpdir(), 'backups')
}

// Prisma accepts pool and driver options in the URL that libpq rejects as unknown.
const PRISMA_ONLY_PARAMS = [
  'schema',
  'pgbouncer',
  'connection_limit',
  'pool_timeout',
  'socket_timeout',
  'statement_cache_size',
  'sslcert',
  'sslidentity',
  'sslpassword',
  'sslaccept',
]

export function libpqUrl(prismaUrl: string): string {
  const url = new URL(prismaUrl)
  for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p)
  return url.toString()
}

/** Major versions of the pg_dump binary and the server; pg_dump refuses a newer server. */
export async function checkClientVersion(): Promise<{ client: number; server: number }> {
  const client = Number(
    /\d+/.exec(execFileSync('pg_dump', ['--version'], { encoding: 'utf8' }))?.[0],
  )
  const { prisma } = await import('@/lib/prisma')
  const [{ v }] = await prisma.$queryRaw<[{ v: string }]>`SHOW server_version`
  const server = Number(/\d+/.exec(v)?.[0])
  if (client < server)
    throw new Error(
      `pg_dump ${client} cannot back up a PostgreSQL ${server} server — bump postgresql_${server} in nixpacks.toml`,
    )
  return { client, server }
}

// Custom format is compressed and restores selectively with pg_restore.
function pgDump(dbUrl: string, dest: string): void {
  execFileSync(
    'pg_dump',
    [
      '--format=custom',
      '--schema=public',
      '--no-owner',
      '--no-privileges',
      '--file',
      dest,
      libpqUrl(dbUrl),
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
}

function createLocalBackup(): string {
  const backupDir = localBackupDir()
  mkdirSync(backupDir, { recursive: true })
  const name = `catalyse-${timestamp()}.dump`
  const dest = join(/*turbopackIgnore: true*/ backupDir, name)
  pgDump(resolveDbUrl(), dest)
  const kb = (statSync(dest).size / 1024).toFixed(0)
  console.log(`[BACKUP] Local backup created: ${name} (${kb} KB)`)
  return dest
}

function cleanupLocalBackups() {
  const backupDir = localBackupDir()
  if (!existsSync(backupDir)) return
  const cutoff = Date.now() - LOCAL_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let removed = 0
  for (const f of readdirSync(backupDir)) {
    if (!f.startsWith('catalyse-') || !(f.endsWith('.dump') || f.endsWith('.db'))) continue
    const fp = join(/*turbopackIgnore: true*/ backupDir, f)
    if (statSync(fp).mtimeMs < cutoff) {
      unlinkSync(fp)
      removed++
    }
  }
  if (removed)
    console.log(
      `[BACKUP] Removed ${removed} local backup(s) older than ${LOCAL_RETENTION_DAYS} days`,
    )
}

async function uploadToB2(backupPath: string): Promise<boolean> {
  const creds = b2CredentialsFromEnv('B2')
  if (!creds) {
    console.log('[BACKUP] B2 not configured, skipping cloud upload')
    return false
  }
  try {
    const fileName = `backups/${backupPath.split('/').pop()}`
    const bytes = await b2Upload(creds, fileName, readFileSync(backupPath))
    console.log(`[BACKUP] Uploaded to B2: ${fileName} (${(bytes / 1024).toFixed(0)} KB)`)
    return true
  } catch (err) {
    console.error('[BACKUP] B2 upload failed:', err)
    return false
  }
}

/**
 * Restores the fresh backup into the scratch database, strips the personal data, and
 * publishes the result to the anonymised bucket for preview environments and developers.
 * The scratch database lives on the same server and is created once by hand.
 */
async function publishAnonymisedCopy(backupPath: string): Promise<boolean> {
  const creds = b2CredentialsFromEnv('B2_ANON')
  if (!creds) {
    console.log('[BACKUP] Anonymised bucket not configured, skipping')
    return false
  }
  const dest = join(/*turbopackIgnore: true*/ tmpdir(), `catalyse-anonymised-${timestamp()}.dump`)
  try {
    const scratchUrl = anonymisedDbUrl(resolveDbUrl())
    await buildAnonymisedCopy(backupPath, libpqUrl(scratchUrl))
    pgDump(scratchUrl, dest)
    const bytes = await b2Upload(creds, ANONYMISED_DUMP_NAME, readFileSync(dest))
    console.log(
      `[BACKUP] Uploaded anonymised copy to ${creds.bucketName}/${ANONYMISED_DUMP_NAME} (${(bytes / 1024).toFixed(0)} KB)`,
    )
    return true
  } catch (err) {
    console.error('[BACKUP] Anonymised copy failed:', err)
    return false
  } finally {
    if (existsSync(dest)) unlinkSync(dest)
  }
}

async function cleanupB2Backups() {
  const creds = b2CredentialsFromEnv('B2')
  if (!creds) return
  try {
    const auth = await b2Authorize(creds)
    const bucketId = await b2GetBucketId(auth, creds.bucketName)
    const files = await b2ListFiles(auth, bucketId, 'backups/')
    const cutoffMs = Date.now() - B2_RETENTION_DAYS * 24 * 60 * 60 * 1000
    let removed = 0
    for (const f of files) {
      if (f.uploadTimestamp < cutoffMs) {
        await b2DeleteFile(auth, f.fileId, f.fileName)
        removed++
      }
    }
    if (removed)
      console.log(`[BACKUP] Removed ${removed} B2 backup(s) older than ${B2_RETENTION_DAYS} days`)
  } catch (err) {
    console.error('[BACKUP] B2 cleanup failed:', err)
  }
}

export interface BackupResult {
  localSuccess: boolean
  b2Success: boolean
  anonSuccess: boolean
}

/**
 * The anonymised copy is only needed nightly; the pre-deploy backup in `scripts/migrate.ts`
 * skips it so deploys stay quick.
 */
export async function runBackupJob({ anonymise = true } = {}): Promise<BackupResult> {
  console.log(`[BACKUP] Starting backup at ${new Date().toISOString()}`)
  let backupPath: string
  try {
    await checkClientVersion()
    backupPath = createLocalBackup()
  } catch (err) {
    console.error('[BACKUP] pg_dump failed:', err)
    return { localSuccess: false, b2Success: false, anonSuccess: false }
  }
  const b2Success = await uploadToB2(backupPath)
  const anonSuccess = anonymise ? await publishAnonymisedCopy(backupPath) : false
  cleanupLocalBackups()
  await cleanupB2Backups()
  console.log('[BACKUP] Backup cycle complete')
  return { localSuccess: true, b2Success, anonSuccess }
}
