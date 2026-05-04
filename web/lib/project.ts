import { Prisma } from '@/app/generated/prisma/client'
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

export function serializeProjectSkill(ps: ProjectSkillWithRelations) {
  return {
    id: ps.skill.id,
    category_id: ps.skill.categoryId,
    name: ps.skill.name,
    description: ps.skill.description,
    sort_order: ps.skill.sortOrder,
    created_at: ps.skill.createdAt,
    category_name: ps.skill.category.name,
    is_required: ps.isRequired,
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

export function serializeProject(p: EnrichedProject, volunteerSkillIds?: Set<number>) {
  const matchInput = p.skills.map(ps => ({ id: ps.skillId, isRequired: ps.isRequired }))
  const match = volunteerSkillIds !== undefined
    ? calculateMatchScore(volunteerSkillIds, matchInput)
    : undefined

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    owner_id: p.ownerId,
    proposed_by_id: p.proposedById,
    is_org_proposed: p.isOrgProposed,
    project_type: p.projectType,
    estimated_duration: p.estimatedDuration,
    time_commitment_hours_per_week: p.timeCommitmentHoursPerWeek,
    urgency: p.urgency,
    review_notes: p.reviewNotes,
    reviewed_by_id: p.reviewedById,
    reviewed_at: p.reviewedAt,
    feedback_to_proposer: p.feedbackToProposer,
    collaboration_link: p.collaborationLink,
    outcome: p.outcome,
    outcome_notes: p.outcomeNotes,
    completed_at: p.completedAt,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    country: p.country,
    is_seeking_help: p.isSeekingHelp,
    is_seeking_owner: p.isSeekingOwner,
    local_group: p.localGroup,
    skills: p.skills.map(serializeProjectSkill),
    owner: p.owner,
    proposed_by: p.proposedBy,
    pending_interest_count: p._count.interests,
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
  link?: string | null
) {
  return prisma.notification.create({
    data: { volunteerId, type, title, body: body ?? null, link: link ?? null },
  })
}

const URGENCY_ORDER: Record<string, number> = { high: 1, medium: 2, low: 3 }

export function sortProjects<T extends {
  is_seeking_help: boolean | null
  is_seeking_owner: boolean | null
  urgency: string | null
  created_at: Date | null | string
}>(projects: T[]): T[] {
  return [...projects].sort((a, b) => {
    const seekA = a.is_seeking_help || a.is_seeking_owner ? 0 : 1
    const seekB = b.is_seeking_help || b.is_seeking_owner ? 0 : 1
    if (seekA !== seekB) return seekA - seekB
    const uA = URGENCY_ORDER[a.urgency ?? ''] ?? 3
    const uB = URGENCY_ORDER[b.urgency ?? ''] ?? 3
    if (uA !== uB) return uA - uB
    const tA = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at ?? 0).getTime()
    const tB = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at ?? 0).getTime()
    return tB - tA
  })
}
