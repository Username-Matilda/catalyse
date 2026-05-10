import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const [received, sent] = await Promise.all([
    prisma.message.findMany({
      where: { toVolunteerId: volunteer.id },
      include: { from: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.message.findMany({
      where: { fromVolunteerId: volunteer.id },
      include: { to: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return Response.json({
    received: received.map(m => ({
      id: m.id,
      from_volunteer_id: m.fromVolunteerId,
      to_volunteer_id: m.toVolunteerId,
      subject: m.subject,
      message: m.message,
      related_project_id: m.relatedProjectId,
      read_at: m.readAt,
      created_at: m.createdAt,
      from_name: m.from.name,
    })),
    sent: sent.map(m => ({
      id: m.id,
      from_volunteer_id: m.fromVolunteerId,
      to_volunteer_id: m.toVolunteerId,
      subject: m.subject,
      message: m.message,
      related_project_id: m.relatedProjectId,
      read_at: m.readAt,
      created_at: m.createdAt,
      to_name: m.to.name,
    })),
  })
}
