import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const targetId = parseInt(idParam, 10)
  if (isNaN(targetId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  if (targetId === admin.id) {
    return Response.json({ detail: 'You cannot revoke your own admin access' }, { status: 400 })
  }

  const target = await prisma.volunteer.findFirst({
    where: { id: targetId, isAdmin: true },
    select: { id: true, name: true },
  })

  if (!target) {
    return Response.json({ detail: 'Admin not found' }, { status: 404 })
  }

  await prisma.volunteer.update({ where: { id: targetId }, data: { isAdmin: false } })

  return Response.json({ message: `Admin access revoked for ${target.name}` })
}
