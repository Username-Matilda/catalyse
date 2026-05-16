import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendAdminInviteEmail } from '@/lib/email'
import { fieldError, validationError } from '@/lib/errors'
import { randomBytes } from 'node:crypto'

const APP_URL = process.env.APP_URL!

export async function POST(request: NextRequest) {
  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
    errs.push(fieldError('email', 'A valid email address is required'))
  }
  if (errs.length) return validationError(errs)

  const email = (body.email as string).trim().toLowerCase()

  const existing = await prisma.volunteer.findFirst({
    where: { email, isAdmin: true },
    select: { id: true },
  })
  if (existing) {
    return Response.json({ detail: 'This person is already an admin' }, { status: 400 })
  }

  const now = new Date()
  const pending = await prisma.adminInvite.findFirst({
    where: {
      email,
      status: 'pending',
      expiresAt: { gt: now },
    },
    select: { id: true },
  })
  if (pending) {
    return Response.json({ detail: 'An invite is already pending for this email' }, { status: 400 })
  }

  const inviteToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await prisma.adminInvite.create({
    data: {
      email,
      inviteToken,
      invitedById: admin.id,
      expiresAt,
    },
  })

  const emailSent = await sendAdminInviteEmail(email, inviteToken, admin.name)

  const result: Record<string, unknown> = {
    message: `Invite ${emailSent ? 'sent' : 'created'} for ${email}`,
    expires_at: expiresAt.toISOString(),
  }

  if (process.env.NODE_ENV !== 'production') {
    result._dev_invite_token = inviteToken
    result._dev_invite_url = `${APP_URL}/accept-invite?token=${inviteToken}`
    result._dev_note = 'Dev mode. Share link manually.'
  }

  return Response.json(result)
}
