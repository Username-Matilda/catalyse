import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getCurrentVolunteer,
  serializeVolunteer,
  serializeSkill,
  serializeEndorsement,
} from '@/lib/auth'

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const vol = await prisma.volunteer.findUnique({
    where: { id: volunteer.id },
    include: {
      skills: {
        include: { skill: { include: { category: true } } },
        orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
      },
      skillEndorsementsReceived: {
        include: { skill: true },
      },
    },
  })

  if (!vol) return Response.json({ detail: 'Not found' }, { status: 404 })

  const skills = vol.skills.map(serializeSkill)
  const endorsements = vol.skillEndorsementsReceived.map(serializeEndorsement)

  return Response.json(
    serializeVolunteer(vol as unknown as Record<string, unknown>, {
      showContact: true,
      skills,
      endorsements,
    }),
  )
}
