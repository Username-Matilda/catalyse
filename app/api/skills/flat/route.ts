import { prisma } from '@/lib/prisma'

export async function GET() {
  const skills = await prisma.skill.findMany({
    include: { category: true },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  })

  return Response.json(
    skills.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      name: s.name,
      description: s.description,
      sortOrder: s.sortOrder,
      createdAt: s.createdAt,
      categoryName: s.category.name,
    })),
  )
}
