import { prisma } from '@/lib/prisma'
import { serializeProject, projectInclude, EnrichedProject } from '@/lib/project'
import { adminProcedure } from '../../procedures'

export const adminTriageRouter = {
  list: adminProcedure.handler(async () => {
    const projects = await prisma.project.findMany({
      where: { status: { in: ['pending_review', 'needs_discussion'] } },
      include: projectInclude,
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((p) => serializeProject(p as EnrichedProject))
  }),
}
