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

  return Response.json(tasks.map(t => ({
    id: t.id,
    project_id: t.projectId,
    title: t.title,
    description: t.description,
    skill_id: t.skillId,
    skill_name: t.skill?.name ?? null,
    skill_category: t.skill?.category?.name ?? null,
    project_title: t.project?.title ?? null,
    assigned_to_id: t.assignedToId,
    assigned_to_name: t.assignedTo?.name ?? null,
    assigned_by_id: t.assignedById,
    status: t.status,
    review_rating: t.reviewRating,
    review_notes: t.reviewNotes,
    feedback_to_volunteer: t.feedbackToVolunteer,
    reviewed_by_id: t.reviewedById,
    reviewed_by_name: t.reviewedBy?.name ?? null,
    reviewed_at: t.reviewedAt,
    estimated_hours: t.estimatedHours,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  })))
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
  if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
    errs.push(fieldError('description', 'Description is required'))
  }
  if (errs.length) return validationError(errs)

  const task = await prisma.starterTask.create({
    data: {
      title: body.title as string,
      description: body.description as string,
      skillId: (body.skill_id as number | null) ?? null,
      projectId: (body.project_id as number | null) ?? null,
      estimatedHours: (body.estimated_hours as number | null) ?? null,
    },
  })

  return Response.json({ id: task.id, message: 'Starter task created' })
}
