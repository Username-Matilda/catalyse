import { prisma } from '@/lib/prisma'

export async function GET() {
  const tasks = await prisma.starterTask.findMany({
    where: { status: 'open' },
    include: {
      skill: { include: { category: true } },
      project: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      estimatedHours: t.estimatedHours,
      skillName: t.skill?.name ?? null,
      skillCategory: t.skill?.category?.name ?? null,
      projectTitle: t.project?.title ?? null,
    })),
  )
}
