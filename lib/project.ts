import { Prisma } from '@/generated/prisma/client'
import { calculateMatchScore } from './matching'
import { prisma } from './prisma'

export type ProjectSkillWithRelations = {
  skillId: number
  isRequired: boolean | null
  skill: {
    id: number
    categoryId: number
    name: string
    description: string | null
    sortOrder: number | null
    createdAt: Date | null
    category: { name: string }
  }
}


export type EnrichedProject = {
  id: number
  title: string
  description: string
  status: string
  ownerId: number | null
  proposedById: number | null
  isOrgProposed: boolean | null
  projectType: string | null
  estimatedDuration: string | null
  timeCommitmentHoursPerWeek: number | null
  urgency: string | null
  reviewNotes: string | null
  reviewedById: number | null
  reviewedAt: Date | null
  feedbackToProposer: string | null
  collaborationLink: string | null
  outcome: string | null
  outcomeNotes: string | null
  completedAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
  country: string | null
  isSeekingHelp: boolean | null
  isSeekingOwner: boolean | null
  localGroup: string | null
  skills: ProjectSkillWithRelations[]
  owner: { id: number; name: string } | null
  proposedBy: { id: number; name: string } | null
  _count: { interests: number }
}

export function withProjectExtras(p: EnrichedProject, volunteerSkillIds?: Set<number>) {
  const matchInput = p.skills.map((ps) => ({ id: ps.skillId, isRequired: ps.isRequired }))
  const match =
    volunteerSkillIds !== undefined ? calculateMatchScore(volunteerSkillIds, matchInput) : undefined

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    ownerId: p.ownerId,
    proposedById: p.proposedById,
    isOrgProposed: p.isOrgProposed,
    projectType: p.projectType,
    estimatedDuration: p.estimatedDuration,
    timeCommitmentHoursPerWeek: p.timeCommitmentHoursPerWeek,
    urgency: p.urgency,
    reviewNotes: p.reviewNotes,
    reviewedById: p.reviewedById,
    reviewedAt: p.reviewedAt,
    feedbackToProposer: p.feedbackToProposer,
    collaborationLink: p.collaborationLink,
    outcome: p.outcome,
    outcomeNotes: p.outcomeNotes,
    completedAt: p.completedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    country: p.country,
    isSeekingHelp: p.isSeekingHelp,
    isSeekingOwner: p.isSeekingOwner,
    localGroup: p.localGroup,
    skills: p.skills.map((ps) => ({
      id: ps.skill.id,
      categoryId: ps.skill.categoryId,
      name: ps.skill.name,
      description: ps.skill.description,
      sortOrder: ps.skill.sortOrder,
      createdAt: ps.skill.createdAt,
      categoryName: ps.skill.category.name,
      isRequired: ps.isRequired,
    })),
    owner: p.owner,
    proposedBy: p.proposedBy,
    pendingInterestCount: p._count.interests,
    ...(match !== undefined ? { match } : {}),
  }
}

export const projectInclude = {
  skills: {
    include: { skill: { include: { category: true } } },
    orderBy: [
      { isRequired: Prisma.SortOrder.desc },
      { skill: { category: { sortOrder: Prisma.SortOrder.asc } } },
      { skill: { sortOrder: Prisma.SortOrder.asc } },
    ],
  },
  owner: { select: { id: true, name: true } },
  proposedBy: { select: { id: true, name: true } },
  _count: { select: { interests: { where: { status: 'pending' } } } },
} satisfies Prisma.ProjectInclude

export async function createNotification(
  volunteerId: number,
  type: string,
  title: string,
  body?: string | null,
  link?: string | null,
) {
  return prisma.notification.create({
    data: { volunteerId, type, title, body: body ?? null, link: link ?? null },
  })
}
