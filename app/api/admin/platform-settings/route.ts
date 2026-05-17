import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { PlatformSettingsSchema } from '@/lib/schemas'

const SINGLETON_ID = 1

function getSettings() {
  return prisma.platformSettings.findUniqueOrThrow({ where: { id: SINGLETON_ID } })
}

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request.headers.get('authorization'))
  if (error) return error

  const settings = await getSettings()
  return Response.json({
    requireApplicationApproval: settings.requireApplicationApproval,
  })
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireSuperAdmin(request.headers.get('authorization'))
  if (error) return error

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(PlatformSettingsSchema, raw)
  if (!parsed.success) return parsed.response

  const settings = await prisma.platformSettings.update({
    where: { id: SINGLETON_ID },
    data: { requireApplicationApproval: parsed.data.requireApplicationApproval },
  })

  return Response.json({
    requireApplicationApproval: settings.requireApplicationApproval,
  })
}
