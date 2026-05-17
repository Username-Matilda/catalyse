import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { parseBody, fieldError, validationError } from '@/lib/errors'
import { LocalGroupSuggestionBodySchema } from '@/lib/schemas'
import { BASE_LOCATION_OPTIONS } from '@/lib/filter-options'

const VALID_COUNTRIES = new Set(
  BASE_LOCATION_OPTIONS.filter((o) => o.value && o.value !== 'Remote' && o.value !== 'Other').map(
    (o) => o.value,
  ),
)

export async function GET(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) return NextResponse.json({ detail: 'Authentication required' }, { status: 401 })

  const suggestions = await prisma.localGroupSuggestion.findMany({
    where: { suggestedById: volunteer.id },
    orderBy: { createdAt: 'desc' },
    include: { mergedInto: { select: { id: true, name: true } } },
  })

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      status: s.status,
      adminNotes: s.adminNotes,
      createdAt: s.createdAt,
      mergedInto: s.mergedInto ? { id: s.mergedInto.id, name: s.mergedInto.name } : null,
    })),
  })
}

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) return NextResponse.json({ detail: 'Authentication required' }, { status: 401 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(LocalGroupSuggestionBodySchema, raw)
  if (!parsed.success) return parsed.response

  const { name, country } = parsed.data
  if (!VALID_COUNTRIES.has(country)) {
    return validationError([fieldError('country', 'Invalid country')])
  }

  const suggestion = await prisma.localGroupSuggestion.create({
    data: { name, country, suggestedById: volunteer.id },
  })

  return NextResponse.json(
    {
      id: suggestion.id,
      name: suggestion.name,
      country: suggestion.country,
      status: suggestion.status,
      adminNotes: null,
      createdAt: suggestion.createdAt,
      mergedInto: null,
    },
    { status: 201 },
  )
}
