import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendApplicationReceivedEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const token = String(body.token || '').trim()
  if (!token) {
    return Response.json({ detail: 'Token is required' }, { status: 400 })
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    include: { volunteer: { select: { id: true, name: true, email: true, emailConfirmed: true } } },
  })

  if (!record) {
    return Response.json({ detail: 'Invalid or expired confirmation link' }, { status: 400 })
  }
  if (record.usedAt) {
    return Response.json(
      { detail: 'This confirmation link has already been used' },
      { status: 400 },
    )
  }
  if (record.expiresAt < new Date()) {
    return Response.json({ detail: 'This confirmation link has expired' }, { status: 400 })
  }

  const { volunteer } = record

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { emailConfirmed: true },
    }),
  ])

  if (!volunteer.emailConfirmed && volunteer.email) {
    sendApplicationReceivedEmail(volunteer.email, volunteer.name).catch((e) =>
      console.error('[VERIFY_EMAIL] Application received email failed:', e),
    )
  }

  return Response.json({ success: true })
}
