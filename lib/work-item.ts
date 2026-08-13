import { Prisma } from '@/generated/prisma/client'
import { calculateMatchScore } from './matching'
import {
  InterestStatus,
  ProjectStatus,
  QuickTaskStatus,
  RemoteEligibility,
  WorkItemType,
} from '@/generated/prisma/enums'

// ── Comment access ────────────────────────────────────────────────────────────
// Reading a work item's comment thread is gated identically to viewing the work
// item itself. Posting is restricted to participants.

export type WorkItemForAccess = {
  type: string
  status: string
  creatorId: number | null
  assigneeId: number | null
}

export type CommentViewer = { id: number; isAdmin: boolean; isApproved: boolean } | null

const PROJECT_HIDDEN_STATUSES: string[] = [
  ProjectStatus.pending_review,
  ProjectStatus.needs_discussion,
]

// A volunteer the owner declined, or who withdrew themselves, is no longer a contributor
// on that project: they cannot self-claim its tasks and its tasks are hidden from their
// Quick Tasks browse list. An owner or admin can still assign them a task explicitly.
export const CLAIM_BLOCKING_INTEREST_STATUSES: InterestStatus[] = [
  InterestStatus.declined,
  InterestStatus.withdrawn,
]

/**
 * Can `viewer` see this work item (and therefore its comment thread)?
 * For TASK, pass the parent PROJECT — task visibility follows the project.
 */
export function canViewWorkItem(
  item: WorkItemForAccess,
  viewer: CommentViewer,
  parent?: WorkItemForAccess | null,
): boolean {
  switch (item.type) {
    case WorkItemType.PROJECT:
      if (!PROJECT_HIDDEN_STATUSES.includes(item.status)) return true
      return Boolean(viewer && (viewer.isAdmin || viewer.id === item.creatorId))
    case WorkItemType.TASK:
      return parent ? canViewWorkItem(parent, viewer) : Boolean(viewer?.isAdmin)
    case WorkItemType.QUICK_TASK:
      // Open, unclaimed tasks are browsable by any approved volunteer before they claim one —
      // but not by a pending applicant, same as the approvedProcedure gate on the pages that
      // read/claim tasks directly.
      if (item.status === QuickTaskStatus.open && item.assigneeId === null) {
        return Boolean(viewer && (viewer.isAdmin || viewer.isApproved))
      }
      return Boolean(
        viewer && (viewer.isAdmin || viewer.id === item.assigneeId || viewer.id === item.creatorId),
      )
    default:
      return Boolean(viewer?.isAdmin)
  }
}

/**
 * Can `viewer` post a comment? Participants only.
 * `isAcceptedHelper` = viewer has an accepted WorkItemInterest on the project
 * (for TASK, on the parent project). The caller resolves it.
 */
export function canPostComment(
  item: WorkItemForAccess,
  viewer: { id: number; isAdmin: boolean },
  opts: { parent?: WorkItemForAccess | null; isAcceptedHelper?: boolean } = {},
): boolean {
  if (viewer.isAdmin) return true
  switch (item.type) {
    case WorkItemType.PROJECT:
      return (
        viewer.id === item.creatorId ||
        viewer.id === item.assigneeId ||
        Boolean(opts.isAcceptedHelper)
      )
    case WorkItemType.TASK:
      return (
        viewer.id === item.assigneeId ||
        viewer.id === (opts.parent?.assigneeId ?? null) ||
        Boolean(opts.isAcceptedHelper)
      )
    case WorkItemType.QUICK_TASK:
      return viewer.id === item.assigneeId
    default:
      return false
  }
}

export type WorkItemSkillWithRelations = {
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
  description: string | null
  status: string
  assigneeId: number | null
  creatorId: number | null
  stakeholderId: number | null
  isOrgProposed: boolean | null
  projectType: string | null
  estimatedDuration: string | null
  timeCommitmentHoursPerWeek: number | null
  urgency: string | null
  reviewNotes: string | null
  reviewedById: number | null
  reviewedAt: Date | null
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
  remoteEligibility: RemoteEligibility
  skills: WorkItemSkillWithRelations[]
  assignee: { id: number; name: string } | null
  creator: { id: number; name: string } | null
  _count: { interests: number }
}

// The serialized view keeps the public field names `owner`/`proposedBy`
// (mapped from the WorkItem `assignee`/`creator` columns) so the ProjectCard
// contract and all consuming pages stay stable.

export function withProjectExtras(p: EnrichedProject, volunteerSkillIds?: Set<number>) {
  const matchInput = p.skills.map((ps) => ({ id: ps.skillId, isRequired: ps.isRequired }))
  const match =
    volunteerSkillIds !== undefined ? calculateMatchScore(volunteerSkillIds, matchInput) : undefined

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    ownerId: p.assigneeId,
    proposedById: p.creatorId,
    stakeholderId: p.stakeholderId,
    isOrgProposed: p.isOrgProposed,
    projectType: p.projectType,
    estimatedDuration: p.estimatedDuration,
    timeCommitmentHoursPerWeek: p.timeCommitmentHoursPerWeek,
    urgency: p.urgency,
    reviewNotes: p.reviewNotes,
    reviewedById: p.reviewedById,
    reviewedAt: p.reviewedAt,
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
    remoteEligibility: p.remoteEligibility,
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
    owner: p.assignee,
    proposedBy: p.creator,
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
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  _count: { select: { interests: { where: { status: InterestStatus.pending } } } },
} satisfies Prisma.WorkItemInclude
