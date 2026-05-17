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
      reporterId: r.reporterId,
      reporterEmail: r.reporterEmail,
      title: r.title,
      description: r.description,
      pageUrl: r.pageUrl,
      category: r.category,
      severity: r.severity,
      status: r.status,
      resolutionNotes: r.resolutionNotes,
      resolvedById: r.resolvedById,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
      reporterName: r.reporter?.name ?? null,
    })),
  )
}
