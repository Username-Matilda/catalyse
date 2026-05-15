import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin, serializeSkill } from '@/lib/auth'
import { APPLICATION_ANONYMISATION_MS } from '@/lib/applications'

export async function GET(request: NextRequest) {
  const { volunteer: admin, error } = await requireSuperAdmin(request.headers.get('authorization'))
  if (error) return error

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') ?? 'mine'

  if (filter === 'rejected_anonymised') {
    const records = await prisma.rejectedApplication.findMany({
      orderBy: { rejectedAt: 'desc' },
    })
    return Response.json(
      records.map((r) => ({
        id: r.id,
        rejected_at: r.rejectedAt,
        admin_notes: r.adminNotes,
        applicant_notes: r.applicantNotes,
      })),
    )
  }

  type WhereClause = NonNullable<Parameters<typeof prisma.volunteer.findMany>[0]>['where']
  const where: WhereClause = (() => {
    switch (filter) {
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
        orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
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
          select: { emailHash: true, rejectedAt: true, adminNotes: true, applicantNotes: true },
        })
      : []

  const rejectionsByHash = new Map<string, typeof rejectionRows>()
  for (const row of rejectionRows) {
    const list = rejectionsByHash.get(row.emailHash) ?? []
    list.push(row)
    rejectionsByHash.set(row.emailHash, list)
  }

  return Response.json(
    volunteers.map((v) => {
      const emailHash = v.email
        ? createHash('sha256').update(v.email.toLowerCase().trim()).digest('hex')
        : null
      const previousRejections = emailHash ? (rejectionsByHash.get(emailHash) ?? []) : []
      return {
        id: v.id,
        name: v.name,
        email: v.email,
        bio: v.bio,
        application_message: v.applicationMessage,
        approval_status: v.approvalStatus,
        created_at: v.createdAt,
        rejected_at: v.rejectedAt,
        anonymise_at: v.rejectedAt
          ? new Date(v.rejectedAt.getTime() + APPLICATION_ANONYMISATION_MS).toISOString()
          : null,
        admin_notes: v.applicationAdminNotes,
        applicant_notes: v.applicationApplicantNotes,
        reviewer: v.reviewer ? { id: v.reviewer.id, name: v.reviewer.name } : null,
        previous_rejections: previousRejections.map((r) => ({
          rejected_at: r.rejectedAt,
          admin_notes: r.adminNotes,
          applicant_notes: r.applicantNotes,
        })),
        availability_hours_per_week: v.availabilityHoursPerWeek,
        location: v.location,
        country: v.country,
        local_group: v.localGroup,
        signal_number: v.signalNumber,
        whatsapp_number: v.whatsappNumber,
        discord_handle: v.discordHandle,
        contact_notes: v.contactNotes,
        skills: v.skills.map(serializeSkill),
      }
    }),
  )
}
