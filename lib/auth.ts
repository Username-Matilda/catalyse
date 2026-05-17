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
  const result: Record<string, unknown> = {
    id: vol.id,
    name: vol.name,
    bio: vol.bio,
    location: vol.location,
    country: vol.country,
    localGroup: vol.localGroup,
    availabilityHoursPerWeek: vol.availabilityHoursPerWeek,
    otherSkills: vol.otherSkills,
    consentMakeProfileVisibleInDirectory: vol.consentMakeProfileVisibleInDirectory,
    consentContactableByProjectOwners: vol.consentContactableByProjectOwners,
    consentShareContactInfoWithProjectOwner: vol.consentShareContactInfoWithProjectOwner,
    consentGivenAt: vol.consentGivenAt,
    isAdmin: vol.isAdmin,
    isSuperAdmin: isSuperAdmin(vol.email as string | null | undefined),
    approvalStatus: vol.approvalStatus,
    emailConfirmed: vol.emailConfirmed,
    emailDigest: vol.emailDigest,
    hasPassword: Boolean(vol.passwordHash),
    createdAt: vol.createdAt,
    updatedAt: vol.updatedAt,
    deletedAt: vol.deletedAt,
  }
  if (showContact) {
    result.email = vol.email
    result.discordHandle = vol.discordHandle
    result.signalNumber = vol.signalNumber
    result.whatsappNumber = vol.whatsappNumber
    result.contactPreference = vol.contactPreference
    result.contactNotes = vol.contactNotes
  }
  if (skills !== undefined) result.skills = skills
  if (endorsements !== undefined) result.endorsements = endorsements
  return result
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
