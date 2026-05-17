import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const VALID_OUTCOMES = ['successful', 'partial', 'not_completed', 'ongoing']

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const outcome = body.outcome as string
  if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
    return Response.json({ detail: 'Invalid outcome' }, { status: 400 })
  }

  const outcomeNotes = (body.outcomeNotes as string | null) ?? null

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  const isCompleted = ['successful', 'partial', 'not_completed'].includes(outcome)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      outcome,
      outcomeNotes,
      completedAt: isCompleted ? new Date() : null,
      ...(isCompleted ? { status: 'completed' } : {}),
      updatedAt: new Date(),
    },
  })

  if (project.ownerId && outcomeNotes) {
    await prisma.adminNote.create({
      data: {
        volunteerId: project.ownerId,
        authorId: admin.id,
        content: `Project '${project.title}' outcome: ${outcome}. ${outcomeNotes}`,
        category: 'reliability',
        relatedProjectId: projectId,
      },
    })
  }

  if (outcome === 'successful' && project.ownerId) {
    const projectSkills = await prisma.projectSkill.findMany({
      where: { projectId, isRequired: true },
      select: { skillId: true },
    })
    await Promise.all(
      projectSkills.map((ps) =>
        prisma.skillEndorsement.upsert({
          where: {
            volunteerId_skillId_endorsedById: {
              volunteerId: project.ownerId!,
              skillId: ps.skillId,
              endorsedById: admin.id,
            },
          },
          update: {
            rating: 'verified',
            source: 'project_outcome',
            sourceId: projectId,
            notes: `Successfully delivered: ${project.title}`,
          },
          create: {
            volunteerId: project.ownerId!,
            skillId: ps.skillId,
            endorsedById: admin.id,
            source: 'project_outcome',
            sourceId: projectId,
            rating: 'verified',
            notes: `Successfully delivered: ${project.title}`,
          },
        }),
      ),
    )
  }

  return Response.json({ message: `Project outcome recorded as ${outcome}` })
}
