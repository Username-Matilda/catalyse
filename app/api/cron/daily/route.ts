import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  sendDigestEmail,
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

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[CRON DAILY] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEmailConfigured()) {
    console.log('[CRON DAILY] Email not configured, skipping')
    return NextResponse.json({ skipped: true, reason: 'email not configured' })
  }

  // ── Digest ────────────────────────────────────────────────────────────────
  // Only sends fortnightly; DigestRun dedupes within a 7-day window.
  let digestResult: Record<string, unknown> = { skipped: true, reason: 'sent recently' }

  const lastDigest = await prisma.digestRun.findFirst({
    where: { type: 'fortnightly', sentAt: { gte: daysAgo(7) } },
    orderBy: { sentAt: 'desc' },
  })

  if (!lastDigest) {
    const cutoff = daysAgo(14)
    const rawProjects = await prisma.project.findMany({
      where: {
        status: { notIn: ['archived', 'pending_review', 'needs_discussion'] },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { skills: { include: { skill: true } } },
    })

    if (!rawProjects.length) {
      digestResult = { skipped: true, reason: 'no new projects' }
    } else {
      const projectList = rawProjects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description ?? '',
        skill_names: p.skills.map((ps) => ps.skill.name),
        requiredSkillIds: new Set(p.skills.filter((ps) => ps.isRequired).map((ps) => ps.skillId)),
      }))

      const volunteers = await prisma.volunteer.findMany({
        where: { emailDigest: 'fortnightly', email: { not: null }, deletedAt: null },
        include: { skills: true },
      })

      let digestSent = 0
      for (const vol of volunteers) {
        const volSkillIds = new Set(vol.skills.map((vs) => vs.skillId))
        const enriched = projectList.map(({ requiredSkillIds, ...rest }) => {
          let match_percent: number | undefined
          if (volSkillIds.size && requiredSkillIds.size) {
            const matched = [...requiredSkillIds].filter((id) => volSkillIds.has(id)).length
            match_percent = Math.round((matched / requiredSkillIds.size) * 100)
          }
          return { ...rest, match_percent }
        })
        enriched.sort((a, b) => (b.match_percent ?? 0) - (a.match_percent ?? 0))
        if (await sendDigestEmail(vol.email!, vol.name, enriched, false)) digestSent++
      }

      await prisma.digestRun.create({ data: { type: 'fortnightly' } })
      digestResult = { sent: digestSent, total: volunteers.length, projects: projectList.length }
      console.log(
        `[CRON DAILY] Digest sent to ${digestSent}/${volunteers.length} volunteers (${projectList.length} projects)`,
      )
    }
  }

  // ── Nudges ────────────────────────────────────────────────────────────────
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
      console.log(`[CRON DAILY] Surrendered task ${task.id} (${daysInactive} days inactive)`)
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
        console.log(`[CRON DAILY] Final warning sent for task ${task.id} (${daysInactive} days)`)
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
        console.log(`[CRON DAILY] Nudge sent for task ${task.id} (${daysInactive} days)`)
      }
    }
  }

  console.log(
    `[CRON DAILY] Nudges done — nudges: ${nudgesSent}, warnings: ${warningsSent}, surrendered: ${surrendered}`,
  )
  return NextResponse.json({ digest: digestResult, nudgesSent, warningsSent, surrendered })
}
