import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { resolveDbUrl } from '@/lib/db-url'

export async function GET() {
  const dbUrl = resolveDbUrl()
  const filePath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  const exists = existsSync(absPath)
  const sizeKb = exists ? Math.round(statSync(absPath).size / 1024) : null

  let dbOk = false
  let projectCount: number | null = null
  let volunteerCount: number | null = null
  try {
    await prisma.$queryRaw`SELECT 1`
    dbOk = true
    const pr = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM projects`
    projectCount = Number(pr[0].count)
    const vr = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM volunteers`
    volunteerCount = Number(vr[0].count)
  } catch {}

  return Response.json({ ok: dbOk, dbUrl, cwd: process.cwd(), fileExists: exists, sizeKb, projectCount, volunteerCount })
}
