import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const categories = await prisma.skillCategory.findMany({
    include: { _count: { select: { skills: true } } },
    orderBy: { sortOrder: 'asc' },
  })

  return Response.json(
    categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      sortOrder: cat.sortOrder,
      createdAt: cat.createdAt,
      skillCount: cat._count.skills,
    })),
  )
}

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

  const description = body.description ? String(body.description) : null

  let sortOrder = body.sortOrder != null ? Number(body.sortOrder) : null
  if (sortOrder === null) {
    const max = await prisma.skillCategory.aggregate({ _max: { sortOrder: true } })
    sortOrder = (max._max.sortOrder ?? 0) + 1
  }

  const category = await prisma.skillCategory.create({
    data: { name, description, sortOrder },
  })

  return Response.json({ id: category.id, name: category.name, sortOrder: category.sortOrder })
}
