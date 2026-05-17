import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getCurrentVolunteer,
  serializeVolunteer,
  serializeSkill,
  serializeEndorsement,
} from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { UpdateVolunteerSchema } from '@/lib/schemas'

export async function PUT(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(UpdateVolunteerSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const data: Record<string, unknown> = { updatedAt: new Date() }

  const scalarFields = [
    'name',
    'bio',
    'discordHandle',
    'signalNumber',
    'whatsappNumber',
    'contactPreference',
    'contactNotes',
    'availabilityHoursPerWeek',
    'location',
    'country',
    'localGroup',
    'otherSkills',
    'emailDigest',
    'applicationMessage',
  ] as const
  for (const field of scalarFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = body[field]
    }
  }

  if (body.consentMakeProfileVisibleInDirectory !== undefined) {
    data.consentMakeProfileVisibleInDirectory = body.consentMakeProfileVisibleInDirectory
    if (body.consentMakeProfileVisibleInDirectory) data.consentGivenAt = new Date()
  }

  if (body.consentContactableByProjectOwners !== undefined) {
    data.consentContactableByProjectOwners = body.consentContactableByProjectOwners
    if (body.consentContactableByProjectOwners) data.consentGivenAt = new Date()
  }

  if (body.consentShareContactInfoWithProjectOwner !== undefined) {
    data.consentShareContactInfoWithProjectOwner = body.consentShareContactInfoWithProjectOwner
    if (body.consentShareContactInfoWithProjectOwner) data.consentGivenAt = new Date()
  }

  const skillIds = body.skillIds

  const [vol] = await prisma.$transaction(async (tx) => {
    const updated = await tx.volunteer.update({
      where: { id: volunteer.id },
      data,
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

    if (skillIds !== undefined) {
      await tx.volunteerSkill.deleteMany({ where: { volunteerId: volunteer.id } })
      if (skillIds.length > 0) {
        await tx.volunteerSkill.createMany({
          data: skillIds.map((skillId) => ({ volunteerId: volunteer.id, skillId })),
        })
      }
      const fresh = await tx.volunteer.findUnique({
        where: { id: volunteer.id },
        include: {
          skills: {
            include: { skill: { include: { category: true } } },
            orderBy: [
              { skill: { category: { sortOrder: 'asc' } } },
              { skill: { sortOrder: 'asc' } },
            ],
          },
          skillEndorsementsReceived: {
            include: { skill: true },
          },
        },
      })
      return [fresh!]
    }

    return [updated]
  })

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
