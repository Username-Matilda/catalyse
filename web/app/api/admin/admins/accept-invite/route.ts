import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) return Response.json({ detail: 'Authentication required' }, { status: 401 })

  const inviteToken = request.nextUrl.searchParams.get('invite_token')
  if (!inviteToken) {
    return Response.json({ detail: 'invite_token is required' }, { status: 400 })
  }

  const now = new Date()
  const invite = await prisma.adminInvite.findFirst({
    where: {
      inviteToken,
      status: 'pending',
      expiresAt: { gt: now },
    },
  })

  if (!invite) {
    return Response.json({ detail: 'Invalid or expired invite' }, { status: 404 })
  }

  if (invite.email.toLowerCase() !== (volunteer.email ?? '').toLowerCase()) {
    return Response.json({ detail: 'This invite is for a different email address' }, { status: 403 })
  }

  await prisma.$transaction([
    prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { isAdmin: true },
    }),
    prisma.adminInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted', acceptedById: volunteer.id, acceptedAt: new Date() },
    }),
  ])

  return Response.json({ message: 'You are now an admin!' })
}
