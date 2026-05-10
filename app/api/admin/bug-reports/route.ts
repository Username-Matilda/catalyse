import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const status = request.nextUrl.searchParams.get('status') ?? undefined
  const category = request.nextUrl.searchParams.get('category') ?? undefined

  const reports = await prisma.bugReport.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    },
    include: { reporter: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(
    reports.map((r) => ({
      id: r.id,
      reporter_id: r.reporterId,
      reporter_email: r.reporterEmail,
      title: r.title,
      description: r.description,
      page_url: r.pageUrl,
      category: r.category,
      severity: r.severity,
      status: r.status,
      resolution_notes: r.resolutionNotes,
      resolved_by_id: r.resolvedById,
      resolved_at: r.resolvedAt,
      created_at: r.createdAt,
      reporter_name: r.reporter?.name ?? null,
    })),
  )
}
