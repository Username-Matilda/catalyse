import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer, verifyPassword, hashPassword } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { ChangePasswordSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(ChangePasswordSchema, raw)
  if (!parsed.success) return parsed.response
  const { currentPassword, newPassword } = parsed.data

  const vol = await prisma.volunteer.findUnique({
    where: { id: volunteer.id },
    select: { passwordHash: true },
  })

  if (!vol?.passwordHash || !verifyPassword(currentPassword, vol.passwordHash)) {
    return Response.json({ detail: 'Current password is incorrect' }, { status: 400 })
  }

  await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { passwordHash: hashPassword(newPassword), updatedAt: new Date() },
  })

  return Response.json({ message: 'Password changed successfully' })
}
