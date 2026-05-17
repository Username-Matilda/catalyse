import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getCurrentVolunteer,
  serializeVolunteer,
  serializeSkill,
  serializeEndorsement,
} from '@/lib/auth'

export async function PUT(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const updatable = [
    'name',
    'bio',
    'discord_handle',
    'signal_number',
    'whatsapp_number',
    'contact_preference',
    'contact_notes',
    'availability_hours_per_week',
    'location',
    'country',
    'local_group',
    'other_skills',
    'email_digest',
    'application_message',
  ] as const

  const prismaFieldMap: Record<string, string> = {
    discord_handle: 'discordHandle',
    signal_number: 'signalNumber',
    whatsapp_number: 'whatsappNumber',
    contact_preference: 'contactPreference',
    contact_notes: 'contactNotes',
    availability_hours_per_week: 'availabilityHoursPerWeek',
    local_group: 'localGroup',
    other_skills: 'otherSkills',
    email_digest: 'emailDigest',
    application_message: 'applicationMessage',
  }

  const data: Record<string, unknown> = { updatedAt: new Date() }
  for (const field of updatable) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const prismaKey = prismaFieldMap[field] ?? field
      data[prismaKey] = body[field]
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'consent_make_profile_visible_in_directory')) {
    data.consentMakeProfileVisibleInDirectory = !!body.consent_make_profile_visible_in_directory
    if (body.consent_make_profile_visible_in_directory) data.consentGivenAt = new Date()
  }

  if (Object.prototype.hasOwnProperty.call(body, 'consent_contactable_by_project_owners')) {
    data.consentContactableByProjectOwners = !!body.consent_contactable_by_project_owners
    if (body.consent_contactable_by_project_owners) data.consentGivenAt = new Date()
  }

  if (Object.prototype.hasOwnProperty.call(body, 'consent_share_contact_info_with_project_owner')) {
    data.consentShareContactInfoWithProjectOwner =
      !!body.consent_share_contact_info_with_project_owner
    if (body.consent_share_contact_info_with_project_owner) data.consentGivenAt = new Date()
  }

  if (Object.prototype.hasOwnProperty.call(body, 'cookie_consent_analytics')) {
    data.cookieConsentAnalytics =
      body.cookie_consent_analytics === null ? null : !!body.cookie_consent_analytics
  }

  const skillIds: number[] | undefined = Array.isArray(body.skill_ids)
    ? (body.skill_ids as unknown[]).map((id) => Number(id)).filter((n) => !isNaN(n))
    : undefined

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
