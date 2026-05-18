import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const invites = await prisma.adminInvite.findMany({
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(
    invites.map((i) => ({
      id: i.id,
      email: i.email,
      inviteToken: i.inviteToken,
      invitedById: i.invitedById,
      status: i.status,
      acceptedById: i.acceptedById,
      acceptedAt: i.acceptedAt,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      invitedByName: i.invitedBy.name,
    })),
  )
}
