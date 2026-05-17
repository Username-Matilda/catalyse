import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'
import { createNotification } from '@/lib/project'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const projectId = parseInt(idParam, 10)
  if (isNaN(projectId)) {
    return Response.json({ detail: 'Invalid project ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return Response.json({ detail: 'Project not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const status = body.status as string
  if (!status || !['approved', 'needs_discussion'].includes(status)) {
    return Response.json({ detail: 'Status must be approved or needs_discussion' }, { status: 400 })
  }

  const reviewNotes = (body.reviewNotes as string | null) ?? null
  const feedbackToProposer = (body.feedbackToProposer as string | null) ?? null
  const targetStatus = (body.targetStatus as string) || 'seeking_owner'

  if (status === 'approved') {
    const hasOwner = project.ownerId !== null
    const openTaskCount = await prisma.projectTask.count({
      where: { projectId, status: { not: 'done' } },
    })
    const newStatus = openTaskCount > 0 ? 'in_progress' : 'needs_tasks'
    const isSeekingHelp = targetStatus === 'seeking_help' || targetStatus === 'seeking_owner'
    const isSeekingOwner = targetStatus === 'seeking_owner' && !hasOwner

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: newStatus,
        isSeekingHelp,
        isSeekingOwner,
        reviewNotes,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    if (project.proposedById) {
      createNotification(
        project.proposedById,
        'project_approved',
        `Your project '${project.title}' has been approved!`,
        "It's now visible to other volunteers.",
        `/projects/${projectId}`,
      ).catch((e) => console.error('[NOTIFY ERROR]', e))

      const proposer = await prisma.volunteer.findFirst({
        where: { id: project.proposedById },
        select: { name: true, email: true },
      })
      if (proposer?.email) {
        sendProjectNotificationEmail({
          to: proposer.email,
          name: proposer.name,
          subject: `Your project '${project.title}' has been approved!`,
          message:
            'Great news! Your project has been approved and is now visible to all volunteers. People can start expressing interest.',
          projectTitle: project.title,
          projectId,
        }).catch((e) => console.error('[EMAIL ERROR]', e))
      }
    }
  } else {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'needs_discussion',
        reviewNotes,
        feedbackToProposer,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    if (project.proposedById) {
      const feedback = feedbackToProposer || 'A team lead wants to chat about your proposal.'
      createNotification(
        project.proposedById,
        'project_needs_discussion',
        `Let's discuss your project '${project.title}'`,
        feedback,
        `/projects/${projectId}`,
      ).catch((e) => console.error('[NOTIFY ERROR]', e))

      const proposer = await prisma.volunteer.findFirst({
        where: { id: project.proposedById },
        select: { name: true, email: true },
      })
      if (proposer?.email) {
        const extra = `<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Feedback:</strong> ${feedback}</div>`
        sendProjectNotificationEmail({
          to: proposer.email,
          name: proposer.name,
          subject: `Let's discuss your project '${project.title}'`,
          message: 'A team lead would like to discuss your project proposal before it goes live.',
          projectTitle: project.title,
          projectId,
          extraHtml: extra,
        }).catch((e) => console.error('[EMAIL ERROR]', e))
      }
    }
  }

  return Response.json({ message: `Project marked as ${status}` })
}
