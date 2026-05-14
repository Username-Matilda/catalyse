import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getCurrentVolunteer,
  serializeVolunteer,
  serializeSkill,
  serializeEndorsement,
} from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const volunteerId = parseInt(idParam, 10)
  if (isNaN(volunteerId)) {
    return Response.json({ detail: 'Invalid volunteer ID' }, { status: 400 })
  }

  const currentVolunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (currentVolunteer && currentVolunteer.approvalStatus !== 'APPROVED' && !currentVolunteer.isAdmin) {
    return Response.json({ detail: 'Your account is pending approval' }, { status: 403 })
  }

  const vol = await prisma.volunteer.findFirst({
    where: { id: volunteerId, deletedAt: null, consentMakeProfileVisibleInDirectory: true },
    include: {
      skills: {
        include: { skill: { include: { category: true } } },
        orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
      },
      skillEndorsementsReceived: {
        include: { skill: true },
      },
    },
  })

  if (!vol) {
    return Response.json({ detail: 'Volunteer not found' }, { status: 404 })
  }

  let showContact = false
  if (currentVolunteer) {
    if (currentVolunteer.id === volunteerId) {
      showContact = true
    } else if (currentVolunteer.isAdmin) {
      showContact = true
    } else if (
      vol.consentContactableByProjectOwners &&
      vol.consentShareContactInfoWithProjectOwner
    ) {
      showContact = true
    }
  }

  const skills = vol.skills.map(serializeSkill)
  const endorsements = vol.skillEndorsementsReceived.map(serializeEndorsement)

  const projects = await prisma.project.findMany({
    where: {
      OR: [{ ownerId: volunteerId }, { proposedById: volunteerId }],
      status: { notIn: ['archived', 'pending_review', 'needs_discussion'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      ownerId: true,
      proposedById: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const completedTasks = await prisma.starterTask.findMany({
    where: {
      assignedToId: volunteerId,
      status: { in: ['completed', 'reviewed'] },
      reviewRating: { in: ['excellent', 'good'] },
    },
    orderBy: { reviewedAt: 'desc' },
    select: {
      title: true,
      reviewRating: true,
      feedbackToVolunteer: true,
      reviewedAt: true,
      skill: { select: { name: true } },
    },
  })

  return Response.json({
    ...serializeVolunteer(vol as unknown as Record<string, unknown>, {
      showContact,
      skills,
      endorsements,
    }),
    projects: projects.map((p) => ({
      ...p,
      owner_id: p.ownerId,
      proposed_by_id: p.proposedById,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      role: p.ownerId === volunteerId ? 'owner' : 'proposer',
    })),
    completed_tasks: completedTasks.map((t) => ({
      title: t.title,
      review_rating: t.reviewRating,
      feedback_to_volunteer: t.feedbackToVolunteer,
      reviewed_at: t.reviewedAt,
      skill_name: t.skill?.name ?? null,
    })),
  })
}
