import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { serializeVolunteer, serializeSkill, serializeEndorsement } from '@/lib/auth'
import { adminProcedure } from '../../procedures'

const EndorsementInputSchema = z.object({
  skillId: z.number().int({ message: 'skillId is required' }),
  rating: z.string().optional().default('verified'),
  source: z.string().optional().default('direct_observation'),
  sourceId: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const adminVolunteersRouter = {
  getById: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const vol = await prisma.volunteer.findUnique({
      where: { id: input.id },
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

    if (!vol) throw new ORPCError('NOT_FOUND', { message: 'Volunteer not found' })

    const [adminNotes, endorsements, starterTasks, projectHistory] = await Promise.all([
      prisma.adminNote.findMany({
        where: { volunteerId: input.id },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.skillEndorsement.findMany({
        where: { volunteerId: input.id },
        include: {
          skill: { include: { category: true } },
          endorsedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.starterTask.findMany({
        where: { assignedToId: input.id },
        include: { skill: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.project.findMany({
        where: { OR: [{ ownerId: input.id }, { proposedById: input.id }] },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const skills = vol.skills.map(serializeSkill)
    const publicEndorsements = vol.skillEndorsementsReceived.map(serializeEndorsement)

    return {
      ...serializeVolunteer(vol, {
        showContact: true,
        skills,
        endorsements: publicEndorsements,
      }),
      adminNotes: adminNotes.map((n) => ({
        id: n.id,
        volunteerId: n.volunteerId,
        authorId: n.authorId,
        content: n.content,
        category: n.category,
        relatedProjectId: n.relatedProjectId,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        authorName: n.author.name,
      })),
      endorsements: endorsements.map((e) => ({
        id: e.id,
        volunteerId: e.volunteerId,
        skillId: e.skillId,
        endorsedById: e.endorsedById,
        source: e.source,
        sourceId: e.sourceId,
        rating: e.rating,
        notes: e.notes,
        createdAt: e.createdAt,
        skillName: e.skill.name,
        skillCategory: e.skill.category.name,
        endorsedByName: e.endorsedBy.name,
      })),
      starterTasks: starterTasks.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        title: t.title,
        description: t.description,
        skillId: t.skillId,
        assignedToId: t.assignedToId,
        assignedById: t.assignedById,
        status: t.status,
        reviewRating: t.reviewRating,
        reviewNotes: t.reviewNotes,
        feedbackToVolunteer: t.feedbackToVolunteer,
        reviewedById: t.reviewedById,
        reviewedAt: t.reviewedAt,
        estimatedHours: t.estimatedHours,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        skillName: t.skill?.name ?? null,
      })),
      projectHistory: projectHistory.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        ownerId: p.ownerId,
        proposedById: p.proposedById,
        outcome: p.outcome,
        outcomeNotes: p.outcomeNotes,
        completedAt: p.completedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    }
  }),

  listEndorsements: adminProcedure
    .input(z.object({ volunteerId: z.number().int() }))
    .handler(async ({ input }) => {
      const endorsements = await prisma.skillEndorsement.findMany({
        where: { volunteerId: input.volunteerId },
        include: {
          skill: { include: { category: true } },
          endorsedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return endorsements.map((e) => ({
        id: e.id,
        volunteerId: e.volunteerId,
        skillId: e.skillId,
        endorsedById: e.endorsedById,
        source: e.source,
        sourceId: e.sourceId,
        rating: e.rating,
        notes: e.notes,
        createdAt: e.createdAt,
        skillName: e.skill.name,
        skillCategory: e.skill.category.name,
        endorsedByName: e.endorsedBy.name,
      }))
    }),

  addEndorsement: adminProcedure
    .input(z.object({ volunteerId: z.number().int() }).merge(EndorsementInputSchema))
    .handler(async ({ input, context }) => {
      const { skillId, rating, source, sourceId, notes } = input
      await prisma.skillEndorsement.upsert({
        where: {
          volunteerId_skillId_endorsedById: {
            volunteerId: input.volunteerId,
            skillId,
            endorsedById: context.volunteer.id,
          },
        },
        update: { rating, source, sourceId: sourceId ?? null, notes: notes ?? null },
        create: {
          volunteerId: input.volunteerId,
          skillId,
          endorsedById: context.volunteer.id,
          rating,
          source,
          sourceId: sourceId ?? null,
          notes: notes ?? null,
        },
      })
      return { message: 'Skill endorsed' }
    }),
}
