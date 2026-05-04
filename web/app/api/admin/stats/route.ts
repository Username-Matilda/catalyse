import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const [
    totalVolunteers,
    volunteersThisMonth,
    totalProjects,
    pendingReviewProjects,
    seekingProjects,
    inProgressProjects,
    completedProjects,
    totalInterests,
    pendingInterests,
  ] = await Promise.all([
    prisma.volunteer.count({ where: { deletedAt: null } }),
    prisma.volunteer.count({
      where: {
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
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
