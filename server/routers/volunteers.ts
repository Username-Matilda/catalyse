import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { redactVolunteer } from '@/lib/auth'
import { UpdateVolunteerSchema } from '@/lib/schemas'
import { approvedProcedure, authedProcedure } from '../procedures'
import {
  ApprovalStatus,
  InterestStatus,
  ProjectStatus,
  QuickTaskStatus,
  WorkItemType,
} from '@/generated/prisma/enums'

export const volunteersRouter = {
  list: approvedProcedure
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
      // Any flavour of admin (full admin or technical admin, which includes super
      // admins since those always carry isAdmin) may see profiles hidden from the
      // public directory.
      const isAdmin = Boolean(currentVolunteer.isAdmin || currentVolunteer.isTechnicalAdmin)

      const where: Record<string, unknown> = {
        deletedAt: null,
        ...(isAdmin ? {} : { consentMakeProfileVisibleInDirectory: true }),
        approvalStatus: ApprovalStatus.approved,
        ...(input.skillIds && input.skillIds.length > 0
          ? { skills: { some: { skillId: { in: input.skillIds } } } }
          : {}),
        AND: [
          ...(input.search
            ? [{ OR: [{ name: { contains: input.search } }, { bio: { contains: input.search } }] }]
            : []),
          ...(input.country
            ? [
                {
                  OR: [
                    { country: input.country },
                    { country: null, location: { contains: input.country } },
                  ],
                },
              ]
            : []),
          ...(input.localGroup
            ? [
                {
                  OR: [
                    { localGroup: input.localGroup },
                    { localGroup: null, location: { contains: input.localGroup } },
                  ],
                },
              ]
            : []),
        ],
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
            consentMakeProfileVisibleInDirectory: true,
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
          hiddenFromDirectory: isAdmin ? !v.consentMakeProfileVisibleInDirectory : false,
          skills: v.skills.map((vs) => ({
            id: vs.skill.id,
            categoryId: vs.skill.categoryId,
            name: vs.skill.name,
            description: vs.skill.description,
            sortOrder: vs.skill.sortOrder,
            createdAt: vs.skill.createdAt,
            categoryName: vs.skill.category.name,
            proficiencyLevel: vs.proficiencyLevel,
          })),
        })),
        total,
      }
    }),

  getById: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const currentVolunteer = context.volunteer
      const isAdmin = Boolean(currentVolunteer.isAdmin || currentVolunteer.isTechnicalAdmin)

      const vol = await prisma.volunteer.findFirst({
        where: { id: input.id, deletedAt: null },
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

      // A profile hidden from the public directory is still visible to:
      //  - the volunteer themselves
      //  - any admin (full or technical; super admins always carry isAdmin)
      //  - an owner of a project this volunteer is involved in, so they can assess
      //    the volunteer's skills — including before accepting them. "Involved in" =
      //    holds a task under that project, or has a live (non-declined,
      //    non-withdrawn) interest in it.
      if (!vol.consentMakeProfileVisibleInDirectory && !isAdmin && currentVolunteer.id !== vol.id) {
        const ownedProjectLink = await prisma.workItem.count({
          where: {
            type: WorkItemType.PROJECT,
            assigneeId: currentVolunteer.id,
            OR: [
              { children: { some: { type: WorkItemType.TASK, assigneeId: vol.id } } },
              {
                interests: {
                  some: {
                    volunteerId: vol.id,
                    status: { notIn: [InterestStatus.declined, InterestStatus.withdrawn] },
                  },
                },
              },
            ],
          },
        })
        if (ownedProjectLink === 0) {
          throw new ORPCError('NOT_FOUND', { message: 'Volunteer not found' })
        }
      }

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

      const skills = vol.skills.map((vs) => ({
        id: vs.skill.id,
        categoryId: vs.skill.categoryId,
        name: vs.skill.name,
        description: vs.skill.description,
        sortOrder: vs.skill.sortOrder,
        createdAt: vs.skill.createdAt,
        categoryName: vs.skill.category.name,
        proficiencyLevel: vs.proficiencyLevel,
      }))
      const endorsements = vol.skillEndorsementsReceived.map((se) => ({
        skillId: se.skillId,
        rating: se.rating,
        skillName: se.skill.name,
      }))

      const [projects, completedTasks] = await Promise.all([
        prisma.workItem.findMany({
          where: {
            type: WorkItemType.PROJECT,
            OR: [{ assigneeId: input.id }, { creatorId: input.id }],
            status: {
              notIn: [
                ProjectStatus.archived,
                ProjectStatus.pending_review,
                ProjectStatus.needs_discussion,
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            assigneeId: true,
            creatorId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.workItem.findMany({
          where: {
            type: WorkItemType.QUICK_TASK,
            assigneeId: input.id,
            status: QuickTaskStatus.completed,
            reviewRating: { in: ['excellent', 'good'] },
          },
          orderBy: { reviewedAt: 'desc' },
          select: {
            title: true,
            reviewRating: true,
            reviewedAt: true,
            skill: { select: { name: true } },
          },
        }),
      ])

      return {
        ...redactVolunteer(vol, {
          showContact,
          skills,
          endorsements,
        }),
        projects: projects.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          status: p.status,
          ownerId: p.assigneeId,
          proposedById: p.creatorId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          role: p.assigneeId === input.id ? 'owner' : 'proposer',
        })),
        completedTasks: completedTasks.map((t) => ({
          title: t.title,
          reviewRating: t.reviewRating,
          reviewedAt: t.reviewedAt,
          skillName: t.skill?.name ?? null,
        })),
      }
    }),

  myApplication: authedProcedure.handler(async ({ context }) => {
    const volunteer = context.volunteer
    return {
      approvalStatus: volunteer.approvalStatus,
      applicationMessage: volunteer.applicationMessage,
      applicationApplicantNotes: volunteer.applicationApplicantNotes,
    }
  }),

  resubmitApplication: authedProcedure.handler(async ({ context }) => {
    const volunteer = context.volunteer
    if (
      volunteer.approvalStatus !== ApprovalStatus.pending &&
      volunteer.approvalStatus !== ApprovalStatus.needs_info
    ) {
      throw new ORPCError('BAD_REQUEST', {
        message: `Cannot resubmit a ${volunteer.approvalStatus} application`,
      })
    }
    await prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { approvalStatus: ApprovalStatus.under_review, updatedAt: new Date() },
    })
    return { message: 'Application resubmitted for review' }
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
      'notifyRemoteProjects',
      'applicationMessage',
    ] as const
    for (const field of scalarFields) {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        data[field] = input[field]
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'location') ||
      Object.prototype.hasOwnProperty.call(input, 'country') ||
      Object.prototype.hasOwnProperty.call(input, 'localGroup')
    ) {
      data.locationConfirmedAt = new Date()
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
    if (Object.prototype.hasOwnProperty.call(input, 'cookieConsentAnalytics')) {
      data.cookieConsentAnalytics = input.cookieConsentAnalytics ?? null
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

    const skills = vol.skills.map((vs) => ({
      id: vs.skill.id,
      categoryId: vs.skill.categoryId,
      name: vs.skill.name,
      description: vs.skill.description,
      sortOrder: vs.skill.sortOrder,
      createdAt: vs.skill.createdAt,
      categoryName: vs.skill.category.name,
      proficiencyLevel: vs.proficiencyLevel,
    }))
    const endorsements = vol.skillEndorsementsReceived.map((se) => ({
      skillId: se.skillId,
      rating: se.rating,
      skillName: se.skill.name,
    }))

    return redactVolunteer(vol, {
      showContact: true,
      skills,
      endorsements,
    })
  }),
}
