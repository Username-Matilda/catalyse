import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

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
    // Use raw query to match SQLite's space-separated date format; Prisma passes
    // ISO timestamps with "T" which compares incorrectly against stored dates.
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

  const volunteersThisMonth = Number(volunteersThisMonthRaw)

  return Response.json({
    volunteers: { total: totalVolunteers, this_month: volunteersThisMonth },
    projects: {
      total: totalProjects,
      pending_review: pendingReviewProjects,
      seeking_help: seekingProjects,
      in_progress: inProgressProjects,
      completed: completedProjects,
    },
    interests: { total: totalInterests, pending: pendingInterests },
  })
}
