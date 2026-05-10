import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'

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
    return Response.json({ detail: 'Only project owner can add updates' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.content || typeof body.content !== 'string' || body.content.length === 0) {
    return Response.json({ detail: 'Content is required' }, { status: 400 })
  }

  const update = await prisma.projectUpdate.create({
    data: { projectId, authorId: volunteer.id, content: body.content as string },
  })

  return Response.json({ id: update.id, message: 'Update added' })
}
