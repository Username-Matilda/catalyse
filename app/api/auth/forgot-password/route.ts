import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateAuthToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const { allowed, retryAfterMs } = checkRateLimit(
    request,
    'forgot-password',
    { limit: 5, windowMs: 15 * 60 * 1000 },
  )
  if (!allowed) return rateLimitResponse(retryAfterMs)
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const email = String(body.email || '')
    .toLowerCase()
    .trim()
  const volunteer = await prisma.volunteer.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, name: true, email: true },
  })

  // Always return success to prevent email enumeration
  const successMsg = "If an account exists with this email, you'll receive a reset link."

  if (!volunteer || !volunteer.email) {
    return Response.json({ message: successMsg })
  }

  const resetToken = generateAuthToken()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Invalidate existing tokens
  await prisma.passwordResetToken.updateMany({
    where: { volunteerId: volunteer.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  await prisma.passwordResetToken.create({
    data: { volunteerId: volunteer.id, token: resetToken, expiresAt },
  })

  await sendPasswordResetEmail(volunteer.email, resetToken, volunteer.name)

  const result: Record<string, unknown> = { message: successMsg }

  if (process.env.NODE_ENV !== 'production') {
    result._dev_reset_token = resetToken
    result._dev_reset_url = `/reset-password?token=${resetToken}`
    result._dev_note = 'Dev mode. Set RESEND_API_KEY to enable real emails.'
  }

  return Response.json(result)
}
