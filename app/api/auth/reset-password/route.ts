import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.token) errs.push(fieldError('token', 'Token is required'))
  if (!body.new_password) errs.push(fieldError('new_password', 'New password is required'))
  else if (String(body.new_password).length < 8)
    errs.push(fieldError('new_password', 'New password must be at least 8 characters'))
  else if (String(body.new_password).length > 128)
    errs.push(fieldError('new_password', 'New password must be no more than 128 characters'))
  if (errs.length) return validationError(errs)

  const tokenRecord = await prisma.passwordResetToken.findFirst({
    where: {
      token: String(body.token),
      usedAt: null,
      expiresAt: { gt: new Date() },
      volunteer: { deletedAt: null },
    },
    select: { id: true, volunteerId: true },
  })

  if (!tokenRecord) {
    return Response.json({ detail: 'Invalid or expired reset token' }, { status: 400 })
  }

  const passwordHash = hashPassword(String(body.new_password))

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
