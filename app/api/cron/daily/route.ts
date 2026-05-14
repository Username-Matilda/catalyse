import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { runBackupJob } from '@/lib/jobs/backup'
import { runDigestJob } from '@/lib/jobs/digest'
import { runNudgesJob } from '@/lib/jobs/nudges'

export async function POST(request: NextRequest) {
  const authError = checkCronAuth(request)
  if (authError) return authError

  const [backupResult, digestResult, nudgesResult] = await Promise.allSettled([
    runBackupJob(),
    runDigestJob(),
    runNudgesJob(),
  ])

  return NextResponse.json({
    backup: backupResult.status === 'fulfilled' ? backupResult.value : { error: String(backupResult.reason) },
    digest: digestResult.status === 'fulfilled' ? digestResult.value : { error: String(digestResult.reason) },
    nudges: nudgesResult.status === 'fulfilled' ? nudgesResult.value : { error: String(nudgesResult.reason) },
  })
}
