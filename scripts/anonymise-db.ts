#!/usr/bin/env node
/**
 * Anonymises PII in the database at DATABASE_URL and seeds the dev accounts. Destructive and
 * irreversible, so it refuses to touch the production environment.
 *
 * Usage:
 *   npx tsx scripts/anonymise-db.ts
 */

import { fileURLToPath } from 'node:url'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { faker } from '@faker-js/faker'
import { libpqUrl } from '../jobs/backup'
import { resolveDbUrl } from '../lib/db-url'

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
  if (process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
    console.error('Refusing to run in the production environment')
    process.exit(1)
  }

  const dbUrl = libpqUrl(resolveDbUrl())
  const db = new Client({ connectionString: dbUrl })
  await db.connect()
  try {
    console.log(`Anonymising ${new URL(dbUrl).pathname.slice(1)}...`)
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
