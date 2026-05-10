import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const admins = await prisma.volunteer.findMany({
    where: { isAdmin: true, deletedAt: null },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { name: 'asc' },
  })

  return Response.json(
    admins.map(a => ({
      id: a.id,
      name: a.name,
      email: a.email,
      created_at: a.createdAt,
    }))
  )
}
