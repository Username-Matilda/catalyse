import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const categoryId = parseInt(id)
  if (isNaN(categoryId)) return Response.json({ detail: 'Invalid id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const existing = await prisma.skillCategory.findUnique({ where: { id: categoryId } })
  if (!existing) return Response.json({ detail: 'Category not found' }, { status: 404 })

  const data: { name?: string; description?: string | null; sortOrder?: number } = {}
  if ('name' in body) data.name = String(body.name).trim()
  if ('description' in body) data.description = body.description ? String(body.description) : null
  if ('sortOrder' in body) data.sortOrder = Number(body.sortOrder)

  await prisma.skillCategory.update({ where: { id: categoryId }, data })

  return Response.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const categoryId = parseInt(id)
  if (isNaN(categoryId)) return Response.json({ detail: 'Invalid id' }, { status: 400 })

  const skillCount = await prisma.skill.count({ where: { categoryId } })
  if (skillCount > 0) {
    return Response.json(
      { detail: `Cannot delete category with ${skillCount} skills. Move or delete skills first.` },
      { status: 400 },
    )
  }

  const result = await prisma.skillCategory.deleteMany({ where: { id: categoryId } })
  if (result.count === 0) return Response.json({ detail: 'Category not found' }, { status: 404 })

  return Response.json({ success: true })
}
