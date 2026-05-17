import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendAdminInviteEmail } from '@/lib/email'
import { parseBody } from '@/lib/errors'
import { InviteAdminSchema } from '@/lib/schemas'
import { randomBytes } from 'node:crypto'

const APP_URL = process.env.APP_URL!
const STUB_EMAIL = ['1', 'true', 'yes'].includes((process.env.STUB_EMAIL ?? '').toLowerCase())

export async function POST(request: NextRequest) {
  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(InviteAdminSchema, raw)
  if (!parsed.success) return parsed.response

  const email = parsed.data.email.trim().toLowerCase()

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

  const emailSent = await sendAdminInviteEmail({ to: email, inviteToken, invitedBy: admin.name })

  const result: Record<string, unknown> = {
    message: `Invite ${emailSent ? 'sent' : 'created'} for ${email}`,
    expiresAt: expiresAt.toISOString(),
  }

  if (STUB_EMAIL) {
    result._dev_invite_token = inviteToken
    result._dev_invite_url = `${APP_URL}/accept-invite?token=${inviteToken}`
    result._dev_note = 'Email stubbed. Share link manually.'
  }

  return Response.json(result)
}
