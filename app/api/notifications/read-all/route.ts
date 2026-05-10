import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function PUT(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  await prisma.notification.updateMany({
    where: { volunteerId: volunteer.id, readAt: null },
    data: { readAt: new Date() },
  })

  return Response.json({ message: 'All marked as read' })
}
