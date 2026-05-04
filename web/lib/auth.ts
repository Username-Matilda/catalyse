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

// Convert a Prisma Volunteer to the snake_case response format the frontend expects.
// showContact controls whether email and direct contact fields are included.
export function serializeVolunteer(
  vol: Record<string, unknown>,
  opts: { showContact?: boolean; skills?: unknown[]; endorsements?: unknown[] } = {}
) {
  const { showContact = false, skills, endorsements } = opts
  const result: Record<string, unknown> = {
    id: vol.id,
    name: vol.name,
    bio: vol.bio,
    location: vol.location,
    country: vol.country,
    local_group: vol.localGroup,
    availability_hours_per_week: vol.availabilityHoursPerWeek,
    share_contact_directly: vol.shareContactDirectly,
    profile_visible: vol.profileVisible,
    other_skills: vol.otherSkills,
    consent_profile_visible: vol.consentProfileVisible,
    consent_contact_by_owners: vol.consentContactByOwners,
    consent_given_at: vol.consentGivenAt,
    is_admin: vol.isAdmin,
    email_digest: vol.emailDigest,
    created_at: vol.createdAt,
    updated_at: vol.updatedAt,
    deleted_at: vol.deletedAt,
  }
  if (showContact) {
    result.email = vol.email
    result.discord_handle = vol.discordHandle
    result.signal_number = vol.signalNumber
    result.whatsapp_number = vol.whatsappNumber
    result.contact_preference = vol.contactPreference
    result.contact_notes = vol.contactNotes
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
    category_id: vs.skill.categoryId,
    name: vs.skill.name,
    description: vs.skill.description,
    sort_order: vs.skill.sortOrder,
    created_at: vs.skill.createdAt,
    category_name: vs.skill.category.name,
    proficiency_level: vs.proficiencyLevel,
  }
}

export function serializeEndorsement(se: {
  skillId: number
  rating: string | null
  skill: { name: string }
}) {
  return { skill_id: se.skillId, rating: se.rating, skill_name: se.skill.name }
}

export async function requireAdmin(
  authorization: string | null | undefined
): Promise<{ volunteer: NonNullable<Awaited<ReturnType<typeof getCurrentVolunteer>>>; error: null } | { volunteer: null; error: Response }> {
  const volunteer = await getCurrentVolunteer(authorization)
  if (!volunteer) {
    return { volunteer: null, error: Response.json({ detail: 'Authentication required' }, { status: 401 }) }
  }
  if (!volunteer.isAdmin) {
    return { volunteer: null, error: Response.json({ detail: 'Admin access required' }, { status: 403 }) }
  }
  return { volunteer, error: null }
}

// Promote volunteer to admin if their email is in ADMIN_EMAILS env var
export async function checkAdminBootstrap(email: string, volunteerId: number): Promise<boolean> {
  const adminEmails = process.env.ADMIN_EMAILS || ''
  if (!adminEmails) return false
  const allowed = adminEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (!allowed.includes(email.toLowerCase())) return false
  await prisma.volunteer.updateMany({
    where: { id: volunteerId, isAdmin: false },
    data: { isAdmin: true },
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
  await prisma.volunteer.update({ where: { id: volunteerId }, data: { isAdmin: true } })
  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: { status: 'accepted', acceptedById: volunteerId, acceptedAt: new Date() },
  })
  return true
}
