import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { CreateNoteSchema } from '@/lib/schemas'

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
      volunteerId: n.volunteerId,
      authorId: n.authorId,
      content: n.content,
      category: n.category,
      relatedProjectId: n.relatedProjectId,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      authorName: n.author.name,
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

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(CreateNoteSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

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
      content: body.content.trim(),
      category: body.category ?? 'general',
      relatedProjectId: body.relatedProjectId ?? null,
    },
  })

  return Response.json({ id: note.id, message: 'Note added' })
}
