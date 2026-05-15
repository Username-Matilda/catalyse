import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendApplicationApprovedEmail, sendApplicationRejectedEmail } from '@/lib/email'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
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
  if (action !== 'approve' && action !== 'reject') {
    return Response.json({ detail: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  const volunteer = await prisma.volunteer.findFirst({
    where: { id: volunteerId, deletedAt: null },
    select: { id: true, name: true, email: true, approvalStatus: true },
  })

  if (!volunteer) {
    return Response.json({ detail: 'Volunteer not found' }, { status: 404 })
  }

  if (volunteer.approvalStatus !== 'PENDING') {
    return Response.json(
      { detail: `Application already ${volunteer.approvalStatus.toLowerCase()}` },
      { status: 400 },
    )
  }

  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED'

  await prisma.volunteer.update({
    where: { id: volunteerId },
    data: { approvalStatus: newStatus },
  })

  if (volunteer.email) {
    if (action === 'approve') {
      sendApplicationApprovedEmail(volunteer.email, volunteer.name).catch((e) =>
        console.error('[APPLICATIONS] Approved email failed:', e),
      )
    } else {
      sendApplicationRejectedEmail(volunteer.email, volunteer.name).catch((e) =>
        console.error('[APPLICATIONS] Rejected email failed:', e),
      )
    }
  }

  return Response.json({ message: `Application ${action}d` })
}
