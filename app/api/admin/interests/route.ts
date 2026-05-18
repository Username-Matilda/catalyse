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
    interests.map((i) => ({
      id: i.id,
      volunteerId: i.volunteerId,
      projectId: i.projectId,
      interestType: i.interestType,
      message: i.message,
      status: i.status,
      responseMessage: i.responseMessage,
      createdAt: i.createdAt,
      respondedAt: i.respondedAt,
      projectTitle: i.project.title,
      projectStatus: i.project.status,
      volunteerName: i.volunteer.name,
      volunteerEmail: i.volunteer.email,
      ownerName: i.project.owner?.name ?? null,
      volunteerSkills: i.volunteer.skills.map(serializeSkill),
    })),
  )
}
