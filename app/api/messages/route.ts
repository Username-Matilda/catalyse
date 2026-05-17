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
    received: received.map((m) => ({
      id: m.id,
      fromVolunteerId: m.fromVolunteerId,
      toVolunteerId: m.toVolunteerId,
      subject: m.subject,
      message: m.message,
      relatedProjectId: m.relatedProjectId,
      readAt: m.readAt,
      createdAt: m.createdAt,
      fromName: m.from.name,
    })),
    sent: sent.map((m) => ({
      id: m.id,
      fromVolunteerId: m.fromVolunteerId,
      toVolunteerId: m.toVolunteerId,
      subject: m.subject,
      message: m.message,
      relatedProjectId: m.relatedProjectId,
      readAt: m.readAt,
      createdAt: m.createdAt,
      toName: m.to.name,
    })),
  })
}
