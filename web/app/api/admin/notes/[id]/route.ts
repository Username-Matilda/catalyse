import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const noteId = parseInt(idParam, 10)
  if (isNaN(noteId)) {
    return Response.json({ detail: 'Invalid note ID' }, { status: 400 })
  }

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const note = await prisma.adminNote.findUnique({ where: { id: noteId } })
  if (!note) {
    return Response.json({ detail: 'Note not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = { updatedAt: new Date() }
  if (body.content !== undefined && body.content !== null) {
    data.content = body.content as string
  }
  if (body.category !== undefined && body.category !== null) {
    data.category = body.category as string
  }

  await prisma.adminNote.update({ where: { id: noteId }, data })

  return Response.json({ message: 'Note updated' })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const noteId = parseInt(idParam, 10)
  if (isNaN(noteId)) {
    return Response.json({ detail: 'Invalid note ID' }, { status: 400 })
  }

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  try {
    await prisma.adminNote.delete({ where: { id: noteId } })
  } catch {
    return Response.json({ detail: 'Note not found' }, { status: 404 })
  }

  return Response.json({ message: 'Note deleted' })
}
