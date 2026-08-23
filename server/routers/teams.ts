import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { publicProcedure, approvedProcedure } from '../procedures'
import { TeamMembershipRole } from '@/generated/prisma/enums'

function serializeTeam(
  team: {
    id: number
    name: string
    description: string | null
    lumaUrl: string | null
    docUrl: string | null
    members: {
      volunteerId: number
      role: TeamMembershipRole
      volunteer: { id: number; name: string }
    }[]
  },
  viewerId?: number,
) {
  const viewerMembership = viewerId
    ? team.members.find((m) => m.volunteerId === viewerId)
    : undefined
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    lumaUrl: team.lumaUrl,
    docUrl: team.docUrl,
    memberCount: team.members.length,
    leaders: team.members
      .filter((m) => m.role === TeamMembershipRole.leader)
      .map((m) => ({ id: m.volunteer.id, name: m.volunteer.name })),
    viewerRole: viewerMembership?.role ?? null,
  }
}

export const teamsRouter = {
  list: publicProcedure.handler(async ({ context }) => {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { members: { include: { volunteer: { select: { id: true, name: true } } } } },
    })
    return { teams: teams.map((t) => serializeTeam(t, context.volunteer?.id)) }
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const team = await prisma.team.findUnique({
        where: { id: input.id },
        include: { members: { include: { volunteer: { select: { id: true, name: true } } } } },
      })
      if (!team) throw new ORPCError('NOT_FOUND', { message: 'Team not found' })
      return serializeTeam(team, context.volunteer?.id)
    }),

  join: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const team = await prisma.team.findUnique({ where: { id: input.id } })
      if (!team) throw new ORPCError('NOT_FOUND', { message: 'Team not found' })

      await prisma.teamMembership.upsert({
        where: { teamId_volunteerId: { teamId: input.id, volunteerId: context.volunteer.id } },
        create: { teamId: input.id, volunteerId: context.volunteer.id },
        update: {},
      })
      return { message: 'Joined team' }
    }),

  leave: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      await prisma.teamMembership.deleteMany({
        where: { teamId: input.id, volunteerId: context.volunteer.id },
      })
      return { message: 'Left team' }
    }),
}
