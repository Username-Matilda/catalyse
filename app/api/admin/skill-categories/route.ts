import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { CreateSkillCategorySchema } from '@/lib/schemas'

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

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(CreateSkillCategorySchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  let sortOrder = body.sortOrder ?? null
  if (sortOrder === null) {
    const max = await prisma.skillCategory.aggregate({ _max: { sortOrder: true } })
    sortOrder = (max._max.sortOrder ?? 0) + 1
  }

  const category = await prisma.skillCategory.create({
    data: { name: body.name, description: body.description ?? null, sortOrder },
  })

  return Response.json({ id: category.id, name: category.name, sortOrder: category.sortOrder })
}
