import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const LOCAL_RETENTION_DAYS = 7
const B2_RETENTION_DAYS = 30

export function getDbPath(): string | null {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
  if (mountPath && isProduction) return join(mountPath, 'catalyse.db')
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl?.startsWith('file:')) return dbUrl.slice(5)
  return null
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '')
}

// ── B2 API ────────────────────────────────────────────────────────────────────

interface B2Auth {
  authorizationToken: string
  apiUrl: string
  accountId: string
}

async function b2Authorize(): Promise<B2Auth> {
  const keyId = process.env.B2_KEY_ID!
  const appKey = process.env.B2_APP_KEY!
  const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64')
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) throw new Error(`B2 auth failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function b2GetBucketId(auth: B2Auth, bucketName: string): Promise<string> {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: auth.accountId, bucketName }),
  })
  if (!res.ok) throw new Error(`b2_list_buckets failed: ${res.status} ${await res.text()}`)
  const { buckets } = await res.json()
  if (!buckets?.length) throw new Error(`Bucket '${bucketName}' not found`)
  return buckets[0].bucketId
}

async function b2GetUploadUrl(auth: B2Auth, bucketId: string) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId }),
  })
  if (!res.ok) throw new Error(`b2_get_upload_url failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { uploadUrl: data.uploadUrl as string, uploadToken: data.authorizationToken as string }
}

async function b2UploadFile(
  uploadUrl: string,
  uploadToken: string,
  fileName: string,
  fileData: Buffer,
) {
  const sha1 = createHash('sha1').update(fileData).digest('hex')
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: uploadToken,
      'X-Bz-File-Name': fileName,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(fileData.length),
      'X-Bz-Content-Sha1': sha1,
    },
    body: new Uint8Array(fileData),
  })
  if (!res.ok) throw new Error(`b2_upload_file failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function b2ListFiles(auth: B2Auth, bucketId: string, prefix: string) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId, prefix, maxFileCount: 1000 }),
  })
  if (!res.ok) throw new Error(`b2_list_file_names failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.files as Array<{ fileId: string; fileName: string; uploadTimestamp: number }>
}

async function b2DeleteFile(auth: B2Auth, fileId: string, fileName: string) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, fileName }),
  })
  if (!res.ok) throw new Error(`b2_delete_file_version failed: ${res.status} ${await res.text()}`)
}

// ── Backup logic ──────────────────────────────────────────────────────────────

function isB2Configured() {
  return Boolean(process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_BUCKET_NAME)
}

function createLocalBackup(dbPath: string): string {
  const backupDir = join(/*turbopackIgnore: true*/ dirname(dbPath), 'backups')
  mkdirSync(backupDir, { recursive: true })
  const name = `catalyse-${timestamp()}.db`
  const dest = join(/*turbopackIgnore: true*/ backupDir, name)
  copyFileSync(dbPath, dest)
  const kb = (statSync(dest).size / 1024).toFixed(0)
  console.log(`[BACKUP] Local backup created: ${name} (${kb} KB)`)
  return dest
}

function cleanupLocalBackups(dbPath: string) {
  const backupDir = join(/*turbopackIgnore: true*/ dirname(dbPath), 'backups')
  if (!existsSync(backupDir)) return
  const cutoff = Date.now() - LOCAL_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let removed = 0
  for (const f of readdirSync(backupDir)) {
    if (!f.startsWith('catalyse-') || !f.endsWith('.db')) continue
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
  if (!isB2Configured()) {
    console.log('[BACKUP] B2 not configured, skipping cloud upload')
    return false
  }
  try {
    const auth = await b2Authorize()
    const bucketId = await b2GetBucketId(auth, process.env.B2_BUCKET_NAME!)
    const { uploadUrl, uploadToken } = await b2GetUploadUrl(auth, bucketId)
    const fileName = `backups/${backupPath.split('/').pop()}`
    const fileData = readFileSync(backupPath)
    const result = await b2UploadFile(uploadUrl, uploadToken, fileName, fileData)
    const kb = ((result.contentLength ?? fileData.length) / 1024).toFixed(0)
    console.log(`[BACKUP] Uploaded to B2: ${fileName} (${kb} KB)`)
    return true
  } catch (err) {
    console.error('[BACKUP] B2 upload failed:', err)
    return false
  }
}

async function cleanupB2Backups() {
  if (!isB2Configured()) return
  try {
    const auth = await b2Authorize()
    const bucketId = await b2GetBucketId(auth, process.env.B2_BUCKET_NAME!)
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

export async function runBackup(): Promise<{ local: boolean; b2: boolean }> {
  const dbPath = getDbPath()
  if (!dbPath || !existsSync(dbPath)) {
    console.log('[BACKUP] Database not found, skipping')
    return { local: false, b2: false }
  }

  console.log(`[BACKUP] Starting backup at ${new Date().toISOString()}`)
  const backupPath = createLocalBackup(dbPath)
  const b2 = await uploadToB2(backupPath)
  cleanupLocalBackups(dbPath)
  await cleanupB2Backups()
  console.log('[BACKUP] Backup cycle complete')
  return { local: true, b2 }
}
