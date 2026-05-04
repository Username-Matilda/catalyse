import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  generateAuthToken, checkAdminBootstrap, acceptPendingInvite,
} from '@/lib/auth'
import { sendWelcomeEmail } from '@/lib/email'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID

async function verifyGoogleToken(credential: string) {
  if (!GOOGLE_CLIENT_ID) return null
  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    )
    if (!resp.ok) return null
    const data = await resp.json() as Record<string, string>
    if (data.aud !== GOOGLE_CLIENT_ID) {
      console.log(`[GOOGLE_AUTH] Token audience mismatch: ${data.aud}`)
      return null
    }
    if (data.email_verified !== 'true') {
      console.log(`[GOOGLE_AUTH] Email not verified: ${data.email}`)
      return null
    }
    return {
      email: data.email,
      name: data.name || data.email.split('@')[0],
      googleId: data.sub,
      picture: data.picture,
    }
  } catch (e) {
    console.error('[GOOGLE_AUTH] Token verification failed:', e)
    return null
  }
}

export async function POST(request: NextRequest) {
  if (!GOOGLE_CLIENT_ID) {
    return Response.json({ detail: 'Google Sign-In is not configured' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const googleUser = await verifyGoogleToken(String(body.credential || ''))
  if (!googleUser) {
    return Response.json({ detail: 'Invalid Google token' }, { status: 401 })
  }

  const { email, name } = googleUser
  const existing = await prisma.volunteer.findFirst({
    where: { email, deletedAt: null },
  })

  if (existing) {
    const authToken = generateAuthToken()
    await prisma.volunteer.update({
      where: { id: existing.id },
      data: { authToken, updatedAt: new Date() },
    })

    let wasPromoted = await checkAdminBootstrap(email, existing.id)
    const inviteAccepted = await acceptPendingInvite(email, existing.id)
    if (inviteAccepted) wasPromoted = true

    const message = wasPromoted
      ? "Login successful - you've been granted admin access!"
      : 'Login successful'
    return Response.json({ message, auth_token: authToken })
  }

  // New user
  const authToken = generateAuthToken()
  const volunteer = await prisma.volunteer.create({
    data: {
      name, email, authToken,
      consentProfileVisible: true,
      consentContactByOwners: true,
      consentGivenAt: new Date(),
    },
  })

  try {
    await checkAdminBootstrap(email, volunteer.id)
  } catch (e) {
    console.error('[GOOGLE_SIGNUP ERROR] admin bootstrap failed:', e)
    return Response.json(
      { detail: 'Something went wrong creating your account. Please try again or contact us. Error Code: C' },
      { status: 500 }
    )
  }
  try {
    await acceptPendingInvite(email, volunteer.id)
  } catch (e) {
    console.error('[GOOGLE_SIGNUP ERROR] admin invite check failed:', e)
    return Response.json(
      { detail: 'Something went wrong creating your account. Please try again or contact us. Error Code: D' },
      { status: 500 }
    )
  }

  sendWelcomeEmail(email, name).catch(e => console.error('[GOOGLE_SIGNUP] Welcome email failed:', e))

  return Response.json({ auth_token: authToken, message: 'Welcome to Catalyse!', is_new_user: true })
}
