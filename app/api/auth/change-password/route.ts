import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer, verifyPassword, hashPassword } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.current_password)
    errs.push(fieldError('current_password', 'Current password is required'))
  if (!body.new_password) errs.push(fieldError('new_password', 'New password is required'))
  else if (String(body.new_password).length < 8)
    errs.push(fieldError('new_password', 'New password must be at least 8 characters'))
  else if (String(body.new_password).length > 128)
    errs.push(fieldError('new_password', 'New password must be no more than 128 characters'))
  if (errs.length) return validationError(errs)

  const vol = await prisma.volunteer.findUnique({
    where: { id: volunteer.id },
    select: { passwordHash: true },
  })

  if (!vol?.passwordHash || !verifyPassword(String(body.current_password), vol.passwordHash)) {
    return Response.json({ detail: 'Current password is incorrect' }, { status: 400 })
  }

  await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { passwordHash: hashPassword(String(body.new_password)), updatedAt: new Date() },
  })

  return Response.json({ message: 'Password changed successfully' })
}
