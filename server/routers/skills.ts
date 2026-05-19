import { prisma } from '@/lib/prisma'
import { publicProcedure } from '../procedures'

export const skillsRouter = {
  list: publicProcedure.handler(async () => {
    const categories = await prisma.skillCategory.findMany({
      include: {
        skills: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return categories.map((cat) => ({
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
    }))
  }),

  flat: publicProcedure.handler(async () => {
    const skills = await prisma.skill.findMany({
      include: { category: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    })
    return skills.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      categoryName: s.category.name,
      name: s.name,
      description: s.description,
      sortOrder: s.sortOrder,
      createdAt: s.createdAt,
    }))
  }),
}
