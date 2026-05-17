import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { AdminCreateProjectSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(AdminCreateProjectSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const { wantToOwn, skillIds, skillRequiredMap, tasks } = body

  const project = await prisma.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        title: body.title,
        description: body.description,
        status: tasks.length > 0 ? 'in_progress' : 'needs_tasks',
        ownerId: wantToOwn ? admin.id : null,
        proposedById: admin.id,
        isOrgProposed: true,
        projectType: body.projectType ?? null,
        estimatedDuration: body.estimatedDuration ?? null,
        timeCommitmentHoursPerWeek: body.timeCommitmentHoursPerWeek ?? null,
        urgency: body.urgency ?? 'medium',
        collaborationLink: body.collaborationLink ?? null,
        country: body.country ?? null,
        localGroup: body.localGroup ?? null,
        isSeekingHelp: body.isSeekingHelp !== false,
        isSeekingOwner: body.isSeekingOwner === true,
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
