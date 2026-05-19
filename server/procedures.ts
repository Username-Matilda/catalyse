import { os, ORPCError } from '@orpc/server'
import { isSuperAdmin } from '@/lib/auth'
import type { Context } from './context'

const base = os.$context<Context>()

export const publicProcedure = base

export const authedProcedure = base.use(({ context, next }) => {
  if (!context.volunteer) throw new ORPCError('UNAUTHORIZED')
  return next({ context: { volunteer: context.volunteer } })
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
