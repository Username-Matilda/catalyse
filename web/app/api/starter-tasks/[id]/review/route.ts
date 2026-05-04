import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { createNotification } from '@/lib/project'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const taskId = parseInt(idParam, 10)
  if (isNaN(taskId)) {
    return Response.json({ detail: 'Invalid task ID' }, { status: 400 })
  }

  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const task = await prisma.starterTask.findUnique({ where: { id: taskId } })
  if (!task) {
    return Response.json({ detail: 'Task not found' }, { status: 404 })
  }
  if (task.status !== 'submitted') {
    return Response.json({ detail: 'Task is not in submitted status' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const reviewRating = body.review_rating as string
  if (!reviewRating || !['excellent', 'good', 'needs_improvement'].includes(reviewRating)) {
    return Response.json({ detail: 'review_rating must be excellent, good, or needs_improvement' }, { status: 400 })
  }

  const reviewNotes = (body.review_notes as string | null) ?? null
  const feedbackToVolunteer = (body.feedback_to_volunteer as string | null) ?? null
  const newStatus = ['excellent', 'good'].includes(reviewRating) ? 'completed' : 'reviewed'

  await prisma.starterTask.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      reviewRating,
      reviewNotes,
      feedbackToVolunteer,
      reviewedById: admin.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    },
  })

  if (task.assignedToId) {
    const noteContent = `Starter task '${task.title}': ${reviewRating}${reviewNotes ? ` - ${reviewNotes}` : ''}`
    await prisma.adminNote.create({
      data: {
        volunteerId: task.assignedToId,
        authorId: admin.id,
        content: noteContent,
        category: 'skill_feedback',
        relatedProjectId: task.projectId ?? null,
      },
    })

    if (['excellent', 'good'].includes(reviewRating) && task.skillId) {
      const rating = reviewRating === 'excellent' ? 'strong' : 'verified'
      await prisma.skillEndorsement.upsert({
        where: {
          volunteerId_skillId_endorsedById: {
            volunteerId: task.assignedToId,
            skillId: task.skillId,
            endorsedById: admin.id,
          },
        },
        update: { rating, notes: reviewNotes, source: 'starter_task', sourceId: taskId },
        create: {
          volunteerId: task.assignedToId,
          skillId: task.skillId,
          endorsedById: admin.id,
          source: 'starter_task',
          sourceId: taskId,
          rating,
          notes: reviewNotes,
        },
      })
    }

    createNotification(
      task.assignedToId, 'starter_task_reviewed',
      `Your starter task was reviewed: ${reviewRating}`,
      feedbackToVolunteer || 'Check your dashboard for details.',
      '/static/dashboard.html'
    ).catch(e => console.error('[NOTIFY ERROR]', e))
  }

  return Response.json({ message: `Task reviewed as ${reviewRating}` })
}
