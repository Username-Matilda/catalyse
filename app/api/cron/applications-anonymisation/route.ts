import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { runApplicationsAnonymisationJob } from '@/lib/jobs/applications'

export async function POST(request: NextRequest) {
  const authError = checkCronAuth(request)
  if (authError) return authError

  const result = await runApplicationsAnonymisationJob()
  return NextResponse.json({ anonymisation: result })
}
