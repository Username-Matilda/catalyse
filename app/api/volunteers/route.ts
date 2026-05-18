import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeSkill, getCurrentVolunteer } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const currentVolunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (
    currentVolunteer &&
    currentVolunteer.approvalStatus !== 'APPROVED' &&
    !currentVolunteer.isAdmin
  ) {
    return Response.json({ detail: 'Your account is pending approval' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const skillIdsParam = searchParams.get('skill_ids')
  const search = searchParams.get('search')
  const country = searchParams.get('country')
  const localGroup = searchParams.get('local_group')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  const skillIds = skillIdsParam
    ? skillIdsParam
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
    : null

  const where: Record<string, unknown> = {
    deletedAt: null,
    consentMakeProfileVisibleInDirectory: true,
    ...(skillIds && skillIds.length > 0 ? { skills: { some: { skillId: { in: skillIds } } } } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { bio: { contains: search } }] } : {}),
    ...(country
      ? {
          OR: [{ country }, { country: null, location: { contains: country } }],
        }
      : {}),
    ...(localGroup ? { localGroup } : {}),
  }

  const [volunteers, total] = await Promise.all([
    prisma.volunteer.findMany({
      where,
      select: {
        id: true,
        name: true,
        bio: true,
        availabilityHoursPerWeek: true,
        location: true,
        country: true,
        otherSkills: true,
        localGroup: true,
        createdAt: true,
        skills: {
          include: { skill: { include: { category: true } } },
          orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.volunteer.count({ where }),
  ])

  return Response.json({
    volunteers: volunteers.map((v) => ({
      id: v.id,
      name: v.name,
      bio: v.bio,
      availabilityHoursPerWeek: v.availabilityHoursPerWeek,
      location: v.location,
      country: v.country,
      otherSkills: v.otherSkills,
      localGroup: v.localGroup,
      createdAt: v.createdAt,
      skills: v.skills.map(serializeSkill),
    })),
    total,
  })
}
