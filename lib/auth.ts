import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'crypto'
import type { Volunteer } from '@/generated/prisma/client'
import { prisma } from './prisma'
import { env } from './env'
import { ApprovalStatus, InviteStatus } from '@/generated/prisma/enums'

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

// Sessions expire 30 days after the token was issued. Every write of `authToken`
// must set `authTokenExpiresAt` alongside it — a null expiry means "never expires",
// which is what getCurrentVolunteer falls back to for pre-existing rows.
export const AUTH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function authTokenExpiry(): Date {
  return new Date(Date.now() + AUTH_TOKEN_TTL_MS)
}

export function extractToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization
}

// Session tokens are stored hashed (see #225 / #224): a DB or backup leak hands over
// ciphertext, not live sessions. The raw token only ever exists in the Authorization
// header and the client's localStorage.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(volunteerId: number): Promise<string> {
  const token = generateAuthToken()
  await prisma.session.create({
    data: { volunteerId, tokenHash: hashToken(token), expiresAt: authTokenExpiry() },
  })
  return token
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

// "Sign out everywhere" / password change / account deletion.
export async function deleteAllSessions(volunteerId: number): Promise<void> {
  await prisma.session.deleteMany({ where: { volunteerId } })
}

// "Sign out of all other devices" — keeps the session the request came in on.
export async function deleteOtherSessions(
  volunteerId: number,
  currentToken: string,
): Promise<void> {
  await prisma.session.deleteMany({
    where: { volunteerId, tokenHash: { not: hashToken(currentToken) } },
  })
}

export async function getCurrentVolunteer(authorization: string | null | undefined) {
  const token = extractToken(authorization)
  if (!token) return null

  const session = await prisma.session.findFirst({
    where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
    include: { volunteer: true },
  })
  if (session) {
    if (session.volunteer.deletedAt) return null
    // Fire-and-forget: a failed lastUsedAt touch shouldn't fail the request it came with.
    prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})
    return session.volunteer
  }

  // Legacy fallback: a session opened before #225, still living on the old single-token
  // columns. Lazily promote it into a real (hashed) Session row so it keeps working
  // without forcing a re-login, then never touch the legacy columns again — new logins
  // no longer write to them, so this path stops firing once those tokens expire.
  const legacyVolunteer = await prisma.volunteer.findFirst({
    where: { authToken: token, deletedAt: null, authTokenExpiresAt: { gt: new Date() } },
  })
  if (!legacyVolunteer) return null
  await prisma.session
    .create({
      data: {
        volunteerId: legacyVolunteer.id,
        tokenHash: hashToken(token),
        expiresAt: legacyVolunteer.authTokenExpiresAt as Date,
      },
    })
    .catch(() => {})
  return legacyVolunteer
}

// showContact controls whether email and direct contact fields are included.
export function redactVolunteer(
  vol: Volunteer,
  opts: {
    showContact?: boolean
    skills?: Array<{
      id: number
      categoryId: number
      name: string
      description: string | null
      sortOrder: number | null
      createdAt: Date | null
      categoryName: string
      proficiencyLevel: string | null
    }>
    endorsements?: Array<{ skillId: number; rating: string | null; skillName: string }>
  } = {},
) {
  const { showContact = false, skills, endorsements } = opts
  return {
    id: vol.id,
    name: vol.name,
    bio: vol.bio,
    location: vol.location,
    country: vol.country,
    localGroup: vol.localGroup,
    locationConfirmedAt: vol.locationConfirmedAt,
    availabilityHoursPerWeek: vol.availabilityHoursPerWeek,
    otherSkills: vol.otherSkills,
    consentMakeProfileVisibleInDirectory: vol.consentMakeProfileVisibleInDirectory,
    consentContactableByProjectOwners: vol.consentContactableByProjectOwners,
    consentShareContactInfoWithProjectOwner: vol.consentShareContactInfoWithProjectOwner,
    consentGivenAt: vol.consentGivenAt,
    cookieConsentAnalytics: vol.cookieConsentAnalytics ?? null,
    isAdmin: vol.isAdmin,
    isSuperAdmin: isSuperAdmin(vol.email),
    approvalStatus: vol.approvalStatus,
    emailConfirmed: vol.emailConfirmed,
    emailDigest: vol.emailDigest,
    notifyRemoteProjects: vol.notifyRemoteProjects,
    hasPassword: Boolean(vol.passwordHash),
    createdAt: vol.createdAt,
    updatedAt: vol.updatedAt,
    deletedAt: vol.deletedAt,
    email: showContact ? vol.email : undefined,
    discordHandle: showContact ? vol.discordHandle : undefined,
    signalNumber: showContact ? vol.signalNumber : undefined,
    whatsappNumber: showContact ? vol.whatsappNumber : undefined,
    contactPreference: showContact ? vol.contactPreference : undefined,
    contactNotes: showContact ? vol.contactNotes : undefined,
    skills,
    endorsements,
  }
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
  const adminEmails = env.ADMIN_EMAILS
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
  const adminEmails = env.ADMIN_EMAILS
  if (!adminEmails) return false
  const allowed = adminEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allowed.includes(email.toLowerCase())) return false
  await prisma.volunteer.updateMany({
    where: { id: volunteerId, isAdmin: false },
    data: { isAdmin: true, approvalStatus: ApprovalStatus.approved, emailConfirmed: true },
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
    data: { isAdmin: true, approvalStatus: ApprovalStatus.approved, emailConfirmed: true },
  })
  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: { status: InviteStatus.accepted, acceptedById: volunteerId, acceptedAt: new Date() },
  })
  return true
}
