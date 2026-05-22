import { prisma } from '@/lib/prisma'
import { withProjectExtras, projectInclude, EnrichedProject } from '@/lib/work-item'
import { adminProcedure } from '../../procedures'
import { ProjectStatus, WorkItemType } from '@/generated/prisma/enums'

export const adminTriageRouter = {
  list: adminProcedure.handler(async () => {
    const projects = await prisma.workItem.findMany({
      where: {
        type: WorkItemType.PROJECT,
        status: { in: [ProjectStatus.pending_review, ProjectStatus.needs_discussion] },
      },
      include: projectInclude,
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((p) => withProjectExtras(p as EnrichedProject))
  }),
}
