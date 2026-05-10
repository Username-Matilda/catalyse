import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const volunteerId = parseInt(idParam, 10)
  if (isNaN(volunteerId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const notes = await prisma.adminNote.findMany({
    where: { volunteerId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(
    notes.map((n) => ({
      id: n.id,
      volunteer_id: n.volunteerId,
      author_id: n.authorId,
      content: n.content,
      category: n.category,
      related_project_id: n.relatedProjectId,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      author_name: n.author.name,
    })),
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
    errs.push(fieldError('content', 'Content is required'))
  }
  if (errs.length) return validationError(errs)

  const target = await prisma.volunteer.findUnique({
    where: { id: volunteerId },
    select: { id: true },
  })
  if (!target) {
    return Response.json({ detail: 'Volunteer not found' }, { status: 404 })
  }

  const note = await prisma.adminNote.create({
    data: {
      volunteerId,
      authorId: admin.id,
      content: (body.content as string).trim(),
      category: (body.category as string) || 'general',
      relatedProjectId: (body.related_project_id as number | null) ?? null,
    },
  })

  return Response.json({ id: note.id, message: 'Note added' })
}
