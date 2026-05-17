import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { UpdateBugReportSchema } from '@/lib/schemas'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const reportId = parseInt(idParam, 10)
  if (isNaN(reportId)) {
    return Response.json({ detail: 'Invalid report ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(UpdateBugReportSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const report = await prisma.bugReport.findUnique({ where: { id: reportId } })
  if (!report) {
    return Response.json({ detail: 'Bug report not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}

  if (body.status) {
    data.status = body.status
    if (body.status === 'resolved' || body.status === 'wont_fix') {
      data.resolvedById = admin.id
      data.resolvedAt = new Date()
    }
  }

  if (body.resolutionNotes !== undefined) {
    data.resolutionNotes = body.resolutionNotes
  }

  if (Object.keys(data).length > 0) {
    await prisma.bugReport.update({ where: { id: reportId }, data })
  }

  return Response.json({ message: 'Bug report updated' })
}
