import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const reportId = parseInt(idParam, 10)
  if (isNaN(reportId)) {
    return Response.json({ detail: 'Invalid report ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const report = await prisma.bugReport.findUnique({ where: { id: reportId } })
  if (!report) {
    return Response.json({ detail: 'Bug report not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}

  if (body.status) {
    data.status = body.status as string
    if ((body.status as string) === 'resolved' || (body.status as string) === 'wont_fix') {
      data.resolvedById = admin.id
      data.resolvedAt = new Date()
    }
  }

  if (body.resolution_notes !== undefined) {
    data.resolutionNotes = body.resolution_notes as string | null
  }

  if (Object.keys(data).length > 0) {
    await prisma.bugReport.update({ where: { id: reportId }, data })
  }

  return Response.json({ message: 'Bug report updated' })
}
