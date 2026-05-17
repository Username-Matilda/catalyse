import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.requireApplicationApproval !== 'boolean') {
    return Response.json(
      { detail: 'requireApplicationApproval must be a boolean' },
      { status: 400 },
    )
  }

  const settings = await prisma.platformSettings.update({
    where: { id: SINGLETON_ID },
    data: { requireApplicationApproval: body.requireApplicationApproval },
  })

  return Response.json({
    requireApplicationApproval: settings.requireApplicationApproval,
  })
}
