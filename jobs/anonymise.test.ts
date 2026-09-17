import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'
import { prisma } from '@/lib/prisma'
import { createSession, verifyPassword } from '@/lib/auth'
import { createVolunteer } from '@/test/factories'
import { libpqUrl } from '@/jobs/backup'
import { anonymise, anonymisedDbUrl, seedDevAccounts, ANONYMISED_DB_NAME } from './anonymise'

// The anonymiser speaks plain SQL, so it needs a pg client pointed at this file's schema.
let db: Client
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  db = new Client({ connectionString: libpqUrl(url.toString()) })
  await db.connect()
  await db.query(`SET search_path TO "${url.searchParams.get('schema')}"`)
})
afterAll(() => db.end())

describe('anonymisedDbUrl', () => {
  it('swaps only the database name', () => {
    expect(anonymisedDbUrl('postgresql://u:p@host:5432/railway?sslmode=require')).toBe(
      `postgresql://u:p@host:5432/${ANONYMISED_DB_NAME}?sslmode=require`,
    )
  })

  it('refuses a URL that already points at the scratch database', () => {
    expect(() => anonymisedDbUrl(`postgresql://u@host/${ANONYMISED_DB_NAME}`)).toThrow(
      ANONYMISED_DB_NAME,
    )
  })
})

describe('anonymise', () => {
  it('replaces every personal field, redacts free text and drops sessions', async () => {
    const v = await createVolunteer({
      name: 'Real Person',
      email: 'real@example.org',
      bio: 'Lives at 1 Real Street',
      discordHandle: 'realdiscord',
      signalNumber: '+441234567890',
      contactNotes: 'call after 6',
      authToken: 'tok',
    })
    await createSession(v.id)
    await prisma.adminNote.create({
      data: { volunteerId: v.id, authorId: v.id, content: 'sensitive note' },
    })
    await prisma.notification.create({
      data: { volunteerId: v.id, type: 'new_interest', title: 't', body: 'private body' },
    })
    await prisma.passwordResetToken.create({
      data: { volunteerId: v.id, token: 'reset-token', expiresAt: new Date() },
    })

    await anonymise(db)

    const after = await prisma.volunteer.findUniqueOrThrow({ where: { id: v.id } })
    expect(after.name).not.toBe('Real Person')
    expect(after.email).not.toBe('real@example.org')
    expect(after.email).toMatch(/@/)
    expect(after.bio).not.toBe('Lives at 1 Real Street')
    expect(after.discordHandle).not.toBe('realdiscord')
    expect(after.signalNumber).not.toBe('+441234567890')
    expect(after.contactNotes).not.toBe('call after 6')
    // Fields that were null stay null, so the shape of the data is preserved.
    expect(after.whatsappNumber).toBeNull()
    expect(after.authToken).toBeNull()
    expect(verifyPassword('volunteerpass1', after.passwordHash!)).toBe(true)

    // The same volunteer always gets the same fake identity.
    const again = await prisma.volunteer.findUniqueOrThrow({ where: { id: v.id } })
    await anonymise(db)
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({
      name: again.name,
      email: again.email,
    })

    expect(await prisma.session.count({ where: { volunteerId: v.id } })).toBe(0)
    expect((await prisma.adminNote.findFirst({ where: { volunteerId: v.id } }))?.content).toBe(
      '[redacted]',
    )
    expect((await prisma.notification.findFirst({ where: { volunteerId: v.id } }))?.body).toBeNull()
    expect(
      (await prisma.passwordResetToken.findFirst({ where: { volunteerId: v.id } }))?.token,
    ).not.toBe('reset-token')
  })
})

describe('seedDevAccounts', () => {
  it('creates the three dev logins and revives them if they already exist', async () => {
    await createVolunteer({ email: 'admin@example.com', isAdmin: false, deletedAt: new Date() })

    await seedDevAccounts(db)

    const admin = await prisma.volunteer.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    })
    expect(admin.isAdmin).toBe(true)
    expect(admin.deletedAt).toBeNull()
    expect(verifyPassword('password1', admin.passwordHash!)).toBe(true)
    for (const email of ['volunteer@example.com', 'superadmin@example.com']) {
      expect(await prisma.volunteer.findUnique({ where: { email } })).not.toBeNull()
    }
  })
})
