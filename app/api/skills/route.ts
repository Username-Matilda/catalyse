import { prisma } from '@/lib/prisma'

export async function GET() {
  const categories = await prisma.skillCategory.findMany({
    include: {
      skills: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { sortOrder: 'asc' },
  })

  return Response.json(
    categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      sortOrder: cat.sortOrder,
      createdAt: cat.createdAt,
      skills: cat.skills.map((s) => ({
        id: s.id,
        categoryId: s.categoryId,
        name: s.name,
        description: s.description,
        sortOrder: s.sortOrder,
        createdAt: s.createdAt,
      })),
    })),
  )
}
