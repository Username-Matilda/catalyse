import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin, serializeSkill } from '@/lib/auth'
import { sendApplicationApprovedEmail, sendApplicationRejectedEmail } from '@/lib/email'
import { APPLICATION_ANONYMISATION_MS } from '@/lib/applications'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id: idParam } = await params
  const volunteerId = parseInt(idParam, 10)
  if (isNaN(volunteerId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  const v = await prisma.volunteer.findFirst({
    where: { id: volunteerId, deletedAt: null },
    include: {
      skills: {
        include: { skill: { include: { category: true } } },
        orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
      },
      reviewer: { select: { id: true, name: true } },
    },
  })

  if (!v) return Response.json({ detail: 'Volunteer not found' }, { status: 404 })

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

  return Response.json({
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
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { volunteer: admin, error } = await requireSuperAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id: idParam } = await params
  const volunteerId = parseInt(idParam, 10)
  if (isNaN(volunteerId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action as string
  if (!['start_review', 'approve', 'reject', 'update_notes'].includes(action)) {
    return Response.json(
      { detail: 'action must be "start_review", "approve", "reject", or "update_notes"' },
      { status: 400 },
    )
  }

  const adminNotes = body.admin_notes != null ? String(body.admin_notes) : undefined
  const applicantNotes = body.applicant_notes != null ? String(body.applicant_notes) : undefined

  const volunteer = await prisma.volunteer.findFirst({
    where: { id: volunteerId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      approvalStatus: true,
      applicationAdminNotes: true,
      applicationApplicantNotes: true,
    },
  })

  if (!volunteer) {
    return Response.json({ detail: 'Volunteer not found' }, { status: 404 })
  }

  if (action === 'update_notes') {
    await prisma.volunteer.update({
      where: { id: volunteerId },
      data: {
        ...(adminNotes !== undefined && { applicationAdminNotes: adminNotes }),
        ...(applicantNotes !== undefined && { applicationApplicantNotes: applicantNotes }),
      },
    })
    return Response.json({ message: 'Notes updated' })
  }

  if (action === 'start_review') {
    if (!['PENDING', 'UNDER_REVIEW'].includes(volunteer.approvalStatus)) {
      return Response.json(
        { detail: `Cannot start review on a ${volunteer.approvalStatus.toLowerCase()} application` },
        { status: 400 },
      )
    }
    await prisma.volunteer.update({
      where: { id: volunteerId },
      data: {
        approvalStatus: 'UNDER_REVIEW',
        reviewerId: admin.id,
        ...(adminNotes !== undefined && { applicationAdminNotes: adminNotes }),
        ...(applicantNotes !== undefined && { applicationApplicantNotes: applicantNotes }),
      },
    })
    return Response.json({ message: 'Review started' })
  }

  if (volunteer.approvalStatus !== 'PENDING' && volunteer.approvalStatus !== 'UNDER_REVIEW') {
    return Response.json(
      { detail: `Application already ${volunteer.approvalStatus.toLowerCase()}` },
      { status: 400 },
    )
  }

  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED'

  await prisma.volunteer.update({
    where: { id: volunteerId },
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
  return Response.json({ message: `Application ${label}` })
}
