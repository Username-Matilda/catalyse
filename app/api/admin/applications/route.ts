import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, serializeSkill } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'PENDING'

  const volunteers = await prisma.volunteer.findMany({
    where: { approvalStatus: status, deletedAt: null },
    include: {
      skills: {
        include: { skill: { include: { category: true } } },
        orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return Response.json(
    volunteers.map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      bio: v.bio,
      application_message: v.applicationMessage,
      approval_status: v.approvalStatus,
      created_at: v.createdAt,
      skills: v.skills.map(serializeSkill),
    })),
  )
}
