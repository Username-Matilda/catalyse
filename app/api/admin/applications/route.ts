import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, serializeSkill } from '@/lib/auth'
import { APPLICATION_ANONYMISATION_MS } from '@/lib/applications'

export async function GET(request: NextRequest) {
  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
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

  type WhereClause = Parameters<typeof prisma.volunteer.findMany>[0]['where']
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
      previousRejection: { select: { rejectedAt: true, adminNotes: true, applicantNotes: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return Response.json(
    volunteers.map((v) => ({
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
      previous_rejection: v.previousRejection
        ? {
            rejected_at: v.previousRejection.rejectedAt,
            admin_notes: v.previousRejection.adminNotes,
            applicant_notes: v.previousRejection.applicantNotes,
          }
        : null,
      availability_hours_per_week: v.availabilityHoursPerWeek,
      location: v.location,
      country: v.country,
      local_group: v.localGroup,
      signal_number: v.signalNumber,
      whatsapp_number: v.whatsappNumber,
      discord_handle: v.discordHandle,
      contact_notes: v.contactNotes,
      skills: v.skills.map(serializeSkill),
    })),
  )
}
