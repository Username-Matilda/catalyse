import { prisma } from './prisma'
import { sendDigestEmail, isEmailConfigured } from './email'
import { WorkItemType } from '@/generated/prisma/enums'

// Emails volunteers who asked for immediate skill-match alerts (emailDigest: 'match')
// as soon as a project they're a fit for goes live — either an admin approves a
// volunteer-proposed project, or an admin publishes an org-proposed one directly.
export async function notifyMatchingVolunteers(projectId: number): Promise<void> {
  if (!isEmailConfigured()) return

  const project = await prisma.workItem.findFirst({
    where: { id: projectId, type: WorkItemType.PROJECT },
    include: { skills: { include: { skill: true } } },
  })
  if (!project) return

  const requiredSkillIds = project.skills.filter((ps) => ps.isRequired).map((ps) => ps.skillId)
  if (!requiredSkillIds.length) return

  const volunteers = await prisma.volunteer.findMany({
    where: {
      emailDigest: 'match',
      email: { not: null },
      deletedAt: null,
      skills: { some: { skillId: { in: requiredSkillIds } } },
    },
    include: { skills: true },
  })
  if (!volunteers.length) return

  const skillNames = project.skills.map((ps) => ps.skill.name)

  await Promise.all(
    volunteers.map((vol) => {
      const volSkillIds = new Set(vol.skills.map((vs) => vs.skillId))
      const matched = requiredSkillIds.filter((id) => volSkillIds.has(id)).length
      const match_percent = Math.round((matched / requiredSkillIds.length) * 100)
      return sendDigestEmail({
        to: vol.email!,
        name: vol.name,
        projects: [
          {
            id: project.id,
            title: project.title,
            description: project.description ?? '',
            skill_names: skillNames,
            match_percent,
          },
        ],
        isMatch: true,
      }).catch((e) => console.error('[MATCH NOTIFY ERROR]', e))
    }),
  )
}
