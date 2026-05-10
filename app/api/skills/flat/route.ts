import { prisma } from '@/lib/prisma'

export async function GET() {
  const skills = await prisma.skill.findMany({
    include: { category: true },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  })

  return Response.json(
    skills.map(s => ({
      id: s.id,
      category_id: s.categoryId,
      name: s.name,
      description: s.description,
      sort_order: s.sortOrder,
      created_at: s.createdAt,
      category_name: s.category.name,
    }))
  )
}
