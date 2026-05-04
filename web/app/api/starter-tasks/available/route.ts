import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  const tasks = await prisma.starterTask.findMany({
    where: { status: 'open' },
    include: {
      skill: { include: { category: true } },
      project: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    estimated_hours: t.estimatedHours,
    skill_name: t.skill?.name ?? null,
    skill_category: t.skill?.category?.name ?? null,
    project_title: t.project?.title ?? null,
  })))
}
