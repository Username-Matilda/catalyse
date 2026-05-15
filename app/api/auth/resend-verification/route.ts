import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendWelcomeAndConfirmEmail } from '@/lib/email'

const STUB_EMAIL = ['1', 'true', 'yes'].includes((process.env.STUB_EMAIL ?? '').toLowerCase())
const OK_MESSAGE = 'If that email is registered and unconfirmed, a new link has been sent.'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const email = String(body.email || '')
    .toLowerCase()
    .trim()
  if (!email) return Response.json({ detail: OK_MESSAGE })

  const volunteer = await prisma.volunteer.findFirst({
    where: { email, emailConfirmed: false, deletedAt: null },
    select: { id: true, name: true, email: true },
  })

  if (!volunteer || !volunteer.email) return Response.json({ detail: OK_MESSAGE })

  await prisma.emailVerificationToken.updateMany({
    where: { volunteerId: volunteer.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  const verificationToken = await prisma.emailVerificationToken.create({
    data: {
      volunteerId: volunteer.id,
      token: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  sendWelcomeAndConfirmEmail(volunteer.email, verificationToken.token, volunteer.name).catch((e) =>
    console.error('[RESEND_VERIFICATION] Email failed:', e),
  )

  const response: Record<string, unknown> = { detail: OK_MESSAGE }
  if (STUB_EMAIL) response.email_verification_token = verificationToken.token
  return Response.json(response)
}
