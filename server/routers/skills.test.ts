import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { anon } from '@/test/rpc'

describe('skills.list', () => {
  it('returns categories with their skills ordered by sortOrder', async () => {
    // The migrations seed a skill catalogue; put ours at the top of the order to find it.
    const cat = await prisma.skillCategory.create({
      data: { name: 'Zeta', description: 'Visual things', sortOrder: -2 },
    })
    await prisma.skillCategory.create({ data: { name: 'Alpha', sortOrder: -1 } })
    await prisma.skill.create({ data: { name: 'Figma', categoryId: cat.id, sortOrder: 2 } })
    await prisma.skill.create({ data: { name: 'Illustration', categoryId: cat.id, sortOrder: 1 } })

    const result = await anon().skills.list()

    expect(result.slice(0, 2).map((c) => c.name)).toEqual(['Zeta', 'Alpha'])
    expect(result[0].skills.map((s) => s.name)).toEqual(['Illustration', 'Figma'])
    expect(result[0]).toMatchObject({ description: 'Visual things', sortOrder: -2 })
    expect(result[0].skills[0]).toMatchObject({ categoryId: cat.id, description: null })
  })
})
