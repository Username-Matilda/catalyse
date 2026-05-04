import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }
  await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { authToken: null },
  })
  return Response.json({ message: 'Logged out' })
}
