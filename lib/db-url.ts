import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

// Load .env then .env.local (Next.js convention). Safe to call in scripts —
// values already set by the shell or Next.js runtime are never overwritten.
loadEnvFile(path.join(process.cwd(), '.env'))
loadEnvFile(path.join(process.cwd(), '.env.local'))

export function resolveDbUrl(fallback = 'file:./db/catalyse.db'): string {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
  if (mountPath && isProduction)
    return `file:${path.join(/*turbopackIgnore: true*/ mountPath, 'catalyse.db')}`

  const rawUrl = process.env.DATABASE_URL ?? fallback
  if (rawUrl.startsWith('file:') && !path.isAbsolute(rawUrl.slice(5))) {
    return `file:${path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawUrl.slice(5))}`
  }
  return rawUrl
}
