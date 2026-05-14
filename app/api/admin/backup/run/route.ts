import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runBackup } from '@/lib/backup'

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const result = await runBackup()
  return Response.json({
    message: result.local
      ? result.b2
        ? 'Backup created and uploaded to B2.'
        : 'Local backup created. B2 upload failed or not configured.'
      : 'Database not found.',
    ...result,
  })
}
