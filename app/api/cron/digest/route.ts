import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendDigestEmail, isEmailConfigured } from '@/lib/email'

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[CRON] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEmailConfigured()) {
    console.log('[CRON DIGEST] Email not configured, skipping')
    return NextResponse.json({ skipped: true, reason: 'email not configured' })
  }

  const dedupeWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const lastRun = await prisma.digestRun.findFirst({
    where: { type: 'fortnightly', sentAt: { gte: dedupeWindow } },
    orderBy: { sentAt: 'desc' },
  })
  if (lastRun) {
    console.log(`[CRON DIGEST] Already sent at ${lastRun.sentAt.toISOString()}, skipping`)
    return NextResponse.json({ skipped: true, reason: 'sent recently', lastSentAt: lastRun.sentAt })
  }

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const rawProjects = await prisma.project.findMany({
    where: {
      status: { notIn: ['archived', 'pending_review', 'needs_discussion'] },
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      skills: {
        include: { skill: true },
      },
    },
  })

  if (!rawProjects.length) {
    console.log('[CRON DIGEST] No new projects in last 14 days, skipping')
    return NextResponse.json({ skipped: true, reason: 'no new projects' })
  }

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

  if (!volunteers.length) {
    console.log('[CRON DIGEST] No volunteers opted in to fortnightly digest')
    return NextResponse.json({ skipped: true, reason: 'no opted-in volunteers' })
  }

  let sent = 0
  for (const vol of volunteers) {
    const volSkillIds = new Set(vol.skills.map((vs) => vs.skillId))

    const enriched = projectList.map((p) => {
      const { requiredSkillIds, ...rest } = p
      let match_percent: number | undefined
      if (volSkillIds.size && requiredSkillIds.size) {
        const matched = [...requiredSkillIds].filter((id) => volSkillIds.has(id)).length
        match_percent = Math.round((matched / requiredSkillIds.size) * 100)
      }
      return { ...rest, match_percent }
    })

    enriched.sort((a, b) => (b.match_percent ?? 0) - (a.match_percent ?? 0))

    if (await sendDigestEmail(vol.email!, vol.name, enriched, false)) sent++
  }

  await prisma.digestRun.create({ data: { type: 'fortnightly' } })

  console.log(
    `[CRON DIGEST] Sent to ${sent}/${volunteers.length} volunteers (${projectList.length} projects)`,
  )
  return NextResponse.json({ sent, total: volunteers.length, projects: projectList.length })
}
