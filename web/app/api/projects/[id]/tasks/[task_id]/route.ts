import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; task_id: string }> }
) {
  const { id: idParam, task_id: taskIdParam } = await params
  const projectId = parseInt(idParam, 10)
  const taskId = parseInt(taskIdParam, 10)
  if (isNaN(projectId) || isNaN(taskId)) {
    return Response.json({ detail: 'Invalid ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const [project, task] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectTask.findFirst({ where: { id: taskId, projectId } }),
  ])

  if (!project || !task) {
    return Response.json({ detail: 'Project or task not found' }, { status: 404 })
  }

  const isOwner = project.ownerId === volunteer.id
  const isAdmin = volunteer.isAdmin
  const isAssignee = task.assignedToId === volunteer.id

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const newStatus = body.status as string | undefined
  const newAssignedToId = body.assigned_to_id as number | undefined

  if (!isOwner && !isAdmin) {
    const isSelfClaim = newStatus === 'assigned' && newAssignedToId === volunteer.id && task.status === 'open'
    const isMarkingDone = newStatus === 'done' && isAssignee && task.status === 'assigned'
    if (!isSelfClaim && !isMarkingDone) {
      return Response.json({ detail: 'Not authorized to update this task' }, { status: 403 })
    }
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (newStatus !== undefined) {
    data.status = newStatus
    if (newStatus === 'done') {
      data.completedAt = new Date()
    } else if (newStatus === 'open') {
      data.assignedToId = null
      data.completedAt = null
    }
  }
  if (newAssignedToId !== undefined) data.assignedToId = newAssignedToId

  data.updatedAt = new Date()

  await prisma.projectTask.update({ where: { id: taskId }, data })

  return Response.json({ message: 'Task updated' })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; task_id: string }> }
) {
  const { id: idParam, task_id: taskIdParam } = await params
  const projectId = parseInt(idParam, 10)
  const taskId = parseInt(taskIdParam, 10)
  if (isNaN(projectId) || isNaN(taskId)) {
    return Response.json({ detail: 'Invalid ID' }, { status: 400 })
  }

  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  const isOwner = project.ownerId === volunteer.id
  const isAdmin = volunteer.isAdmin
  if (!isOwner && !isAdmin) {
    return Response.json({ detail: 'Not authorized' }, { status: 403 })
  }

  const deleted = await prisma.projectTask.deleteMany({ where: { id: taskId, projectId } })
  if (deleted.count === 0) {
    return Response.json({ detail: 'Task not found' }, { status: 404 })
  }

  return Response.json({ message: 'Task deleted' })
}
