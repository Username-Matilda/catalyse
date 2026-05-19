import { prisma } from '@/lib/prisma'
import { withProjectExtras, projectInclude, EnrichedProject } from '@/lib/project'
import { adminProcedure } from '../../procedures'
import { ProjectStatus } from '@/generated/prisma/enums'

export const adminTriageRouter = {
  list: adminProcedure.handler(async () => {
    const projects = await prisma.project.findMany({
      where: { status: { in: [ProjectStatus.pending_review, ProjectStatus.needs_discussion] } },
      include: projectInclude,
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((p) => withProjectExtras(p as EnrichedProject))
  }),
}
