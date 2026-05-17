import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const taskId = parseInt(id, 10)
  if (isNaN(taskId)) return Response.json({ detail: 'Invalid id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const task = await prisma.starterTask.findUnique({ where: { id: taskId } })
  if (!task) return Response.json({ detail: 'Task not found' }, { status: 404 })

  const updated = await prisma.starterTask.update({
    where: { id: taskId },
    data: {
      ...(body.title != null && { title: String(body.title).trim() }),
      ...(body.description != null && { description: String(body.description).trim() }),
      ...(Object.prototype.hasOwnProperty.call(body, 'skillId') && {
        skillId: body.skillId as number | null,
      }),
      ...(Object.prototype.hasOwnProperty.call(body, 'estimatedHours') && {
        estimatedHours: body.estimatedHours as number | null,
      }),
    },
  })

  return Response.json({ id: updated.id, message: 'Task updated' })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const taskId = parseInt(id, 10)
  if (isNaN(taskId)) return Response.json({ detail: 'Invalid id' }, { status: 400 })

  const task = await prisma.starterTask.findUnique({ where: { id: taskId } })
  if (!task) return Response.json({ detail: 'Task not found' }, { status: 404 })

  await prisma.skillEndorsement.deleteMany({
    where: { source: 'starter_task', sourceId: taskId },
  })
  await prisma.starterTask.delete({ where: { id: taskId } })

  return Response.json({ message: 'Task deleted' })
}
