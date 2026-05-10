import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const tasks = await prisma.projectTask.findMany({
    where: { projectId },
    include: {
      assignedTo: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  })

  const taskOrder: Record<string, number> = { open: 0, assigned: 1, done: 2 }
  tasks.sort((a, b) => {
    const orderDiff = (taskOrder[a.status] ?? 0) - (taskOrder[b.status] ?? 0)
    if (orderDiff !== 0) return orderDiff
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  })

  return Response.json(tasks.map(t => ({
    id: t.id,
    project_id: t.projectId,
    title: t.title,
    description: t.description,
    assigned_to_id: t.assignedToId,
    assigned_to_name: t.assignedTo?.name ?? null,
    created_by_id: t.createdById,
    created_by_name: t.createdBy?.name ?? null,
    status: t.status,
    completed_at: t.completedAt,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  })))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
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
    return Response.json({ detail: 'Only project owner or admin can create tasks' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    errs.push(fieldError('title', 'Title is required'))
  }
  if (errs.length) return validationError(errs)

  const task = await prisma.$transaction(async tx => {
    const newTask = await tx.projectTask.create({
      data: {
        projectId,
        title: body.title as string,
        description: (body.description as string | null) ?? null,
        createdById: volunteer.id,
      },
    })

    if (project.status === 'needs_tasks') {
      await tx.project.update({
        where: { id: projectId },
        data: { status: 'in_progress' },
      })
    }

    return newTask
  })

  return Response.json({ id: task.id, message: 'Task created' })
}
