import { createHash } from 'crypto'
import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { serializeSkill } from '@/lib/auth'
import { sendApplicationApprovedEmail, sendApplicationRejectedEmail } from '@/lib/email'
import { APPLICATION_ANONYMISATION_MS } from '@/lib/applications'
import { ApplicationActionSchema } from '@/lib/schemas'
import { superAdminProcedure } from '../../procedures'

export const adminApplicationsRouter = {
  list: superAdminProcedure
    .input(z.object({ filter: z.string().optional().default('mine') }))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer

      if (input.filter === 'rejected_anonymised') {
        const records = await prisma.rejectedApplication.findMany({
          orderBy: { rejectedAt: 'desc' },
        })
        return records.map((r) => ({
          id: r.id,
          rejectedAt: r.rejectedAt,
          adminNotes: r.adminNotes,
          applicantNotes: r.applicantNotes,
        }))
      }

      type WhereClause = NonNullable<Parameters<typeof prisma.volunteer.findMany>[0]>['where']
      const where: WhereClause = (() => {
        switch (input.filter) {
          case 'mine':
            return {
              deletedAt: null,
              approvalStatus: { in: ['PENDING', 'UNDER_REVIEW'] },
              OR: [{ reviewerId: null }, { reviewerId: admin.id }],
            }
          case 'others':
            return {
              deletedAt: null,
              approvalStatus: 'UNDER_REVIEW',
              reviewerId: { not: admin.id },
            }
          case 'approved':
            return { deletedAt: null, approvalStatus: 'APPROVED' }
          case 'rejected':
            return { deletedAt: null, approvalStatus: 'REJECTED' }
          default:
            return { deletedAt: null, approvalStatus: 'PENDING' }
        }
      })()

      const volunteers = await prisma.volunteer.findMany({
        where,
        include: {
          skills: {
            include: { skill: { include: { category: true } } },
            orderBy: [
              { skill: { category: { sortOrder: 'asc' } } },
              { skill: { sortOrder: 'asc' } },
            ],
          },
          reviewer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })

      const emailHashes = volunteers
        .filter((v) => v.email)
        .map((v) => createHash('sha256').update(v.email!.toLowerCase().trim()).digest('hex'))

      const rejectionRows =
        emailHashes.length > 0
          ? await prisma.rejectedApplication.findMany({
              where: { emailHash: { in: emailHashes } },
              orderBy: { rejectedAt: 'desc' },
              select: {
                emailHash: true,
                rejectedAt: true,
                adminNotes: true,
                applicantNotes: true,
              },
            })
          : []

      const rejectionsByHash = new Map<string, typeof rejectionRows>()
      for (const row of rejectionRows) {
        const list = rejectionsByHash.get(row.emailHash) ?? []
        list.push(row)
        rejectionsByHash.set(row.emailHash, list)
      }

      return volunteers.map((v) => {
        const emailHash = v.email
          ? createHash('sha256').update(v.email.toLowerCase().trim()).digest('hex')
          : null
        const previousRejections = emailHash ? (rejectionsByHash.get(emailHash) ?? []) : []
        return {
          id: v.id,
          name: v.name,
          email: v.email,
          bio: v.bio,
          applicationMessage: v.applicationMessage,
          approvalStatus: v.approvalStatus,
          createdAt: v.createdAt,
          rejectedAt: v.rejectedAt,
          anonymiseAt: v.rejectedAt
            ? new Date(v.rejectedAt.getTime() + APPLICATION_ANONYMISATION_MS).toISOString()
            : null,
          adminNotes: v.applicationAdminNotes,
          applicantNotes: v.applicationApplicantNotes,
          reviewer: v.reviewer ? { id: v.reviewer.id, name: v.reviewer.name } : null,
          previousRejections: previousRejections.map((r) => ({
            rejectedAt: r.rejectedAt,
            adminNotes: r.adminNotes,
            applicantNotes: r.applicantNotes,
          })),
          availabilityHoursPerWeek: v.availabilityHoursPerWeek,
          location: v.location,
          country: v.country,
          localGroup: v.localGroup,
          signalNumber: v.signalNumber,
          whatsappNumber: v.whatsappNumber,
          discordHandle: v.discordHandle,
          contactNotes: v.contactNotes,
          skills: v.skills.map(serializeSkill),
        }
      })
    }),

  getById: superAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .handler(async ({ input }) => {
      const v = await prisma.volunteer.findFirst({
        where: { id: input.id, deletedAt: null },
        include: {
          skills: {
            include: { skill: { include: { category: true } } },
            orderBy: [
              { skill: { category: { sortOrder: 'asc' } } },
              { skill: { sortOrder: 'asc' } },
            ],
          },
          reviewer: { select: { id: true, name: true } },
        },
      })

      if (!v) throw new ORPCError('NOT_FOUND', { message: 'Volunteer not found' })

      const emailHash = v.email
        ? createHash('sha256').update(v.email.toLowerCase().trim()).digest('hex')
        : null

      const previousRejections = emailHash
        ? await prisma.rejectedApplication.findMany({
            where: { emailHash },
            orderBy: { rejectedAt: 'desc' },
            select: { rejectedAt: true, adminNotes: true, applicantNotes: true },
          })
        : []

      return {
        id: v.id,
        name: v.name,
        email: v.email,
        bio: v.bio,
        applicationMessage: v.applicationMessage,
        approvalStatus: v.approvalStatus,
        createdAt: v.createdAt,
        rejectedAt: v.rejectedAt,
        anonymiseAt: v.rejectedAt
          ? new Date(v.rejectedAt.getTime() + APPLICATION_ANONYMISATION_MS).toISOString()
          : null,
        adminNotes: v.applicationAdminNotes,
        applicantNotes: v.applicationApplicantNotes,
        reviewer: v.reviewer ? { id: v.reviewer.id, name: v.reviewer.name } : null,
        previousRejections: previousRejections.map((r) => ({
          rejectedAt: r.rejectedAt,
          adminNotes: r.adminNotes,
          applicantNotes: r.applicantNotes,
        })),
        availabilityHoursPerWeek: v.availabilityHoursPerWeek,
        location: v.location,
        country: v.country,
        localGroup: v.localGroup,
        signalNumber: v.signalNumber,
        whatsappNumber: v.whatsappNumber,
        discordHandle: v.discordHandle,
        contactNotes: v.contactNotes,
        skills: v.skills.map(serializeSkill),
      }
    }),

  action: superAdminProcedure
    .input(z.object({ id: z.number().int() }).merge(ApplicationActionSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const { action, adminNotes: rawAdminNotes, applicantNotes: rawApplicantNotes } = input

      const adminNotes = rawAdminNotes !== null ? (rawAdminNotes ?? undefined) : undefined
      const applicantNotes =
        rawApplicantNotes !== null ? (rawApplicantNotes ?? undefined) : undefined

      const volunteer = await prisma.volunteer.findFirst({
        where: { id: input.id, deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          approvalStatus: true,
          applicationAdminNotes: true,
          applicationApplicantNotes: true,
        },
      })

      if (!volunteer) throw new ORPCError('NOT_FOUND', { message: 'Volunteer not found' })

      if (action === 'update_notes') {
        await prisma.volunteer.update({
          where: { id: input.id },
          data: {
            ...(adminNotes !== undefined && { applicationAdminNotes: adminNotes }),
            ...(applicantNotes !== undefined && { applicationApplicantNotes: applicantNotes }),
          },
        })
        return { message: 'Notes updated' }
      }

      if (action === 'start_review') {
        if (!['PENDING', 'UNDER_REVIEW'].includes(volunteer.approvalStatus)) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Cannot start review on a ${volunteer.approvalStatus.toLowerCase()} application`,
          })
        }
        await prisma.volunteer.update({
          where: { id: input.id },
          data: {
            approvalStatus: 'UNDER_REVIEW',
            reviewerId: admin.id,
            ...(adminNotes !== undefined && { applicationAdminNotes: adminNotes }),
            ...(applicantNotes !== undefined && { applicationApplicantNotes: applicantNotes }),
          },
        })
        return { message: 'Review started' }
      }

      if (volunteer.approvalStatus !== 'PENDING' && volunteer.approvalStatus !== 'UNDER_REVIEW') {
        throw new ORPCError('BAD_REQUEST', {
          message: `Application already ${volunteer.approvalStatus.toLowerCase()}`,
        })
      }

      const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED'

      await prisma.volunteer.update({
        where: { id: input.id },
        data: {
          approvalStatus: newStatus,
          reviewerId: admin.id,
          ...(adminNotes !== undefined && { applicationAdminNotes: adminNotes }),
          ...(applicantNotes !== undefined && { applicationApplicantNotes: applicantNotes }),
          ...(action === 'reject' && { rejectedAt: new Date() }),
        },
      })

      if (volunteer.email) {
        const resolvedApplicantNotes =
          applicantNotes ?? volunteer.applicationApplicantNotes ?? undefined
        if (action === 'approve') {
          sendApplicationApprovedEmail({ to: volunteer.email, name: volunteer.name }).catch((e) =>
            console.error('[APPLICATIONS] Approved email failed:', e),
          )
        } else {
          sendApplicationRejectedEmail({
            to: volunteer.email,
            name: volunteer.name,
            applicantNotes: resolvedApplicantNotes,
          }).catch((e) => console.error('[APPLICATIONS] Rejected email failed:', e))
        }
      }

      const label = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'started'
      return { message: `Application ${label}` }
    }),
}
