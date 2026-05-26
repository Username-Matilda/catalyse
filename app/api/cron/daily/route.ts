import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { runBackupJob } from '@/jobs/backup'
import { runDigestJob } from '@/jobs/digest'
import { runNudgesJob } from '@/jobs/nudges'
import { runApplicationsSummaryJob, runApplicationsAnonymisationJob } from '@/jobs/applications'

const JOBS: { name: string; run: () => Promise<unknown> }[] = [
  { name: 'backup', run: runBackupJob },
  { name: 'digest', run: runDigestJob },
  { name: 'nudges', run: runNudgesJob },
  { name: 'applications', run: runApplicationsSummaryJob },
  { name: 'anonymisation', run: runApplicationsAnonymisationJob },
]

// Can be triggered manually: POST with Authorization: Bearer <CRON_SECRET>
export async function POST(request: NextRequest) {
  const authError = checkCronAuth(request)
  if (authError) return authError

  const results = await Promise.allSettled(JOBS.map((j) => j.run()))

  const body = Object.fromEntries(
    JOBS.map((job, i) => {
      const r = results[i]
      return [job.name, r.status === 'fulfilled' ? r.value : { error: String(r.reason) }]
    }),
  )

  return NextResponse.json(body)
}
