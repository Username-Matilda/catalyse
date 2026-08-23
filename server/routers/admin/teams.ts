import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { createNotification, clearNotifications } from '@/lib/notify'
import { TeamBodySchema, ReviewTeamSuggestionSchema } from '@/lib/schemas'
import { adminProcedure } from '../../procedures'
import { TeamSuggestionStatus, TeamMembershipRole } from '@/generated/prisma/enums'

const NOTIFICATION_TITLES: Record<string, (name: string) => string> = {
  accepted: (n) => `Your team suggestion "${n}" was accepted`,
  merge: (n) => `Your team suggestion "${n}" has been merged`,
  on_hold: (n) => `Your team suggestion "${n}" is under review`,
  declined: (n) => `Update on your team suggestion "${n}"`,
}

export const adminTeamsRouter = {
  list: adminProcedure.handler(async () => {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: { include: { volunteer: { select: { id: true, name: true, email: true } } } },
      },
    })
    return {
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        lumaUrl: t.lumaUrl,
        docUrl: t.docUrl,
        members: t.members.map((m) => ({
          id: m.volunteer.id,
          name: m.volunteer.name,
          email: m.volunteer.email,
          role: m.role,
        })),
      })),
    }
  }),

  create: adminProcedure.input(TeamBodySchema).handler(async ({ input }) => {
    const team = await prisma.team.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        lumaUrl: input.lumaUrl ?? null,
        docUrl: input.docUrl ?? null,
      },
    })
    return { id: team.id, name: team.name }
  }),

  update: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(TeamBodySchema))
    .handler(async ({ input }) => {
      const existing = await prisma.team.findUnique({ where: { id: input.id } })
      if (!existing) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

      const team = await prisma.team.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description ?? null,
          lumaUrl: input.lumaUrl ?? null,
          docUrl: input.docUrl ?? null,
        },
      })
      return { id: team.id, name: team.name }
    }),

  delete: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const existing = await prisma.team.findUnique({ where: { id: input.id } })
    if (!existing) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

    await prisma.$transaction([
      prisma.teamSuggestion.updateMany({
        where: { mergedIntoId: input.id },
        data: { mergedIntoId: null },
      }),
      prisma.team.delete({ where: { id: input.id } }),
    ])

    return { message: 'Team deleted' }
  }),

  listSuggestions: adminProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'on_hold', 'accepted', 'declined'] as const).default('pending'),
      }),
    )
    .handler(async ({ input }) => {
      const suggestions = await prisma.teamSuggestion.findMany({
        where: { status: input.status },
        orderBy: { createdAt: 'asc' },
        include: {
          suggestedBy: { select: { id: true, name: true, email: true } },
          mergedInto: { select: { id: true, name: true } },
        },
      })

      return {
        suggestions: suggestions.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          status: s.status,
          adminNotes: s.adminNotes,
          createdAt: s.createdAt,
          suggestedBy: {
            id: s.suggestedBy.id,
            name: s.suggestedBy.name,
            email: s.suggestedBy.email,
          },
          mergedInto: s.mergedInto ? { id: s.mergedInto.id, name: s.mergedInto.name } : null,
        })),
      }
    }),

  reviewSuggestion: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(ReviewTeamSuggestionSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const suggestion = await prisma.teamSuggestion.findUnique({
        where: { id: input.id },
        include: { suggestedBy: { select: { id: true, name: true, email: true } } },
      })
      if (!suggestion) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

      const action = input.action
      const adminNotes =
        typeof input.adminNotes === 'string' ? input.adminNotes.trim() || null : null
      const now = new Date()
      const reviewBase = { reviewedById: admin.id, reviewedAt: now, updatedAt: now }

      let finalName = suggestion.name
      let notificationAction: string = action
      let targetTeamId: number | null = null

      if (action === 'accept') {
        const name = input.name?.trim() || suggestion.name
        const description = input.description?.trim() || suggestion.description
        if (!name) throw new ORPCError('BAD_REQUEST', { message: 'Name required' })

        const leaderId = input.leaderId ?? suggestion.suggestedBy.id
        const leader = await prisma.volunteer.findUnique({ where: { id: leaderId } })
        if (!leader) throw new ORPCError('BAD_REQUEST', { message: 'Leader not found' })

        finalName = name
        const [createdTeam] = await prisma.$transaction([
          prisma.team.create({ data: { name, description: description ?? null } }),
          prisma.teamSuggestion.update({
            where: { id: input.id },
            data: {
              ...reviewBase,
              status: TeamSuggestionStatus.accepted,
              name,
              description,
              adminNotes,
            },
          }),
        ])
        await prisma.teamMembership.create({
          data: {
            teamId: createdTeam.id,
            volunteerId: leaderId,
            role: TeamMembershipRole.leader,
          },
        })
        targetTeamId = createdTeam.id
        notificationAction = TeamSuggestionStatus.accepted
      } else if (action === 'merge') {
        const mergedIntoId = input.mergedIntoId ?? null
        if (!mergedIntoId) {
          throw new ORPCError('BAD_REQUEST', { message: 'mergedIntoId required for merge' })
        }
        const target = await prisma.team.findUnique({ where: { id: mergedIntoId } })
        if (!target) throw new ORPCError('NOT_FOUND', { message: 'Target team not found' })

        await prisma.$transaction([
          prisma.teamSuggestion.update({
            where: { id: input.id },
            data: {
              ...reviewBase,
              status: TeamSuggestionStatus.accepted,
              mergedIntoId,
              adminNotes,
            },
          }),
          prisma.teamMembership.upsert({
            where: {
              teamId_volunteerId: { teamId: mergedIntoId, volunteerId: suggestion.suggestedBy.id },
            },
            create: { teamId: mergedIntoId, volunteerId: suggestion.suggestedBy.id },
            update: {},
          }),
        ])
        targetTeamId = mergedIntoId
        notificationAction = 'merge'
      } else if (action === 'on_hold') {
        await prisma.teamSuggestion.update({
          where: { id: input.id },
          data: { ...reviewBase, status: TeamSuggestionStatus.on_hold, adminNotes },
        })
      } else if (action === 'decline') {
        await prisma.teamSuggestion.update({
          where: { id: input.id },
          data: { ...reviewBase, status: TeamSuggestionStatus.declined, adminNotes },
        })
        notificationAction = TeamSuggestionStatus.declined
      }

      const titleFn = NOTIFICATION_TITLES[notificationAction]
      const title = titleFn ? titleFn(finalName) : `Update on your team suggestion`
      const notificationLink = targetTeamId ? `/teams/${targetTeamId}` : null

      await createNotification(
        suggestion.suggestedBy.id,
        'team_suggestion_reviewed',
        title,
        adminNotes,
        notificationLink,
      )

      await clearNotifications('team_suggestion', input.id)

      return { message: 'Suggestion updated' }
    }),

  deleteSuggestion: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const suggestion = await prisma.teamSuggestion.findUnique({ where: { id: input.id } })
      if (!suggestion) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

      await prisma.teamSuggestion.delete({ where: { id: input.id } })
      return { message: 'Suggestion deleted' }
    }),
}
