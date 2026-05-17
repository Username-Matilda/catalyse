import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { CreateStarterTaskSchema } from '@/lib/schemas'

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

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(CreateStarterTaskSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const task = await prisma.starterTask.create({
    data: {
      title: body.title,
      description: body.description,
      skillId: body.skillId ?? null,
      projectId: body.projectId ?? null,
      estimatedHours: body.estimatedHours ?? null,
    },
  })

  return Response.json({ id: task.id, message: 'Starter task created' })
}
