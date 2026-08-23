import { prisma } from '@/lib/prisma'
import { TeamSuggestionBodySchema } from '@/lib/schemas'
import { notifyAdmins } from '@/lib/notify'
import { authedProcedure, approvedProcedure } from '../procedures'

export const teamSuggestionsRouter = {
  list: authedProcedure.handler(async ({ context }) => {
    const suggestions = await prisma.teamSuggestion.findMany({
      where: { suggestedById: context.volunteer.id },
      orderBy: { createdAt: 'desc' },
      include: { mergedInto: { select: { id: true, name: true } } },
    })
    return {
      suggestions: suggestions.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        adminNotes: s.adminNotes,
        createdAt: s.createdAt,
        mergedInto: s.mergedInto ? { id: s.mergedInto.id, name: s.mergedInto.name } : null,
      })),
    }
  }),

  create: approvedProcedure.input(TeamSuggestionBodySchema).handler(async ({ input, context }) => {
    const suggestion = await prisma.teamSuggestion.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        suggestedById: context.volunteer.id,
      },
    })

    const title = `New team suggestion: ${input.name}`
    await notifyAdmins(
      'team_suggestion',
      title,
      null,
      '/admin/teams',
      {
        subject: title,
        message: `${context.volunteer.name} suggested a new team: <strong>${input.name}</strong>.`,
        ctaLabel: 'Review Suggestion',
        ctaUrl: '/admin/teams',
      },
      suggestion.id,
    )

    return {
      id: suggestion.id,
      name: suggestion.name,
      description: suggestion.description,
      status: suggestion.status,
      adminNotes: null,
      createdAt: suggestion.createdAt,
      mergedInto: null,
    }
  }),
}
