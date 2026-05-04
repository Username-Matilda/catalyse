import { NextRequest } from 'next/server'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { requireAdmin } from '@/lib/auth'

function getDatabasePath(): string | null {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  if (mountPath) return path.join(mountPath, 'catalyse.db')
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl?.startsWith('file:')) return dbUrl.slice(5)
  return null
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const dbPath = getDatabasePath()
  if (!dbPath || !existsSync(dbPath)) {
    return Response.json({ detail: 'Database not found' }, { status: 404 })
  }

  const backupDir = path.join(path.dirname(dbPath), 'backups')
  mkdirSync(backupDir, { recursive: true })

  const timestamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', '_')
    .replace(/:/g, '')
  const backupPath = path.join(backupDir, `catalyse-${timestamp}.db`)
  copyFileSync(dbPath, backupPath)

  const isB2Configured = Boolean(
    process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_BUCKET_NAME
  )

  return Response.json({
    message: isB2Configured
      ? 'Local backup created. B2 cloud backup requires the Python backup service.'
      : 'Local backup created. B2 not configured — set B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME to enable cloud backups.',
  })
}
