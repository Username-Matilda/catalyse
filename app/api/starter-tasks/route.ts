import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const skillIdParam = searchParams.get('skill_id')
  const skillId = skillIdParam ? parseInt(skillIdParam, 10) : null

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (skillId && !isNaN(skillId)) where.skillId = skillId

  const tasks = await prisma.starterTask.findMany({
    where,
    include: {
      skill: { include: { category: true } },
      project: { select: { title: true } },
      assignedTo: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(
    tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      description: t.description,
      skillId: t.skillId,
      skillName: t.skill?.name ?? null,
      skillCategory: t.skill?.category?.name ?? null,
      projectTitle: t.project?.title ?? null,
      assignedToId: t.assignedToId,
      assignedToName: t.assignedTo?.name ?? null,
      assignedById: t.assignedById,
      status: t.status,
      reviewRating: t.reviewRating,
      reviewNotes: t.reviewNotes,
      feedbackToVolunteer: t.feedbackToVolunteer,
      reviewedById: t.reviewedById,
      reviewedByName: t.reviewedBy?.name ?? null,
      reviewedAt: t.reviewedAt,
      estimatedHours: t.estimatedHours,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  )
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

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
  if (
    !body.description ||
    typeof body.description !== 'string' ||
    body.description.trim().length === 0
  ) {
    errs.push(fieldError('description', 'Description is required'))
  }
  if (errs.length) return validationError(errs)

  const task = await prisma.starterTask.create({
    data: {
      title: body.title as string,
      description: body.description as string,
      skillId: (body.skillId as number | null) ?? null,
      projectId: (body.projectId as number | null) ?? null,
      estimatedHours: (body.estimatedHours as number | null) ?? null,
    },
  })

  return Response.json({ id: task.id, message: 'Starter task created' })
}
