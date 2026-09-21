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

let override: string | undefined

/**
 * Points the process at another database without touching `DATABASE_URL`, which other code
 * (the test harness among it) reads as the server the process was started with. Read by
 * `lib/prisma` when it is imported, so call it first.
 */
export function setDatabaseUrl(url: string | undefined): void {
  override = url
}

/**
 * The Postgres connection URL. Railway injects DATABASE_URL from the linked Postgres
 * service; locally it comes from .env.local. There is deliberately no default: a missing
 * value should fail loudly rather than silently point at the wrong database.
 */
export function resolveDbUrl(): string {
  const url = override ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}
