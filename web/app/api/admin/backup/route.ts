import { NextRequest } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { requireAdmin } from '@/lib/auth'

function getDatabasePath(): string | null {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  if (mountPath) return path.join(mountPath, 'catalyse.db')
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl?.startsWith('file:')) return dbUrl.slice(5)
  return null
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const dbPath = getDatabasePath()
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
