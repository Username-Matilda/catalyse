import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createAdmin, createQuickTask } from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('admin.skillCategories', () => {
  it('creates (auto-sorting to the end), lists with counts, updates, reorders and deletes', async () => {
    const c = clientAs(await createAdmin())
    const a = await c.admin.skillCategories.create({ name: 'Cat A' })
    const b = await c.admin.skillCategories.create({
      name: 'Cat B',
      description: 'desc',
      sortOrder: -5,
    })
    expect(a.sortOrder).toBeGreaterThan(0)
    expect(b.sortOrder).toBe(-5)

    const list = await c.admin.skillCategories.list()
    expect(list[0]).toMatchObject({ id: b.id, description: 'desc', skillCount: 0 })

    expect(
      await c.admin.skillCategories.update({
        id: a.id,
        name: '  Cat A2 ',
        description: null,
        sortOrder: 3,
      }),
    ).toEqual({ success: true })
    await c.admin.skillCategories.update({ id: a.id })
    expect(await prisma.skillCategory.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      name: 'Cat A2',
      sortOrder: 3,
    })
    await expect(c.admin.skillCategories.update({ id: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    expect(
      await c.admin.skillCategories.reorder([
        { id: a.id, sortOrder: -2 },
        { id: b.id, sortOrder: -1 },
      ]),
    ).toEqual({ success: true })
    expect((await c.admin.skillCategories.list()).slice(0, 2).map((x) => x.id)).toEqual([
      a.id,
      b.id,
    ])

    await prisma.skill.create({ data: { name: 'S', categoryId: a.id } })
    await expect(c.admin.skillCategories.delete({ id: a.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Cannot delete category with 1 skills. Move or delete skills first.',
    })
    expect(await c.admin.skillCategories.delete({ id: b.id })).toEqual({ success: true })
    await expect(c.admin.skillCategories.delete({ id: b.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('admin.skills', () => {
  it('creates within a category, updates, moves category, reorders and deletes', async () => {
    const c = clientAs(await createAdmin())
    const cat = await prisma.skillCategory.create({ data: { name: 'C1' } })
    const cat2 = await prisma.skillCategory.create({ data: { name: 'C2' } })
    await expect(c.admin.skills.create({ name: 'x', categoryId: 999_999 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const s1 = await c.admin.skills.create({ name: 'S1', categoryId: cat.id })
    const s2 = await c.admin.skills.create({
      name: 'S2',
      categoryId: cat.id,
      description: 'd',
      sortOrder: 9,
    })
    expect((await prisma.skill.findUniqueOrThrow({ where: { id: s1.id } })).sortOrder).toBe(1)
    expect((await prisma.skill.findUniqueOrThrow({ where: { id: s2.id } })).sortOrder).toBe(9)

    await expect(c.admin.skills.update({ id: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(c.admin.skills.update({ id: s1.id, categoryId: 999_999 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(
      await c.admin.skills.update({
        id: s1.id,
        name: ' S1b ',
        description: null,
        sortOrder: 4,
        categoryId: cat2.id,
      }),
    ).toEqual({ success: true })
    expect(await prisma.skill.findUniqueOrThrow({ where: { id: s1.id } })).toMatchObject({
      name: 'S1b',
      sortOrder: 4,
      categoryId: cat2.id,
    })

    expect(await c.admin.skills.reorder([{ id: s1.id, sortOrder: 2 }])).toEqual({ success: true })

    const qt = await createQuickTask({ skillId: s2.id })
    expect(await c.admin.skills.delete({ id: s2.id })).toEqual({
      success: true,
      deletedSkill: { id: s2.id, name: 'S2' },
    })
    expect((await prisma.workItem.findUniqueOrThrow({ where: { id: qt.id } })).skillId).toBeNull()
    await expect(c.admin.skills.delete({ id: s2.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
