import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createProject,
  createQuickTask,
  createSkill,
} from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('admin.volunteers', () => {
  it('getById returns the full admin view of a volunteer', async () => {
    const admin = await createAdmin()
    const c = clientAs(admin)
    await expect(c.admin.volunteers.getById({ id: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    const skill = await createSkill()
    const vol = await createVolunteer({
      skills: { create: [{ skillId: skill.id, proficiencyLevel: 'pro' }] },
    })
    await c.admin.notes.create({ volunteerId: vol.id, content: 'a note' })
    await c.admin.volunteers.addEndorsement({
      volunteerId: vol.id,
      skillId: skill.id,
      notes: 'great',
    })
    const project = await createProject({ assigneeId: vol.id })
    await createQuickTask({ assigneeId: vol.id, skillId: skill.id })
    await createQuickTask({ assigneeId: vol.id })

    const view = await c.admin.volunteers.getById({ id: vol.id })
    expect(view.email).toBe(vol.email)
    expect(view.skills).toEqual([
      expect.objectContaining({ id: skill.id, proficiencyLevel: 'pro' }),
    ])
    expect(view.adminNotes).toEqual([
      expect.objectContaining({ content: 'a note', authorName: admin.name }),
    ])
    expect(view.endorsements).toEqual([
      expect.objectContaining({
        skillName: skill.name,
        endorsedByName: admin.name,
        notes: 'great',
        rating: 'verified',
      }),
    ])
    expect(view.quickTasks.map((t) => t.skillName).sort()).toEqual([null, skill.name].sort())
    expect(view.projectHistory).toEqual([
      expect.objectContaining({ id: project.id, ownerId: vol.id }),
    ])
  })

  it('lists and upserts endorsements', async () => {
    const admin = await createAdmin()
    const c = clientAs(admin)
    const skill = await createSkill()
    const vol = await createVolunteer()
    expect(await c.admin.volunteers.listEndorsements({ volunteerId: vol.id })).toEqual([])
    expect(
      await c.admin.volunteers.addEndorsement({ volunteerId: vol.id, skillId: skill.id }),
    ).toEqual({ message: 'Skill endorsed' })
    await c.admin.volunteers.addEndorsement({
      volunteerId: vol.id,
      skillId: skill.id,
      rating: 'strong',
      source: 'quick_task',
      sourceId: 5,
      notes: 'n',
    })
    const list = await c.admin.volunteers.listEndorsements({ volunteerId: vol.id })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      rating: 'strong',
      source: 'quick_task',
      sourceId: 5,
      notes: 'n',
      skillCategory: expect.any(String),
    })
    expect(await prisma.skillEndorsement.count({ where: { volunteerId: vol.id } })).toBe(1)
  })
})

describe('admin.emailPreview', () => {
  it('lists every registered preview and renders each', async () => {
    const c = clientAs(await createAdmin())
    const { types } = await c.admin.emailPreview.types()
    expect(types.length).toBeGreaterThan(10)
    for (const type of types) {
      const { subject, html } = await c.admin.emailPreview.preview({ type })
      expect(subject).toBeTruthy()
      expect(html).toContain('<!DOCTYPE html>')
    }
    await expect(c.admin.emailPreview.preview({ type: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
