import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { fieldError, validationError } from '@/lib/errors'
import { BASE_LOCATION_OPTIONS } from '@/lib/filter-options'

const VALID_COUNTRIES = new Set(
  BASE_LOCATION_OPTIONS.filter((o) => o.value && o.value !== 'Remote' && o.value !== 'Other').map(
    (o) => o.value,
  ),
)

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ detail: 'Invalid id' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errors = []
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const country = typeof body.country === 'string' ? body.country.trim() : ''

  if (!name) errors.push(fieldError('name', 'Group name is required'))
  if (!country) errors.push(fieldError('country', 'Country is required'))
  else if (!VALID_COUNTRIES.has(country)) errors.push(fieldError('country', 'Invalid country'))

  if (errors.length) return validationError(errors)

  const existing = await prisma.localGroup.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ detail: 'Not found' }, { status: 404 })

  const group = await prisma.localGroup.update({ where: { id }, data: { name, country } })

  return NextResponse.json({ id: group.id, name: group.name, country: group.country })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ detail: 'Invalid id' }, { status: 400 })
  }

  const existing = await prisma.localGroup.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ detail: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.localGroupSuggestion.updateMany({
      where: { mergedIntoId: id },
      data: { mergedIntoId: null },
    }),
    prisma.project.updateMany({
      where: { localGroup: existing.name },
      data: { localGroup: null },
    }),
    prisma.localGroup.delete({ where: { id } }),
  ])

  return NextResponse.json({ message: 'Group deleted' })
}
