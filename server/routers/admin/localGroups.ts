import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { sendLocalGroupSuggestionEmail } from '@/lib/email'
import { BASE_LOCATION_OPTIONS } from '@/lib/filter-options'
import { createNotification } from '@/lib/project'
import { LocalGroupBodySchema, ReviewSuggestionSchema } from '@/lib/schemas'
import { adminProcedure } from '../../procedures'
import { LocalGroupSuggestionStatus } from '@/generated/prisma/enums'

const VALID_COUNTRIES = new Set(
  BASE_LOCATION_OPTIONS.filter((o) => o.value && o.value !== 'Remote' && o.value !== 'Other').map(
    (o) => o.value,
  ),
)

const NOTIFICATION_TITLES: Record<string, (name: string) => string> = {
  accepted: (n) => `Your local group suggestion "${n}" was accepted`,
  merge: (n) => `Your local group suggestion "${n}" has been merged`,
  on_hold: (n) => `Your local group suggestion "${n}" is under review`,
  declined: (n) => `Update on your local group suggestion "${n}"`,
}

export const adminLocalGroupsRouter = {
  list: adminProcedure
    .input(z.object({ country: z.string().optional() }))
    .handler(async ({ input }) => {
      const groups = await prisma.localGroup.findMany({
        where: input.country ? { country: input.country } : undefined,
        orderBy: [{ country: 'asc' }, { name: 'asc' }],
      })
      return { groups }
    }),

  create: adminProcedure.input(LocalGroupBodySchema).handler(async ({ input }) => {
    if (!VALID_COUNTRIES.has(input.country)) {
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid country' })
    }
    const group = await prisma.localGroup.create({
      data: { name: input.name, country: input.country },
    })
    return { id: group.id, name: group.name, country: group.country }
  }),

  update: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(LocalGroupBodySchema))
    .handler(async ({ input }) => {
      if (!VALID_COUNTRIES.has(input.country)) {
        throw new ORPCError('BAD_REQUEST', { message: 'Invalid country' })
      }
      const existing = await prisma.localGroup.findUnique({ where: { id: input.id } })
      if (!existing) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

      const group = await prisma.localGroup.update({
        where: { id: input.id },
        data: { name: input.name, country: input.country },
      })
      return { id: group.id, name: group.name, country: group.country }
    }),

  delete: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const existing = await prisma.localGroup.findUnique({ where: { id: input.id } })
    if (!existing) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

    await prisma.$transaction([
      prisma.localGroupSuggestion.updateMany({
        where: { mergedIntoId: input.id },
        data: { mergedIntoId: null },
      }),
      prisma.project.updateMany({
        where: { localGroup: existing.name },
        data: { localGroup: null },
      }),
      prisma.localGroup.delete({ where: { id: input.id } }),
    ])

    return { message: 'Group deleted' }
  }),

  listSuggestions: adminProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'on_hold', 'accepted', 'declined'] as const).default('pending'),
      }),
    )
    .handler(async ({ input }) => {
      const suggestions = await prisma.localGroupSuggestion.findMany({
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
          country: s.country,
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
    .input(z.object({ id: z.number().int() }).merge(ReviewSuggestionSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const suggestion = await prisma.localGroupSuggestion.findUnique({
        where: { id: input.id },
        include: { suggestedBy: { select: { id: true, name: true, email: true } } },
      })
      if (!suggestion) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

      const body = input
      const action = body.action
      const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() || null : null
      const now = new Date()
      const reviewBase = { reviewedById: admin.id, reviewedAt: now, updatedAt: now }

      let finalName = suggestion.name
      let notificationAction: string = action

      if (action === 'accept') {
        const name = body.name?.trim() || suggestion.name
        const country = body.country?.trim() || suggestion.country
        if (!name || !country) {
          throw new ORPCError('BAD_REQUEST', { message: 'Name and country required' })
        }
        finalName = name
        await prisma.$transaction([
          prisma.localGroup.create({ data: { name, country } }),
          prisma.localGroupSuggestion.update({
            where: { id: input.id },
            data: {
              ...reviewBase,
              status: LocalGroupSuggestionStatus.accepted,
              name,
              country,
              adminNotes,
            },
          }),
        ])
        notificationAction = LocalGroupSuggestionStatus.accepted
      } else if (action === 'merge') {
        const mergedIntoId = body.mergedIntoId ?? null
        if (!mergedIntoId) {
          throw new ORPCError('BAD_REQUEST', { message: 'mergedIntoId required for merge' })
        }
        const target = await prisma.localGroup.findUnique({ where: { id: mergedIntoId } })
        if (!target) throw new ORPCError('NOT_FOUND', { message: 'Target local group not found' })

        await prisma.localGroupSuggestion.update({
          where: { id: input.id },
          data: {
            ...reviewBase,
            status: LocalGroupSuggestionStatus.accepted,
            mergedIntoId,
            adminNotes,
          },
        })
        notificationAction = 'merge'
      } else if (action === 'on_hold') {
        await prisma.localGroupSuggestion.update({
          where: { id: input.id },
          data: { ...reviewBase, status: LocalGroupSuggestionStatus.on_hold, adminNotes },
        })
      } else if (action === 'decline') {
        await prisma.localGroupSuggestion.update({
          where: { id: input.id },
          data: { ...reviewBase, status: LocalGroupSuggestionStatus.declined, adminNotes },
        })
        notificationAction = LocalGroupSuggestionStatus.declined
      }

      const titleFn = NOTIFICATION_TITLES[notificationAction]
      const title = titleFn ? titleFn(finalName) : `Update on your local group suggestion`

      await createNotification(
        suggestion.suggestedBy.id,
        'local_group_suggestion',
        title,
        adminNotes,
        '/suggest-local-group',
      )

      await sendLocalGroupSuggestionEmail({
        to: suggestion.suggestedBy.email ?? '',
        name: suggestion.suggestedBy.name ?? 'there',
        action: notificationAction,
        groupName: finalName,
        adminNotes,
      })

      return { message: 'Suggestion updated' }
    }),

  deleteSuggestion: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const suggestion = await prisma.localGroupSuggestion.findUnique({ where: { id: input.id } })
      if (!suggestion) throw new ORPCError('NOT_FOUND', { message: 'Not found' })

      await prisma.localGroupSuggestion.delete({ where: { id: input.id } })
      return { message: 'Suggestion deleted' }
    }),
}
