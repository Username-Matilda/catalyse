import { prisma } from '@/lib/prisma'
import {
  sendTaskNudgeEmail,
  sendTaskFinalWarningEmail,
  sendTaskSurrenderedOwnerEmail,
  sendTaskSurrenderedAssigneeEmail,
  isEmailConfigured,
} from '@/lib/email'

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function runNudgesJob(): Promise<Record<string, unknown>> {
  if (!isEmailConfigured()) {
    console.log('[CRON NUDGES] Email not configured, skipping')
    return { skipped: true, reason: 'email not configured' }
  }

  const assignedTasks = await prisma.projectTask.findMany({
    where: {
      status: 'assigned',
      assignedToId: { not: null },
      updatedAt: { lt: daysAgo(14) },
      assignedTo: { email: { not: null }, deletedAt: null },
    },
    include: {
      assignedTo: true,
      project: { include: { owner: true } },
    },
  })

  let nudgesSent = 0
  let warningsSent = 0
  let surrendered = 0

  for (const task of assignedTasks) {
    const assignee = task.assignedTo!
    const updatedAt = task.updatedAt!
    const now = new Date()
    const daysInactive = Math.floor((now.getTime() - updatedAt.getTime()) / DAY_MS)
    const lastActivityDate = formatDate(updatedAt)

    if (daysInactive >= 28) {
      await prisma.projectTask.update({
        where: { id: task.id },
        data: {
          status: 'open',
          assignedToId: null,
          updatedAt: now,
          nudgeSentAt: null,
          finalWarningSentAt: null,
        },
      })
      await sendTaskSurrenderedAssigneeEmail(
        assignee.email!,
        assignee.name,
        task.title,
        task.project.title,
        task.projectId,
      )
      if (task.project.owner?.email) {
        await sendTaskSurrenderedOwnerEmail(
          task.project.owner.email,
          task.project.owner.name,
          assignee.name,
          task.title,
          task.project.title,
          task.projectId,
        )
      }
      surrendered++
      console.log(`[CRON NUDGES] Surrendered task ${task.id} (${daysInactive} days inactive)`)
    } else if (daysInactive >= 21 && !task.finalWarningSentAt) {
      const surrenderDate = formatDate(new Date(updatedAt.getTime() + 28 * DAY_MS))
      const sent = await sendTaskFinalWarningEmail(
        assignee.email!,
        assignee.name,
        task.title,
        task.project.title,
        task.projectId,
        task.id,
        daysInactive,
        'you last updated',
        lastActivityDate,
        surrenderDate,
      )
      if (sent) {
        await prisma.projectTask.update({ where: { id: task.id }, data: { finalWarningSentAt: now } })
        warningsSent++
        console.log(`[CRON NUDGES] Final warning sent for task ${task.id} (${daysInactive} days)`)
      }
    } else if (daysInactive >= 14 && !task.nudgeSentAt) {
      const sent = await sendTaskNudgeEmail(
        assignee.email!,
        assignee.name,
        task.title,
        task.project.title,
        task.projectId,
        task.id,
        daysInactive,
        'you last updated',
        lastActivityDate,
      )
      if (sent) {
        await prisma.projectTask.update({ where: { id: task.id }, data: { nudgeSentAt: now } })
        nudgesSent++
        console.log(`[CRON NUDGES] Nudge sent for task ${task.id} (${daysInactive} days)`)
      }
    }
  }

  console.log(`[CRON NUDGES] Done — nudges: ${nudgesSent}, warnings: ${warningsSent}, surrendered: ${surrendered}`)
  return { nudgesSent, warningsSent, surrendered }
}
