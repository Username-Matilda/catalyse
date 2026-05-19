import { prisma } from '@/lib/prisma'
import { adminProcedure } from '../../procedures'

export const adminStatsRouter = {
  get: adminProcedure.handler(async () => {
    const [
      totalVolunteers,
      [{ count: volunteersThisMonthRaw }],
      totalProjects,
      pendingReviewProjects,
      seekingProjects,
      inProgressProjects,
      completedProjects,
      totalInterests,
      pendingInterests,
    ] = await Promise.all([
      prisma.volunteer.count({ where: { deletedAt: null } }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM volunteers
        WHERE deleted_at IS NULL AND created_at >= date('now', '-30 days')
      `,
      prisma.project.count(),
      prisma.project.count({ where: { status: 'pending_review' } }),
      prisma.project.count({
        where: { OR: [{ isSeekingHelp: true }, { isSeekingOwner: true }] },
      }),
      prisma.project.count({ where: { status: 'in_progress' } }),
      prisma.project.count({ where: { status: 'completed' } }),
      prisma.projectInterest.count(),
      prisma.projectInterest.count({ where: { status: 'pending' } }),
    ])

    return {
      volunteers: { total: totalVolunteers, thisMonth: Number(volunteersThisMonthRaw) },
      projects: {
        total: totalProjects,
        pendingReview: pendingReviewProjects,
        seekingHelp: seekingProjects,
        inProgress: inProgressProjects,
        completed: completedProjects,
      },
      interests: { total: totalInterests, pending: pendingInterests },
    }
  }),
}
