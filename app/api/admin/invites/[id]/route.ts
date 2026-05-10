import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const inviteId = parseInt(idParam, 10)
  if (isNaN(inviteId)) {
    return Response.json({ detail: 'Invalid invite ID' }, { status: 400 })
  }

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const invite = await prisma.adminInvite.findFirst({
    where: { id: inviteId, status: 'pending' },
    select: { id: true },
  })

  if (!invite) {
    return Response.json({ detail: 'Invite not found or already used' }, { status: 404 })
  }

  await prisma.adminInvite.update({
    where: { id: inviteId },
    data: { status: 'revoked' },
  })

  return Response.json({ message: 'Invite revoked' })
}
