import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

/**
 * Backblaze B2 native API. Two buckets are in play: the raw backup bucket (`B2_*`, written
 * and pruned by production only) and the anonymised bucket (`B2_ANON_*`, written by
 * production, read by every other environment with a read-only key).
 */

export interface B2Credentials {
  keyId: string
  appKey: string
  bucketName: string
}

export interface B2Auth {
  authorizationToken: string
  apiUrl: string
  downloadUrl: string
  accountId: string
  // Populated when the key is restricted to one bucket; such a key cannot list buckets.
  allowed: { bucketId: string | null; bucketName: string | null }
}

export function b2CredentialsFromEnv(prefix: 'B2' | 'B2_ANON'): B2Credentials | null {
  const keyId = process.env[`${prefix}_KEY_ID`]
  const appKey = process.env[`${prefix}_APP_KEY`]
  const bucketName = process.env[`${prefix}_BUCKET_NAME`]
  return keyId && appKey && bucketName ? { keyId, appKey, bucketName } : null
}

export async function b2Authorize({ keyId, appKey }: B2Credentials): Promise<B2Auth> {
  const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64')
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) throw new Error(`B2 auth failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function b2GetBucketId(auth: B2Auth, bucketName: string): Promise<string> {
  if (auth.allowed?.bucketId) {
    if (auth.allowed.bucketName !== bucketName)
      throw new Error(`B2 key is restricted to '${auth.allowed.bucketName}', not '${bucketName}'`)
    return auth.allowed.bucketId
  }
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

export async function b2GetUploadUrl(auth: B2Auth, bucketId: string) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId }),
  })
  if (!res.ok) throw new Error(`b2_get_upload_url failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { uploadUrl: data.uploadUrl as string, uploadToken: data.authorizationToken as string }
}

export async function b2UploadFile(
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

/** Authorises, resolves the bucket and uploads in one go. Returns the stored size in bytes. */
export async function b2Upload(
  creds: B2Credentials,
  fileName: string,
  fileData: Buffer,
): Promise<number> {
  const auth = await b2Authorize(creds)
  const bucketId = await b2GetBucketId(auth, creds.bucketName)
  const { uploadUrl, uploadToken } = await b2GetUploadUrl(auth, bucketId)
  const result = await b2UploadFile(uploadUrl, uploadToken, fileName, fileData)
  return result.contentLength ?? fileData.length
}

export async function b2ListFiles(auth: B2Auth, bucketId: string, prefix: string) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId, prefix, maxFileCount: 1000 }),
  })
  if (!res.ok) throw new Error(`b2_list_file_names failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.files as Array<{
    fileId: string
    fileName: string
    uploadTimestamp: number
    contentLength: number
  }>
}

export async function b2DeleteFile(auth: B2Auth, fileId: string, fileName: string) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, fileName }),
  })
  if (!res.ok) throw new Error(`b2_delete_file_version failed: ${res.status} ${await res.text()}`)
}

export async function b2DownloadFile(
  auth: B2Auth,
  bucketName: string,
  fileName: string,
  destPath: string,
): Promise<void> {
  const res = await fetch(`${auth.downloadUrl}/file/${bucketName}/${fileName}`, {
    headers: { Authorization: auth.authorizationToken },
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${await res.text()}`)
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
}
