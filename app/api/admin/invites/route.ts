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
    invites.map(i => ({
      id: i.id,
      email: i.email,
      invite_token: i.inviteToken,
      invited_by_id: i.invitedById,
      status: i.status,
      accepted_by_id: i.acceptedById,
      accepted_at: i.acceptedAt,
      expires_at: i.expiresAt,
      created_at: i.createdAt,
      invited_by_name: i.invitedBy.name,
    }))
  )
}
