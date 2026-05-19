import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto'
import { prisma } from './prisma'

// PBKDF2-SHA256 password hashing — matches the Python implementation exactly:
// salt = secrets.token_bytes(32); key = hashlib.pbkdf2_hmac('sha256', pw, salt, 100000)
// stored as base64(salt + key)
export function hashPassword(password: string): string {
  const salt = randomBytes(32)
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  return Buffer.concat([salt, key]).toString('base64')
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    const decoded = Buffer.from(hash, 'base64')
    const salt = decoded.subarray(0, 32)
    const storedKey = decoded.subarray(32)
    const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
    return timingSafeEqual(key, storedKey)
  } catch {
    return false
  }
}

// secrets.token_urlsafe(32) in Python = 32 random bytes as base64url
export function generateAuthToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function getCurrentVolunteer(authorization: string | null | undefined) {
  if (!authorization) return null
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization
  return prisma.volunteer.findFirst({
    where: {
      authToken: token,
      deletedAt: null,
      OR: [{ authTokenExpiresAt: null }, { authTokenExpiresAt: { gt: new Date() } }],
    },
  })
}

// Convert a Prisma Volunteer to a camelCase response format.
// showContact controls whether email and direct contact fields are included.
export function serializeVolunteer(
  vol: Record<string, unknown>,
  opts: { showContact?: boolean; skills?: unknown[]; endorsements?: unknown[] } = {},
) {
  const { showContact = false, skills, endorsements } = opts
  return {
    id: vol.id as number,
    name: vol.name as string | null,
    bio: vol.bio as string | null,
    location: vol.location as string | null,
    country: vol.country as string | null,
    localGroup: vol.localGroup as string | null,
    availabilityHoursPerWeek: vol.availabilityHoursPerWeek as number | null,
    otherSkills: vol.otherSkills as string | null,
    consentMakeProfileVisibleInDirectory: vol.consentMakeProfileVisibleInDirectory as boolean,
    consentContactableByProjectOwners: vol.consentContactableByProjectOwners as boolean,
    consentShareContactInfoWithProjectOwner: vol.consentShareContactInfoWithProjectOwner as boolean,
    consentGivenAt: vol.consentGivenAt as Date | string | null,
    cookieConsentAnalytics: (vol.cookieConsentAnalytics as boolean | null | undefined) ?? null,
    isAdmin: vol.isAdmin as boolean,
    isSuperAdmin: isSuperAdmin(vol.email as string | null | undefined),
    approvalStatus: vol.approvalStatus as string | null,
    emailConfirmed: vol.emailConfirmed as boolean | null,
    emailDigest: vol.emailDigest as string | null,
    hasPassword: Boolean(vol.passwordHash),
    createdAt: vol.createdAt as Date | string | null,
    updatedAt: vol.updatedAt as Date | string | null,
    deletedAt: vol.deletedAt as Date | string | null,
    email: showContact ? (vol.email as string | null) : undefined,
    discordHandle: showContact ? (vol.discordHandle as string | null) : undefined,
    signalNumber: showContact ? (vol.signalNumber as string | null) : undefined,
    whatsappNumber: showContact ? (vol.whatsappNumber as string | null) : undefined,
    contactPreference: showContact ? (vol.contactPreference as string | null) : undefined,
    contactNotes: showContact ? (vol.contactNotes as string | null) : undefined,
    skills: skills as unknown[] | undefined,
    endorsements: endorsements as unknown[] | undefined,
  }
}

export function serializeSkill(vs: {
  proficiencyLevel: string | null
  skill: {
    id: number
    categoryId: number
    name: string
    description: string | null
    sortOrder: number | null
    createdAt: Date | null
    category: { name: string }
  }
}) {
  return {
    id: vs.skill.id,
    categoryId: vs.skill.categoryId,
    name: vs.skill.name,
    description: vs.skill.description,
    sortOrder: vs.skill.sortOrder,
    createdAt: vs.skill.createdAt,
    categoryName: vs.skill.category.name,
    proficiencyLevel: vs.proficiencyLevel,
  }
}

export function serializeEndorsement(se: {
  skillId: number
  rating: string | null
  skill: { name: string }
}) {
  return { skillId: se.skillId, rating: se.rating, skillName: se.skill.name }
}

export async function requireAdmin(
  authorization: string | null | undefined,
): Promise<
  | { volunteer: NonNullable<Awaited<ReturnType<typeof getCurrentVolunteer>>>; error: null }
  | { volunteer: null; error: Response }
> {
  const volunteer = await getCurrentVolunteer(authorization)
  if (!volunteer) {
    return {
      volunteer: null,
      error: Response.json({ detail: 'Authentication required' }, { status: 401 }),
    }
  }
  if (!volunteer.isAdmin) {
    return {
      volunteer: null,
      error: Response.json({ detail: 'Admin access required' }, { status: 403 }),
    }
  }
  return { volunteer, error: null }
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails = process.env.ADMIN_EMAILS || ''
  return adminEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())
}

export async function requireSuperAdmin(
  authorization: string | null | undefined,
): Promise<
  | { volunteer: NonNullable<Awaited<ReturnType<typeof getCurrentVolunteer>>>; error: null }
  | { volunteer: null; error: Response }
> {
  const result = await requireAdmin(authorization)
  if (result.error) return result
  if (!isSuperAdmin(result.volunteer.email)) {
    return {
      volunteer: null,
      error: Response.json({ detail: 'Super-admin access required' }, { status: 403 }),
    }
  }
  return result
}

// Promote volunteer to admin if their email is in ADMIN_EMAILS env var
export async function checkAdminBootstrap(email: string, volunteerId: number): Promise<boolean> {
  const adminEmails = process.env.ADMIN_EMAILS || ''
  if (!adminEmails) return false
  const allowed = adminEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allowed.includes(email.toLowerCase())) return false
  await prisma.volunteer.updateMany({
    where: { id: volunteerId, isAdmin: false },
    data: { isAdmin: true, approvalStatus: 'APPROVED', emailConfirmed: true },
  })
  return true
}

// Accept any pending admin invite for this email (case-insensitive).
// expires_at may be an ISO string (FastAPI-created) or ms timestamp (Prisma-created);
// compare against both formats to be safe during the migration.
export async function acceptPendingInvite(email: string, volunteerId: number): Promise<boolean> {
  const nowIso = new Date().toISOString()
  const nowMs = Date.now()
  const result = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM admin_invites
    WHERE LOWER(email) = ${email.toLowerCase()}
      AND status = 'pending'
      AND (
        (typeof(expires_at) = 'text' AND expires_at > ${nowIso})
        OR (typeof(expires_at) = 'integer' AND expires_at > ${nowMs})
      )
    LIMIT 1
  `
  const invite = result[0]
  if (!invite) return false
  await prisma.volunteer.update({
    where: { id: volunteerId },
    data: { isAdmin: true, approvalStatus: 'APPROVED', emailConfirmed: true },
  })
  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: { status: 'accepted', acceptedById: volunteerId, acceptedAt: new Date() },
  })
  return true
}
