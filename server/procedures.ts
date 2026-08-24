import { os, ORPCError } from '@orpc/server'
import { ApprovalStatus } from '@/generated/prisma/enums'
import { isSuperAdmin } from '@/lib/auth'
import type { Context } from './context'

const base = os.$context<Context>()

export const publicProcedure = base

export const authedProcedure = base.use(({ context, next }) => {
  if (!context.volunteer) throw new ORPCError('UNAUTHORIZED')
  return next({ context: { volunteer: context.volunteer, token: context.token } })
})

export const approvedProcedure = authedProcedure.use(({ context, next }) => {
  if (context.volunteer.approvalStatus !== ApprovalStatus.approved && !context.volunteer.isAdmin) {
    throw new ORPCError('FORBIDDEN', { message: 'Your account is pending approval' })
  }
  return next({ context })
})

export const adminProcedure = base.use(({ context, next }) => {
  if (!context.volunteer) throw new ORPCError('UNAUTHORIZED')
  if (!context.volunteer.isAdmin) throw new ORPCError('FORBIDDEN')
  return next({ context: { volunteer: context.volunteer } })
})

export const superAdminProcedure = base.use(({ context, next }) => {
  if (!context.volunteer) throw new ORPCError('UNAUTHORIZED')
  if (!context.volunteer.isAdmin) throw new ORPCError('FORBIDDEN')
  if (!isSuperAdmin(context.volunteer.email)) throw new ORPCError('FORBIDDEN')
  return next({ context: { volunteer: context.volunteer } })
})
