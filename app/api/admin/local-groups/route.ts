import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseBody, fieldError, validationError } from '@/lib/errors'
import { LocalGroupBodySchema } from '@/lib/schemas'
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

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(LocalGroupBodySchema, raw)
  if (!parsed.success) return parsed.response

  const { name, country } = parsed.data
  if (!VALID_COUNTRIES.has(country)) {
    return validationError([fieldError('country', 'Invalid country')])
  }

  const group = await prisma.localGroup.create({ data: { name, country } })

  return NextResponse.json(
    { id: group.id, name: group.name, country: group.country },
    { status: 201 },
  )
}
