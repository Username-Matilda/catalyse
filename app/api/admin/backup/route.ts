import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { existsSync, readFileSync } = await import('node:fs')
  const path = await import('node:path')

  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  const dbUrl = process.env.DATABASE_URL
  const dbPath = mountPath
    ? path.join(mountPath, 'catalyse.db')
    : dbUrl?.startsWith('file:') ? dbUrl.slice(5) : null
  if (!dbPath || !existsSync(dbPath)) {
    return Response.json({ detail: 'Database not found' }, { status: 404 })
  }

  const data = readFileSync(dbPath)
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')

  return new Response(data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="catalyse-backup-${timestamp}.db"`,
    },
  })
}
