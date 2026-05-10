import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  generateAuthToken,
  checkAdminBootstrap,
  acceptPendingInvite,
} from '@/lib/auth'

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
  const password = String(body.password || '')
  if (!email || !password) {
    return Response.json({ detail: 'Invalid email or password' }, { status: 401 })
  }

  const volunteer = await prisma.volunteer.findFirst({
    where: { email, deletedAt: null },
  })

  if (!volunteer || !volunteer.passwordHash || !verifyPassword(password, volunteer.passwordHash)) {
    return Response.json({ detail: 'Invalid email or password' }, { status: 401 })
  }

  let wasPromoted = await checkAdminBootstrap(email, volunteer.id)
  const inviteAccepted = await acceptPendingInvite(email, volunteer.id)
  if (inviteAccepted) wasPromoted = true

  const authToken = generateAuthToken()
  await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { authToken, updatedAt: new Date() },
  })

  const message = wasPromoted
    ? "Login successful - you've been granted admin access!"
    : 'Login successful'

  return Response.json({ message, auth_token: authToken })
}
