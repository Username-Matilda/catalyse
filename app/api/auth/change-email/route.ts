import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer, verifyPassword } from '@/lib/auth'
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
  if (!body.newEmail) errs.push(fieldError('newEmail', 'New email is required'))
  if (!body.password) errs.push(fieldError('password', 'Password is required'))
  if (errs.length) return validationError(errs)

  const vol = await prisma.volunteer.findUnique({
    where: { id: volunteer.id },
    select: { passwordHash: true },
  })

  if (!vol?.passwordHash) {
    return Response.json(
      { detail: 'Cannot change email for accounts without a password. Contact an admin.' },
      { status: 400 },
    )
  }
  if (!verifyPassword(String(body.password), vol.passwordHash)) {
    return Response.json({ detail: 'Password is incorrect' }, { status: 400 })
  }

  const newEmail = String(body.newEmail).toLowerCase().trim()
  const existing = await prisma.volunteer.findFirst({
    where: { email: newEmail, id: { not: volunteer.id } },
    select: { id: true },
  })
  if (existing) {
    return Response.json(
      { detail: 'This email is already registered to another account' },
      { status: 400 },
    )
  }

  await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { email: newEmail, updatedAt: new Date() },
  })

  return Response.json({ message: 'Email changed successfully' })
}
