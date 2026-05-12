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

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { searchParams } = new URL(request.url)
  const country = searchParams.get('country')

  const groups = await prisma.localGroup.findMany({
    where: country ? { country } : undefined,
    orderBy: [{ country: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({ groups })
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

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

  const group = await prisma.localGroup.create({ data: { name, country } })

  return NextResponse.json({ id: group.id, name: group.name, country: group.country }, { status: 201 })
}
