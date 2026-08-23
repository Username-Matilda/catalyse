import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notify'
import { publicProcedure, approvedProcedure } from '../procedures'
import { TeamMembershipRole, TeamJoinRequestStatus } from '@/generated/prisma/enums'

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
  viewerRequestStatus?: TeamJoinRequestStatus | null,
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
    viewerRequestStatus: viewerRequestStatus ?? null,
  }
}

/** Team leader (of this team) or admin — who may review join requests / manage membership. */
async function assertCanManageTeam(
  teamId: number,
  volunteer: { id: number; isAdmin: boolean | null },
) {
  if (volunteer.isAdmin) return
  const membership = await prisma.teamMembership.findUnique({
    where: { teamId_volunteerId: { teamId, volunteerId: volunteer.id } },
  })
  if (membership?.role !== TeamMembershipRole.leader) {
    throw new ORPCError('FORBIDDEN', { message: 'Only a team leader or admin can do this' })
  }
}

export const teamsRouter = {
  list: publicProcedure.handler(async ({ context }) => {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { members: { include: { volunteer: { select: { id: true, name: true } } } } },
    })
    const viewerId = context.volunteer?.id
    const pendingRequests = viewerId
      ? await prisma.teamJoinRequest.findMany({
          where: { volunteerId: viewerId, status: TeamJoinRequestStatus.pending },
          select: { teamId: true, status: true },
        })
      : []
    const pendingByTeam = new Map(pendingRequests.map((r) => [r.teamId, r.status]))
    return {
      teams: teams.map((t) => serializeTeam(t, viewerId, pendingByTeam.get(t.id) ?? null)),
    }
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      const team = await prisma.team.findUnique({
        where: { id: input.id },
        include: { members: { include: { volunteer: { select: { id: true, name: true } } } } },
      })
      if (!team) throw new ORPCError('NOT_FOUND', { message: 'Team not found' })
      const viewerId = context.volunteer?.id
      const pending = viewerId
        ? await prisma.teamJoinRequest.findFirst({
            where: {
              teamId: input.id,
              volunteerId: viewerId,
              status: TeamJoinRequestStatus.pending,
            },
          })
        : null
      return serializeTeam(team, viewerId, pending?.status ?? null)
    }),

  apply: approvedProcedure
    .input(z.object({ id: z.number().int(), message: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const team = await prisma.team.findUnique({ where: { id: input.id } })
      if (!team) throw new ORPCError('NOT_FOUND', { message: 'Team not found' })

      const existingMembership = await prisma.teamMembership.findUnique({
        where: { teamId_volunteerId: { teamId: input.id, volunteerId: context.volunteer.id } },
      })
      if (existingMembership) {
        throw new ORPCError('BAD_REQUEST', { message: 'Already a member of this team' })
      }

      const existingRequest = await prisma.teamJoinRequest.findFirst({
        where: {
          teamId: input.id,
          volunteerId: context.volunteer.id,
          status: TeamJoinRequestStatus.pending,
        },
      })
      if (existingRequest) {
        throw new ORPCError('BAD_REQUEST', { message: 'Already applied — awaiting review' })
      }

      await prisma.teamJoinRequest.create({
        data: {
          teamId: input.id,
          volunteerId: context.volunteer.id,
          message: input.message?.trim() || null,
        },
      })

      const leaders = await prisma.teamMembership.findMany({
        where: { teamId: input.id, role: TeamMembershipRole.leader },
        select: { volunteerId: true },
      })
      const recipientIds = leaders.length > 0 ? leaders.map((l) => l.volunteerId) : null
      if (recipientIds) {
        await Promise.all(
          recipientIds.map((id) =>
            notifyUser(
              id,
              'team_join_request',
              `${context.volunteer.name} applied to join ${team.name}`,
              null,
              '/teams',
            ),
          ),
        )
      }

      return { message: 'Application submitted' }
    }),

  leave: approvedProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input, context }) => {
      await prisma.teamMembership.deleteMany({
        where: { teamId: input.id, volunteerId: context.volunteer.id },
      })
      return { message: 'Left team' }
    }),

  listJoinRequests: approvedProcedure
    .input(z.object({ teamId: z.number().int() }))
    .handler(async ({ input, context }) => {
      await assertCanManageTeam(input.teamId, context.volunteer)
      const requests = await prisma.teamJoinRequest.findMany({
        where: { teamId: input.teamId, status: TeamJoinRequestStatus.pending },
        orderBy: { createdAt: 'asc' },
        include: { volunteer: { select: { id: true, name: true, email: true } } },
      })
      return {
        requests: requests.map((r) => ({
          id: r.id,
          message: r.message,
          createdAt: r.createdAt,
          volunteer: { id: r.volunteer.id, name: r.volunteer.name, email: r.volunteer.email },
        })),
      }
    }),

  reviewJoinRequest: approvedProcedure
    .input(z.object({ id: z.number().int(), action: z.enum(['accept', 'decline']) }))
    .handler(async ({ input, context }) => {
      const request = await prisma.teamJoinRequest.findUnique({ where: { id: input.id } })
      if (!request) throw new ORPCError('NOT_FOUND', { message: 'Request not found' })
      await assertCanManageTeam(request.teamId, context.volunteer)

      if (request.status !== TeamJoinRequestStatus.pending) {
        throw new ORPCError('BAD_REQUEST', { message: 'Request already reviewed' })
      }

      await prisma.$transaction([
        prisma.teamJoinRequest.update({
          where: { id: input.id },
          data: {
            status:
              input.action === 'accept'
                ? TeamJoinRequestStatus.accepted
                : TeamJoinRequestStatus.declined,
            reviewedById: context.volunteer.id,
            reviewedAt: new Date(),
          },
        }),
        ...(input.action === 'accept'
          ? [
              prisma.teamMembership.upsert({
                where: {
                  teamId_volunteerId: { teamId: request.teamId, volunteerId: request.volunteerId },
                },
                create: { teamId: request.teamId, volunteerId: request.volunteerId },
                update: {},
              }),
            ]
          : []),
      ])

      const team = await prisma.team.findUnique({ where: { id: request.teamId } })
      await notifyUser(
        request.volunteerId,
        'team_join_request_reviewed',
        input.action === 'accept'
          ? `You're in! Approved to join ${team?.name ?? 'the team'}`
          : `Your request to join ${team?.name ?? 'the team'} was declined`,
        null,
        '/teams',
      )

      return { message: `Request ${input.action === 'accept' ? 'accepted' : 'declined'}` }
    }),

  /** Admin or team leader adds a volunteer directly — skips the apply/review flow. */
  assignMember: approvedProcedure
    .input(
      z.object({
        teamId: z.number().int(),
        volunteerId: z.number().int(),
        role: z.enum([TeamMembershipRole.member, TeamMembershipRole.leader]).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      await assertCanManageTeam(input.teamId, context.volunteer)
      const volunteer = await prisma.volunteer.findUnique({ where: { id: input.volunteerId } })
      if (!volunteer) throw new ORPCError('NOT_FOUND', { message: 'Volunteer not found' })

      await prisma.teamMembership.upsert({
        where: { teamId_volunteerId: { teamId: input.teamId, volunteerId: input.volunteerId } },
        create: { teamId: input.teamId, volunteerId: input.volunteerId, role: input.role },
        update: { role: input.role },
      })
      return { message: 'Volunteer added to team' }
    }),

  setMemberRole: approvedProcedure
    .input(
      z.object({
        teamId: z.number().int(),
        volunteerId: z.number().int(),
        role: z.enum([TeamMembershipRole.member, TeamMembershipRole.leader]),
      }),
    )
    .handler(async ({ input, context }) => {
      await assertCanManageTeam(input.teamId, context.volunteer)
      const membership = await prisma.teamMembership.findUnique({
        where: { teamId_volunteerId: { teamId: input.teamId, volunteerId: input.volunteerId } },
      })
      if (!membership) throw new ORPCError('NOT_FOUND', { message: 'Not a team member' })

      await prisma.teamMembership.update({
        where: { id: membership.id },
        data: { role: input.role },
      })
      return { message: 'Role updated' }
    }),

  removeMember: approvedProcedure
    .input(z.object({ teamId: z.number().int(), volunteerId: z.number().int() }))
    .handler(async ({ input, context }) => {
      await assertCanManageTeam(input.teamId, context.volunteer)
      await prisma.teamMembership.deleteMany({
        where: { teamId: input.teamId, volunteerId: input.volunteerId },
      })
      return { message: 'Member removed' }
    }),
}
