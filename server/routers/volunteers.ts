import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { serializeVolunteer, serializeSkill, serializeEndorsement } from '@/lib/auth'
import { UpdateVolunteerSchema } from '@/lib/schemas'
import { publicProcedure, authedProcedure } from '../procedures'

export const volunteersRouter = {
  list: publicProcedure
    .input(
      z.object({
        skillIds: z.array(z.number().int()).optional(),
        search: z.string().optional(),
        country: z.string().optional(),
        localGroup: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const currentVolunteer = context.volunteer
      if (
        currentVolunteer &&
        currentVolunteer.approvalStatus !== 'APPROVED' &&
        !currentVolunteer.isAdmin
      ) {
        throw new ORPCError('FORBIDDEN', { message: 'Your account is pending approval' })
      }

      const where: Record<string, unknown> = {
        deletedAt: null,
        consentMakeProfileVisibleInDirectory: true,
        ...(input.skillIds && input.skillIds.length > 0
          ? { skills: { some: { skillId: { in: input.skillIds } } } }
          : {}),
        ...(input.search
          ? { OR: [{ name: { contains: input.search } }, { bio: { contains: input.search } }] }
          : {}),
        ...(input.country
          ? {
              OR: [
                { country: input.country },
                { country: null, location: { contains: input.country } },
              ],
            }
          : {}),
        ...(input.localGroup ? { localGroup: input.localGroup } : {}),
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
              orderBy: [
                { skill: { category: { sortOrder: 'asc' } } },
                { skill: { sortOrder: 'asc' } },
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        prisma.volunteer.count({ where }),
      ])

      return {
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
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const currentVolunteer = context.volunteer
      if (
        currentVolunteer &&
        currentVolunteer.approvalStatus !== 'APPROVED' &&
        !currentVolunteer.isAdmin
      ) {
        throw new ORPCError('FORBIDDEN', { message: 'Your account is pending approval' })
      }

      const vol = await prisma.volunteer.findFirst({
        where: { id: input.id, deletedAt: null, consentMakeProfileVisibleInDirectory: true },
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

      if (!vol) throw new ORPCError('NOT_FOUND', { message: 'Volunteer not found' })

      let showContact = false
      if (currentVolunteer) {
        if (currentVolunteer.id === input.id) {
          showContact = true
        } else if (currentVolunteer.isAdmin) {
          showContact = true
        } else if (
          vol.consentContactableByProjectOwners &&
          vol.consentShareContactInfoWithProjectOwner
        ) {
          showContact = true
        }
      }

      const skills = vol.skills.map(serializeSkill)
      const endorsements = vol.skillEndorsementsReceived.map(serializeEndorsement)

      const [projects, completedTasks] = await Promise.all([
        prisma.project.findMany({
          where: {
            OR: [{ ownerId: input.id }, { proposedById: input.id }],
            status: { notIn: ['archived', 'pending_review', 'needs_discussion'] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            ownerId: true,
            proposedById: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.starterTask.findMany({
          where: {
            assignedToId: input.id,
            status: { in: ['completed', 'reviewed'] },
            reviewRating: { in: ['excellent', 'good'] },
          },
          orderBy: { reviewedAt: 'desc' },
          select: {
            title: true,
            reviewRating: true,
            feedbackToVolunteer: true,
            reviewedAt: true,
            skill: { select: { name: true } },
          },
        }),
      ])

      return {
        ...serializeVolunteer(vol as unknown as Record<string, unknown>, {
          showContact,
          skills,
          endorsements,
        }),
        projects: projects.map((p) => ({
          ...p,
          role: p.ownerId === input.id ? 'owner' : 'proposer',
        })),
        completedTasks: completedTasks.map((t) => ({
          title: t.title,
          reviewRating: t.reviewRating,
          feedbackToVolunteer: t.feedbackToVolunteer,
          reviewedAt: t.reviewedAt,
          skillName: t.skill?.name ?? null,
        })),
      }
    }),

  updateMe: authedProcedure.input(UpdateVolunteerSchema).handler(async ({ input, context }) => {
    const volunteer = context.volunteer
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
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        data[field] = input[field]
      }
    }

    if (input.consentMakeProfileVisibleInDirectory !== undefined) {
      data.consentMakeProfileVisibleInDirectory = input.consentMakeProfileVisibleInDirectory
      if (input.consentMakeProfileVisibleInDirectory) data.consentGivenAt = new Date()
    }
    if (input.consentContactableByProjectOwners !== undefined) {
      data.consentContactableByProjectOwners = input.consentContactableByProjectOwners
      if (input.consentContactableByProjectOwners) data.consentGivenAt = new Date()
    }
    if (input.consentShareContactInfoWithProjectOwner !== undefined) {
      data.consentShareContactInfoWithProjectOwner = input.consentShareContactInfoWithProjectOwner
      if (input.consentShareContactInfoWithProjectOwner) data.consentGivenAt = new Date()
    }

    const skillIds = input.skillIds

    const [vol] = await prisma.$transaction(async (tx) => {
      const updated = await tx.volunteer.update({
        where: { id: volunteer.id },
        data,
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

    return serializeVolunteer(vol as unknown as Record<string, unknown>, {
      showContact: true,
      skills,
      endorsements,
    })
  }),
}
