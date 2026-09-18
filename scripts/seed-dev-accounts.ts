import { pbkdf2Sync, randomBytes } from 'node:crypto'
import type { Client } from 'pg'

export function makePasswordHash(password: string): string {
  const salt = randomBytes(32)
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  return Buffer.concat([salt, key]).toString('base64')
}

async function upsertAccount(
  db: Client,
  name: string,
  email: string,
  password: string,
  isAdmin: boolean,
): Promise<void> {
  await db.query(
    `INSERT INTO volunteers (name, email, password_hash, is_admin, location, country, local_group, location_confirmed_at, created_at, updated_at, approval_status, email_confirmed, consent_make_profile_visible_in_directory)
     VALUES ($1, $2, $3, $4, 'London, UK', 'UK', 'London', now(), now(), now(), 'approved', true, false)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = EXCLUDED.is_admin, deleted_at = NULL`,
    [name, email, makePasswordHash(password), isAdmin],
  )
}

export async function seedDevAccounts(db: Client): Promise<void> {
  await upsertAccount(db, 'Dev Volunteer', 'volunteer@example.com', 'password1', false)
  await upsertAccount(db, 'Dev Admin', 'admin@example.com', 'password1', true)
  await upsertAccount(db, 'Dev Super Admin', 'superadmin@example.com', 'password1', true)
}
