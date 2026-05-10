import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body)) {
    return Response.json({ detail: 'Expected array of {id, sort_order}' }, { status: 422 })
  }

  await prisma.$transaction(
    body.map(({ id, sort_order }: { id: number; sort_order: number }) =>
      prisma.skillCategory.update({ where: { id }, data: { sortOrder: sort_order } })
    )
  )

  return Response.json({ success: true })
}
