import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { createNotification } from '@/lib/project'
import { parseBody } from '@/lib/errors'
import { AssignStarterTaskSchema } from '@/lib/schemas'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const taskId = parseInt(idParam, 10)
  if (isNaN(taskId)) {
    return Response.json({ detail: 'Invalid task ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const task = await prisma.starterTask.findUnique({ where: { id: taskId } })
  if (!task) {
    return Response.json({ detail: 'Task not found' }, { status: 404 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(AssignStarterTaskSchema, raw)
  if (!parsed.success) return parsed.response
  const { volunteerId } = parsed.data

  await prisma.starterTask.update({
    where: { id: taskId },
    data: {
      assignedToId: volunteerId,
      assignedById: admin.id,
      status: 'assigned',
      updatedAt: new Date(),
    },
  })

  createNotification(
    volunteerId,
    'starter_task_assigned',
    `You've been assigned a starter task: ${task.title}`,
    task.description.slice(0, 200),
    '/dashboard',
  ).catch((e) => console.error('[NOTIFY ERROR]', e))

  return Response.json({ message: 'Task assigned' })
}
