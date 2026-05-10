import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    errs.push(fieldError('title', 'Title is required'))
  }
  if (!body.description || typeof body.description !== 'string' || body.description.length < 10) {
    errs.push(fieldError('description', 'Description must be at least 10 characters'))
  }
  if (errs.length) return validationError(errs)

  const wantToOwn = body.want_to_own === true
  const skillIds = Array.isArray(body.skill_ids) ? (body.skill_ids as number[]) : []
  const skillRequiredMap =
    body.skill_required_map && typeof body.skill_required_map === 'object'
      ? (body.skill_required_map as Record<string | number, boolean>)
      : {}
  const tasks = Array.isArray(body.tasks)
    ? (body.tasks as Array<{ title: string; description?: string }>)
    : []

  const project = await prisma.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        title: body.title as string,
        description: body.description as string,
        status: tasks.length > 0 ? 'in_progress' : 'needs_tasks',
        ownerId: wantToOwn ? admin.id : null,
        proposedById: admin.id,
        isOrgProposed: true,
        projectType: (body.project_type as string | null) ?? null,
        estimatedDuration: (body.estimated_duration as string | null) ?? null,
        timeCommitmentHoursPerWeek: (body.time_commitment_hours_per_week as number | null) ?? null,
        urgency: (body.urgency as string) || 'medium',
        collaborationLink: (body.collaboration_link as string | null) ?? null,
        country: (body.country as string | null) ?? null,
        localGroup: (body.local_group as string | null) ?? null,
        isSeekingHelp: body.is_seeking_help !== false,
        isSeekingOwner: body.is_seeking_owner === true,
      },
    })

    if (skillIds.length > 0) {
      await tx.projectSkill.createMany({
        data: skillIds.map((skillId) => ({
          projectId: newProject.id,
          skillId,
          isRequired: skillRequiredMap[skillId] !== false,
        })),
      })
    }

    if (tasks.length > 0) {
      await tx.projectTask.createMany({
        data: tasks.map((t) => ({
          projectId: newProject.id,
          title: t.title,
          description: t.description ?? null,
          createdById: admin.id,
        })),
      })
    }

    return newProject
  })

  return Response.json({ id: project.id, message: 'Org project created' })
}
