import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody } from '@/lib/errors'
import { UpdateSkillSchema } from '@/lib/schemas'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const skillId = parseInt(id)
  if (isNaN(skillId)) return Response.json({ detail: 'Invalid id' }, { status: 400 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(UpdateSkillSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const existing = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!existing) return Response.json({ detail: 'Skill not found' }, { status: 404 })

  const data: {
    name?: string
    description?: string | null
    sortOrder?: number
    categoryId?: number
  } = {}
  if ('name' in body) data.name = body.name ? String(body.name).trim() : body.name
  if ('description' in body) data.description = body.description ?? null
  if ('sortOrder' in body && body.sortOrder !== undefined) data.sortOrder = body.sortOrder
  if ('categoryId' in body && body.categoryId !== undefined) {
    const category = await prisma.skillCategory.findUnique({ where: { id: body.categoryId } })
    if (!category) return Response.json({ detail: 'Category not found' }, { status: 400 })
    data.categoryId = body.categoryId
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
