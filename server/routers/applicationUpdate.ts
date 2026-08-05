import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { UpdateVolunteerSchema } from '@/lib/schemas'
import { publicProcedure } from '../procedures'
import { ApprovalStatus } from '@/generated/prisma/enums'

async function loadTokenRecord(token: string) {
  const record = await prisma.applicationUpdateToken.findFirst({
    where: {
      token,
      usedAt: null,
      expiresAt: { gt: new Date() },
      volunteer: { deletedAt: null },
    },
    include: {
      volunteer: {
        include: {
          skills: { select: { skillId: true } },
        },
      },
    },
  })
  if (!record) throw new ORPCError('BAD_REQUEST', { message: 'Invalid or expired update link' })
  if (
    record.volunteer.approvalStatus !== ApprovalStatus.pending &&
    record.volunteer.approvalStatus !== ApprovalStatus.needs_info
  ) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Application is already ${record.volunteer.approvalStatus}`,
    })
  }
  return record
}

export const applicationUpdateRouter = {
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .handler(async ({ input }) => {
      const { volunteer } = await loadTokenRecord(input.token)
      return {
        name: volunteer.name,
        applicationMessage: volunteer.applicationMessage,
        applicationApplicantNotes: volunteer.applicationApplicantNotes,
        bio: volunteer.bio,
        discordHandle: volunteer.discordHandle,
        signalNumber: volunteer.signalNumber,
        whatsappNumber: volunteer.whatsappNumber,
        contactPreference: volunteer.contactPreference,
        contactNotes: volunteer.contactNotes,
        availabilityHoursPerWeek: volunteer.availabilityHoursPerWeek,
        location: volunteer.location,
        country: volunteer.country,
        localGroup: volunteer.localGroup,
        otherSkills: volunteer.otherSkills,
        skillIds: volunteer.skills.map((s) => s.skillId),
      }
    }),

  submit: publicProcedure
    .input(z.object({ token: z.string().min(1) }).merge(UpdateVolunteerSchema))
    .handler(async ({ input }) => {
      const { token, skillIds, ...fields } = input
      const record = await loadTokenRecord(token)
      const volunteerId = record.volunteerId

      const data: Record<string, unknown> = {
        updatedAt: new Date(),
        approvalStatus: ApprovalStatus.under_review,
      }
      const scalarFields = [
        'name',
        'applicationMessage',
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
      ] as const
      for (const field of scalarFields) {
        if (Object.prototype.hasOwnProperty.call(fields, field)) {
          data[field] = fields[field]
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.volunteer.update({ where: { id: volunteerId }, data })
        if (skillIds !== undefined) {
          await tx.volunteerSkill.deleteMany({ where: { volunteerId } })
          if (skillIds.length > 0) {
            await tx.volunteerSkill.createMany({
              data: skillIds.map((skillId) => ({ volunteerId, skillId })),
            })
          }
        }
        await tx.applicationUpdateToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        })
      })

      return { message: 'Application updated and resubmitted for review' }
    }),
}
