import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { CreateSkillSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(CreateSkillSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const category = await prisma.skillCategory.findUnique({ where: { id: body.categoryId } })
  if (!category) return Response.json({ detail: 'Category not found' }, { status: 400 })

  let sortOrder = body.sortOrder ?? null
  if (sortOrder === null) {
    const max = await prisma.skill.aggregate({
      where: { categoryId: body.categoryId },
      _max: { sortOrder: true },
    })
    sortOrder = (max._max.sortOrder ?? 0) + 1
  }

  const skill = await prisma.skill.create({
    data: {
      categoryId: body.categoryId,
      name: body.name,
      description: body.description ?? null,
      sortOrder,
    },
  })

  return Response.json({ id: skill.id, name: skill.name, categoryId: skill.categoryId })
}
