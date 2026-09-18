#!/usr/bin/env node
/**
 * Bridge for the SQLite → Postgres cutover; delete once production has been migrated.
 *
 * Runs at container start, after `prisma migrate deploy`. Idempotent: it does nothing when
 * the Postgres `volunteers` table already has rows, so every deploy after the first is a no-op.
 *
 * Source, in order: `--from`; a live SQLite file on the volume; otherwise, outside production,
 * the latest SQLite backup in B2 (a branch deploy has neither database, so this rehearses
 * the whole path; the data is not anonymised). Production with no live file is an error.
 *
 * Outside production it then upserts volunteer@, admin@ and superadmin@example.com (all
 * password1; never in production), so a branch deploy can be logged into.
 *
 * In production the snapshot of the live file is stored in B2 under `pre-postgres-migration/`
 * first, aborting if that fails. The live file is only ever opened read-only.
 *
 * `--from <file>` loads a specific SQLite file instead (local use). SKIP_SQLITE_MIGRATION=1
 * disables the script.
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'
import {
  b2Authorize,
  b2DownloadFile,
  b2GetBucketId,
  b2GetUploadUrl,
  b2ListFiles,
  b2UploadFile,
  isB2Configured,
  libpqUrl,
} from '../jobs/backup'
import { resolveDbUrl } from '../lib/db-url'
import { seedDevAccounts } from './seed-dev-accounts'
import { copySqliteToPostgres } from './sqlite-to-pg'

const LOG = '[SQLITE-MIGRATION]'
// Arbitrary constant; serialises concurrent containers so only one runs the load.
const ADVISORY_LOCK_KEY = 727001

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

async function hasData(pg: Client): Promise<boolean> {
  const { rows } = await pg.query<{ present: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM volunteers) AS present',
  )
  return rows[0].present
}

/** A consistent single-file copy that includes anything still in the WAL. */
function snapshot(source: string, dest: string): void {
  const db = new DatabaseSync(source, { readOnly: true })
  try {
    db.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`)
  } finally {
    db.close()
  }
}

async function b2Bucket(): Promise<{ auth: Awaited<ReturnType<typeof b2Authorize>>; id: string }> {
  const auth = await b2Authorize()
  return { auth, id: await b2GetBucketId(auth, process.env.B2_BUCKET_NAME!) }
}

async function uploadSafetyCopy(path: string): Promise<void> {
  if (!isB2Configured())
    throw new Error('B2 is not configured; refusing to migrate without a safety copy')
  const { auth, id } = await b2Bucket()
  const { uploadUrl, uploadToken } = await b2GetUploadUrl(auth, id)
  const data = readFileSync(path)
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '')
  const fileName = `pre-postgres-migration/catalyse-${stamp}.db`
  const result = await b2UploadFile(uploadUrl, uploadToken, fileName, data)
  if (result.contentLength !== data.length)
    throw new Error(`B2 stored ${result.contentLength} bytes of ${data.length} for ${fileName}`)
  console.log(
    `${LOG} Safety copy stored in B2: ${fileName} (${(data.length / 1024).toFixed(0)} KB)`,
  )
}

async function downloadLatestBackup(dest: string): Promise<boolean> {
  if (!isB2Configured()) {
    console.log(`${LOG} Skipped: B2 not configured`)
    return false
  }
  const { auth, id } = await b2Bucket()
  const files = (await b2ListFiles(auth, id, 'backups/')).filter((f) => f.fileName.endsWith('.db'))
  if (!files.length) {
    console.log(`${LOG} Skipped: no SQLite backups in B2`)
    return false
  }
  const latest = files.reduce((a, b) => (a.uploadTimestamp > b.uploadTimestamp ? a : b))
  console.log(`${LOG} Latest SQLite backup: ${latest.fileName}`)
  writeFileSync(dest, await b2DownloadFile(auth, process.env.B2_BUCKET_NAME!, latest.fileName))
  return true
}

/** Returns the SQLite file to migrate from, or null when there is nothing to migrate. */
async function locateSource(isProduction: boolean, workDir: string): Promise<string | null> {
  const from = argValue('--from')
  if (from) return from

  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH
  const live = mount ? join(mount, 'catalyse.db') : null
  if (live && existsSync(live)) return live

  if (isProduction)
    throw new Error(
      `Postgres is empty and no live SQLite file was found at ${live ?? '(no volume mounted)'}`,
    )

  const downloaded = join(workDir, 'backup.db')
  return (await downloadLatestBackup(downloaded)) ? downloaded : null
}

async function migrateData(pg: Client, isProduction: boolean, workDir: string): Promise<void> {
  const source = await locateSource(isProduction, workDir)
  if (!source) return

  const copy = join(workDir, 'snapshot.db')
  snapshot(source, copy)
  if (isProduction && !argValue('--from')) await uploadSafetyCopy(copy)

  const sqlite = new DatabaseSync(copy, { readOnly: true })
  try {
    console.log(`${LOG} Loading ${source} into Postgres...`)
    await copySqliteToPostgres(sqlite, pg)
  } finally {
    sqlite.close()
  }
}

async function main(): Promise<void> {
  if (process.env.SKIP_SQLITE_MIGRATION === '1') {
    console.log(`${LOG} Skipped (SKIP_SQLITE_MIGRATION=1)`)
    return
  }
  const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production'

  const pg = new Client({ connectionString: libpqUrl(resolveDbUrl()) })
  await pg.connect()
  const workDir = mkdtempSync(join(tmpdir(), 'sqlite-migration-'))
  try {
    await pg.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])
    if (await hasData(pg)) console.log(`${LOG} Skipped: Postgres already has data`)
    else await migrateData(pg, isProduction, workDir)

    // Only once there is real data: a lone seeded row would make later starts skip the load.
    if (!isProduction && (await hasData(pg))) {
      await seedDevAccounts(pg)
      console.log(`${LOG} Seeded dev accounts`)
    }
    console.log(`${LOG} Done.`)
  } finally {
    await pg.end()
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`${LOG} Failed:`, err instanceof Error ? err.message : err)
  process.exit(1)
})
