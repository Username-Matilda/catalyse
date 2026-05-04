import { NextRequest } from 'next/server'
import { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { calculateMatchScore } from '@/lib/matching'

type ProjectSkillWithRelations = {
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

function serializeProjectSkill(ps: ProjectSkillWithRelations) {
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

type EnrichedProject = {
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

function serializeProject(p: EnrichedProject, volunteerSkillIds?: Set<number>) {
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

const projectInclude = {
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

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  const volunteerWithSkills = await prisma.volunteer.findUnique({
    where: { id: volunteer.id },
    select: { skills: { select: { skillId: true } } },
  })
  const volunteerSkillIds = new Set(
    (volunteerWithSkills?.skills ?? []).map(s => s.skillId)
  )

  const alreadyInterestedProjects = await prisma.projectInterest.findMany({
    where: { volunteerId: volunteer.id },
    select: { projectId: true },
  })
  const interestedProjectIds = alreadyInterestedProjects.map(i => i.projectId)

  const [ownedProjects, proposedProjects, myInterests, suggestedProjects, unreadCount] =
    await Promise.all([
      prisma.project.findMany({
        where: { ownerId: volunteer.id },
        orderBy: { updatedAt: 'desc' },
        include: projectInclude,
      }),

      prisma.project.findMany({
        where: {
          proposedById: volunteer.id,
          OR: [{ ownerId: null }, { ownerId: { not: volunteer.id } }],
        },
        orderBy: { createdAt: 'desc' },
        include: projectInclude,
      }),

      prisma.projectInterest.findMany({
        where: { volunteerId: volunteer.id },
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { title: true, status: true } },
        },
      }),

      volunteerSkillIds.size > 0
        ? prisma.project.findMany({
            where: {
              skills: { some: { skillId: { in: [...volunteerSkillIds] } } },
              OR: [
                { isSeekingHelp: true },
                { isSeekingOwner: true },
                { status: { in: ['seeking_owner', 'seeking_help'] } },
              ],
              ownerId: { not: volunteer.id },
              id: { notIn: interestedProjectIds.length > 0 ? interestedProjectIds : [-1] },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: projectInclude,
          })
        : Promise.resolve([]),

      prisma.notification.count({
        where: { volunteerId: volunteer.id, readAt: null },
      }),
    ])

  return Response.json({
    owned_projects: ownedProjects.map(p => serializeProject(p as EnrichedProject)),
    proposed_projects: proposedProjects.map(p => serializeProject(p as EnrichedProject)),
    my_interests: myInterests.map(i => ({
      id: i.id,
      volunteer_id: i.volunteerId,
      project_id: i.projectId,
      interest_type: i.interestType,
      message: i.message,
      status: i.status,
      response_message: i.responseMessage,
      created_at: i.createdAt,
      responded_at: i.respondedAt,
      project_title: i.project.title,
      project_status: i.project.status,
    })),
    suggested_projects: suggestedProjects.map(p => serializeProject(p as EnrichedProject, volunteerSkillIds)),
    unread_notification_count: unreadCount,
  })
}
