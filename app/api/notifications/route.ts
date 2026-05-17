import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const unreadOnly =
    searchParams.get('unread_only') === 'true' || searchParams.get('unread_only') === '1'

  const notifications = await prisma.notification.findMany({
    where: {
      volunteerId: volunteer.id,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return Response.json(
    notifications.map((n) => ({
      id: n.id,
      volunteerId: n.volunteerId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt,
      emailedAt: n.emailedAt,
      createdAt: n.createdAt,
    })),
  )
}
