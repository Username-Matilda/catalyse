import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const VALID_STATUSES = ['pending', 'on_hold', 'accepted', 'declined']

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'pending'
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ detail: 'Invalid status' }, { status: 400 })
  }

  const suggestions = await prisma.localGroupSuggestion.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    include: {
      suggestedBy: { select: { id: true, name: true, email: true } },
      mergedInto: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      status: s.status,
      adminNotes: s.adminNotes,
      createdAt: s.createdAt,
      suggestedBy: { id: s.suggestedBy.id, name: s.suggestedBy.name, email: s.suggestedBy.email },
      mergedInto: s.mergedInto ? { id: s.mergedInto.id, name: s.mergedInto.name } : null,
    })),
  })
}
