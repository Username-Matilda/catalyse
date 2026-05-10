import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeSkill } from '@/lib/auth'

export async function GET(request: NextRequest) {
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
    // TODO: volunteers have two overlapping location fields — `location` (freeform, older) and
    // `country` (structured, added later). Volunteers who filled in `location` before `country`
    // existed have no `country` value, so we fall back to a LIKE match on `location`. These
    // fields should be rationalised: ideally migrate existing `location` data into `country`
    // (and a separate city/region field), then drop the fallback and filter on `country` alone.
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
      availability_hours_per_week: v.availabilityHoursPerWeek,
      location: v.location,
      country: v.country,
      other_skills: v.otherSkills,
      local_group: v.localGroup,
      created_at: v.createdAt,
      skills: v.skills.map(serializeSkill),
    })),
    total,
  })
}
