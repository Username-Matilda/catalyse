import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { ResetPasswordSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(ResetPasswordSchema, raw)
  if (!parsed.success) return parsed.response
  const { token, newPassword } = parsed.data

  const tokenRecord = await prisma.passwordResetToken.findFirst({
    where: {
      token,
      usedAt: null,
      expiresAt: { gt: new Date() },
      volunteer: { deletedAt: null },
    },
    select: { id: true, volunteerId: true },
  })

  if (!tokenRecord) {
    return Response.json({ detail: 'Invalid or expired reset token' }, { status: 400 })
  }

  const passwordHash = hashPassword(newPassword)

  await prisma.volunteer.update({
    where: { id: tokenRecord.volunteerId },
    data: { passwordHash, authToken: null, updatedAt: new Date() },
  })
  await prisma.passwordResetToken.update({
    where: { id: tokenRecord.id },
    data: { usedAt: new Date() },
  })

  return Response.json({
    message: 'Password reset successful. Please log in with your new password.',
  })
}
