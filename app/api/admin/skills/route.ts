import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name || name.length > 100) {
    return Response.json(
      { detail: 'Name is required and must be at most 100 characters' },
      { status: 422 },
    )
  }

  const categoryId = body.categoryId !== null ? parseInt(String(body.categoryId)) : NaN
  if (isNaN(categoryId)) {
    return Response.json({ detail: 'categoryId is required' }, { status: 422 })
  }

  const category = await prisma.skillCategory.findUnique({ where: { id: categoryId } })
  if (!category) return Response.json({ detail: 'Category not found' }, { status: 400 })

  const description = body.description ? String(body.description) : null

  let sortOrder = body.sortOrder !== null ? Number(body.sortOrder) : null
  if (sortOrder === null) {
    const max = await prisma.skill.aggregate({
      where: { categoryId },
      _max: { sortOrder: true },
    })
    sortOrder = (max._max.sortOrder ?? 0) + 1
  }

  const skill = await prisma.skill.create({
    data: { categoryId, name, description, sortOrder },
  })

  return Response.json({ id: skill.id, name: skill.name, categoryId: skill.categoryId })
}
