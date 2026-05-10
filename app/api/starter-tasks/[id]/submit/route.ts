import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { createNotification } from '@/lib/project'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const taskId = parseInt(idParam, 10)
  if (isNaN(taskId)) {
    return Response.json({ detail: 'Invalid task ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const task = await prisma.starterTask.findFirst({
    where: { id: taskId, assignedToId: volunteer.id },
  })
  if (!task) {
    return Response.json({ detail: 'Task not found or not assigned to you' }, { status: 404 })
  }

  await prisma.starterTask.update({
    where: { id: taskId },
    data: { status: 'submitted', updatedAt: new Date() },
  })

  if (task.assignedById) {
    createNotification(
      task.assignedById,
      'starter_task_submitted',
      `${volunteer.name} submitted: ${task.title}`,
      'Ready for review',
      '/admin/starter-tasks',
    ).catch((e) => console.error('[NOTIFY ERROR]', e))
  }

  return Response.json({ message: 'Task submitted for review' })
}
