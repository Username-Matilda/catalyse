import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin, createTeam, createSkill } from '@/test/factories'
import { clientAs } from '@/test/rpc'

/**
 * Postgres lets writers interleave, so two requests racing on the same unique key are a
 * real state — SQLite serialised them. Both sides of each race must succeed and leave one row.
 */
describe('concurrent upserts', () => {
  it('assignMember twice at once leaves one membership', async () => {
    const admin = await createAdmin()
    const team = await createTeam()
    const vol = await createVolunteer()
    const c = clientAs(admin)
    await Promise.all([
      c.teams.assignMember({ teamId: team.id, volunteerId: vol.id }),
      c.teams.assignMember({ teamId: team.id, volunteerId: vol.id, role: 'leader' }),
    ])
    expect(await prisma.teamMembership.count({ where: { teamId: team.id } })).toBe(1)
  })

  it('addEndorsement twice at once leaves one endorsement', async () => {
    const admin = await createAdmin()
    const vol = await createVolunteer()
    const skill = await createSkill()
    const c = clientAs(admin)
    await Promise.all([
      c.admin.volunteers.addEndorsement({ volunteerId: vol.id, skillId: skill.id }),
      c.admin.volunteers.addEndorsement({
        volunteerId: vol.id,
        skillId: skill.id,
        rating: 'strong',
      }),
    ])
    expect(await prisma.skillEndorsement.count({ where: { volunteerId: vol.id } })).toBe(1)
  })
})

describe('enum columns', () => {
  it('reject values outside the enum at the database', async () => {
    const vol = await createVolunteer()
    const skill = await createSkill()
    await expect(
      prisma.$executeRaw`INSERT INTO skill_endorsements (volunteer_id, skill_id, endorsed_by_id, rating)
        VALUES (${vol.id}, ${skill.id}, ${vol.id}, 'excellent'::"SkillEndorsementRating")`,
    ).rejects.toThrow()
    await expect(
      prisma.$executeRaw`INSERT INTO skill_endorsements (volunteer_id, skill_id, endorsed_by_id, source)
        VALUES (${vol.id}, ${skill.id}, ${vol.id}, 'starter_task'::"SkillEndorsementSource")`,
    ).rejects.toThrow()
  })
})
