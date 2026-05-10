import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const volunteerId = parseInt(idParam, 10)
  if (isNaN(volunteerId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const endorsements = await prisma.skillEndorsement.findMany({
    where: { volunteerId },
    include: {
      skill: { include: { category: true } },
      endorsedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(
    endorsements.map(e => ({
      id: e.id,
      volunteer_id: e.volunteerId,
      skill_id: e.skillId,
      endorsed_by_id: e.endorsedById,
      source: e.source,
      source_id: e.sourceId,
      rating: e.rating,
      notes: e.notes,
      created_at: e.createdAt,
      skill_name: e.skill.name,
      skill_category: e.skill.category.name,
      endorsed_by_name: e.endorsedBy.name,
    }))
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const volunteerId = parseInt(idParam, 10)
  if (isNaN(volunteerId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.skill_id || typeof body.skill_id !== 'number') {
    errs.push(fieldError('skill_id', 'skill_id is required'))
  }
  if (errs.length) return validationError(errs)

  const skillId = body.skill_id as number
  const rating = (body.rating as string) || 'verified'
  const source = (body.source as string) || 'direct_observation'
  const sourceId = (body.source_id as number | null) ?? null
  const notes = (body.notes as string | null) ?? null

  await prisma.skillEndorsement.upsert({
    where: {
      volunteerId_skillId_endorsedById: {
        volunteerId,
        skillId,
        endorsedById: admin.id,
      },
    },
    update: { rating, source, sourceId, notes },
    create: {
      volunteerId,
      skillId,
      endorsedById: admin.id,
      rating,
      source,
      sourceId,
      notes,
    },
  })

  return Response.json({ message: 'Skill endorsed' })
}
