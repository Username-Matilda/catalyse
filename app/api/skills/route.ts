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
      sort_order: cat.sortOrder,
      created_at: cat.createdAt,
      skills: cat.skills.map((s) => ({
        id: s.id,
        category_id: s.categoryId,
        name: s.name,
        description: s.description,
        sort_order: s.sortOrder,
        created_at: s.createdAt,
      })),
    })),
  )
}
