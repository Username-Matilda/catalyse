import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  hashPassword,
  generateAuthToken,
  checkAdminBootstrap,
  acceptPendingInvite,
} from '@/lib/auth'
import { sendWelcomeEmail, sendWelcomeAndConfirmEmail } from '@/lib/email'
import { parseBody } from '@/lib/errors'
import { SignupSchema } from '@/lib/schemas'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const { allowed, retryAfterMs } = checkRateLimit(request, 'signup', {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (!allowed) return rateLimitResponse(retryAfterMs)
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(SignupSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const email = body.email.toLowerCase().trim()
  const name = body.name
  const password = body.password

  const existing = await prisma.volunteer.findFirst({
    where: { email },
    select: { id: true, deletedAt: true },
  })

  if (existing) {
    if (existing.deletedAt) {
      return Response.json(
        { detail: 'This email was previously registered. Contact us to restore your account.' },
        { status: 400 },
      )
    }
    return Response.json({ detail: 'Email already registered' }, { status: 400 })
  }

  const authToken = generateAuthToken()
  const passwordHash = hashPassword(password)

  const volunteer = await prisma.volunteer.create({
    data: {
      name,
      email,
      passwordHash,
      authToken,
      applicationMessage: body.applicationMessage ?? null,
      bio: body.bio ?? null,
      discordHandle: body.discordHandle ?? null,
      signalNumber: body.signalNumber ?? null,
      whatsappNumber: body.whatsappNumber ?? null,
      contactPreference: body.contactPreference ?? null,
      contactNotes: body.contactNotes ?? null,
      availabilityHoursPerWeek: body.availabilityHoursPerWeek ?? null,
      location: body.location ?? null,
      country: body.country ?? null,
      localGroup: body.localGroup ?? null,
      otherSkills: body.otherSkills ?? null,
      consentMakeProfileVisibleInDirectory: body.consentMakeProfileVisibleInDirectory ?? true,
      consentContactableByProjectOwners: body.consentContactableByProjectOwners ?? true,
      consentShareContactInfoWithProjectOwner:
        body.consentShareContactInfoWithProjectOwner ?? false,
      consentGivenAt: new Date(),
      emailDigest: body.emailDigest ?? 'none',
    },
  })

  // Add skills
  const skillIds = body.skillIds ?? []
  for (const skillId of skillIds) {
    await prisma.volunteerSkill.upsert({
      where: { volunteerId_skillId: { volunteerId: volunteer.id, skillId } },
      create: { volunteerId: volunteer.id, skillId },
      update: {},
    })
  }

  const wasBootstrapped = await checkAdminBootstrap(email, volunteer.id).catch((e) => {
    console.error('[SIGNUP ERROR] admin bootstrap failed:', e)
    return false
  })
  const wasInvited = await acceptPendingInvite(email, volunteer.id).catch((e) => {
    console.error('[SIGNUP ERROR] admin invite check failed:', e)
    return false
  })

  const platformSettings = await prisma.platformSettings
    .upsert({
      where: { id: 1 },
      create: { id: 1, requireApplicationApproval: true },
      update: {},
    })
    .catch((e) => {
      console.error('[SIGNUP ERROR] platform settings fetch failed:', e)
      return { requireApplicationApproval: true }
    })

  let emailVerificationToken: string | undefined
  if (wasBootstrapped || wasInvited) {
    sendWelcomeEmail({ to: email, name }).catch((e) =>
      console.error('[SIGNUP] Welcome email failed:', e),
    )
  } else if (!platformSettings.requireApplicationApproval) {
    await prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { approvalStatus: 'APPROVED' },
    })
    const verificationToken = await prisma.emailVerificationToken.create({
      data: {
        volunteerId: volunteer.id,
        token: (await import('crypto')).randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })
    emailVerificationToken = verificationToken.token
    sendWelcomeAndConfirmEmail({ to: email, token: verificationToken.token, name }).catch((e) =>
      console.error('[SIGNUP] Email confirmation send failed:', e),
    )
  } else {
    const verificationToken = await prisma.emailVerificationToken.create({
      data: {
        volunteerId: volunteer.id,
        token: (await import('crypto')).randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })
    emailVerificationToken = verificationToken.token
    sendWelcomeAndConfirmEmail({ to: email, token: verificationToken.token, name }).catch((e) =>
      console.error('[SIGNUP] Email confirmation send failed:', e),
    )
  }

  const isApproved = wasBootstrapped || wasInvited || !platformSettings.requireApplicationApproval

  const response: Record<string, unknown> = {
    id: volunteer.id,
    auth_token: authToken,
    pending: !isApproved,
  }
  const stubEmail = ['1', 'true', 'yes'].includes((process.env.STUB_EMAIL ?? '').toLowerCase())
  if (stubEmail && emailVerificationToken) {
    response.email_verification_token = emailVerificationToken
  }
  return Response.json(response)
}
