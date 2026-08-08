import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { CRON_JOBS, CRON_JOB_NAMES } from '@/lib/cron-jobs'

// Can be triggered manually: POST with Authorization: Bearer <CRON_SECRET>
export async function POST(request: NextRequest) {
  const authError = checkCronAuth(request)
  if (authError) return authError

  const results = await Promise.allSettled(CRON_JOB_NAMES.map((name) => CRON_JOBS[name]()))

  const body = Object.fromEntries(
    CRON_JOB_NAMES.map((name, i) => {
      const r = results[i]
      return [name, r.status === 'fulfilled' ? r.value : { error: String(r.reason) }]
    }),
  )

  return NextResponse.json(body)
}
