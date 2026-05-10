import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { serializeProject, projectInclude, EnrichedProject } from '@/lib/project'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const projects = await prisma.project.findMany({
    where: { status: { in: ['pending_review', 'needs_discussion'] } },
    include: projectInclude,
    orderBy: { createdAt: 'asc' },
  })

  return Response.json(projects.map((p) => serializeProject(p as EnrichedProject)))
}
