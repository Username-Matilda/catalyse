import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const skillId = parseInt(id)
  if (isNaN(skillId)) return Response.json({ detail: 'Invalid id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const existing = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!existing) return Response.json({ detail: 'Skill not found' }, { status: 404 })

  const data: {
    name?: string
    description?: string | null
    sortOrder?: number
    categoryId?: number
  } = {}
  if (body.name != null) data.name = String(body.name).trim()
  if ('description' in body) data.description = body.description ? String(body.description) : null
  if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder)
  if (body.categoryId != null) {
    const categoryId = parseInt(String(body.categoryId))
    const category = await prisma.skillCategory.findUnique({ where: { id: categoryId } })
    if (!category) return Response.json({ detail: 'Category not found' }, { status: 400 })
    data.categoryId = categoryId
  }

  await prisma.skill.update({ where: { id: skillId }, data })

  return Response.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const skillId = parseInt(id)
  if (isNaN(skillId)) return Response.json({ detail: 'Invalid id' }, { status: 400 })

  const skill = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!skill) return Response.json({ detail: 'Skill not found' }, { status: 404 })

  // Null out starter tasks that reference this skill (match FastAPI cascade behaviour)
  await prisma.starterTask.updateMany({ where: { skillId }, data: { skillId: null } })

  // Delete skill — Prisma cascades VolunteerSkill, ProjectSkill, SkillEndorsement
  await prisma.skill.delete({ where: { id: skillId } })

  return Response.json({ success: true, deletedSkill: { id: skill.id, name: skill.name } })
}
