import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const taskId = parseInt(idParam, 10)
  if (isNaN(taskId)) return Response.json({ detail: 'Invalid task ID' }, { status: 400 })

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const task = await prisma.starterTask.findUnique({ where: { id: taskId } })
  if (!task) return Response.json({ detail: 'Task not found' }, { status: 404 })

  await prisma.starterTask.update({
    where: { id: taskId },
    data: {
      assignedToId: null,
      assignedById: null,
      status: 'open',
      updatedAt: new Date(),
    },
  })

  return Response.json({ message: 'Task unassigned' })
}
