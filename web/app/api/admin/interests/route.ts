import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, serializeSkill } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const status = request.nextUrl.searchParams.get('status') ?? undefined

  const interests = await prisma.projectInterest.findMany({
    where: status ? { status } : {},
    include: {
      project: {
        select: {
          title: true,
          status: true,
          owner: { select: { name: true } },
        },
      },
      volunteer: {
        select: {
          name: true,
          email: true,
          skills: {
            include: { skill: { include: { category: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(
    interests.map(i => ({
      id: i.id,
      volunteer_id: i.volunteerId,
      project_id: i.projectId,
      interest_type: i.interestType,
      message: i.message,
      status: i.status,
      response_message: i.responseMessage,
      created_at: i.createdAt,
      responded_at: i.respondedAt,
      project_title: i.project.title,
      project_status: i.project.status,
      volunteer_name: i.volunteer.name,
      volunteer_email: i.volunteer.email,
      owner_name: i.project.owner?.name ?? null,
      volunteer_skills: i.volunteer.skills.map(serializeSkill),
    }))
  )
}
