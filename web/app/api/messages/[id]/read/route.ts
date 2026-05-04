import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const { id: idParam } = await params
  const messageId = parseInt(idParam, 10)
  if (isNaN(messageId)) {
    return Response.json({ detail: 'Invalid message ID' }, { status: 400 })
  }

  const result = await prisma.message.updateMany({
    where: { id: messageId, toVolunteerId: volunteer.id },
    data: { readAt: new Date() },
  })

  if (result.count === 0) {
    return Response.json({ detail: 'Message not found' }, { status: 404 })
  }

  return Response.json({ message: 'Marked as read' })
}
