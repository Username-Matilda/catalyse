import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { runApplicationsSummaryJob } from '@/lib/jobs/applications'

// Can be triggered manually: POST with Authorization: Bearer <CRON_SECRET>
export async function POST(request: NextRequest) {
  const authError = checkCronAuth(request)
  if (authError) return authError

  const result = await runApplicationsSummaryJob()
  return NextResponse.json({ applications: result })
}
