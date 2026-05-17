import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { createNotification } from '@/lib/project'
import { sendLocalGroupSuggestionEmail } from '@/lib/email'
import { parseBody } from '@/lib/errors'
import { ReviewSuggestionSchema } from '@/lib/schemas'

const NOTIFICATION_TITLES: Record<string, (name: string) => string> = {
  accepted: (n) => `Your local group suggestion "${n}" was accepted`,
  merge: (n) => `Your local group suggestion "${n}" has been merged`,
  on_hold: (n) => `Your local group suggestion "${n}" is under review`,
  declined: (n) => `Update on your local group suggestion "${n}"`,
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { volunteer: admin, error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const suggestionId = parseInt(id, 10)
  if (isNaN(suggestionId)) {
    return NextResponse.json({ detail: 'Invalid ID' }, { status: 400 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(ReviewSuggestionSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const action = body.action

  const suggestion = await prisma.localGroupSuggestion.findUnique({
    where: { id: suggestionId },
    include: { suggestedBy: { select: { id: true, name: true, email: true } } },
  })
  if (!suggestion) return NextResponse.json({ detail: 'Not found' }, { status: 404 })

  const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() || null : null
  const now = new Date()
  const reviewBase = { reviewedById: admin.id, reviewedAt: now, updatedAt: now }

  let finalName = suggestion.name
  let notificationAction: string = action

  if (action === 'accept') {
    const name = body.name?.trim() || suggestion.name
    const country = body.country?.trim() || suggestion.country
    if (!name || !country) {
      return NextResponse.json({ detail: 'Name and country required' }, { status: 400 })
    }
    finalName = name

    await prisma.$transaction([
      prisma.localGroup.create({ data: { name, country } }),
      prisma.localGroupSuggestion.update({
        where: { id: suggestionId },
        data: { ...reviewBase, status: 'accepted', name, country, adminNotes },
      }),
    ])
    notificationAction = 'accepted'
  } else if (action === 'merge') {
    const mergedIntoId = body.mergedIntoId ?? null
    if (!mergedIntoId) {
      return NextResponse.json({ detail: 'mergedIntoId required for merge' }, { status: 400 })
    }
    const target = await prisma.localGroup.findUnique({ where: { id: mergedIntoId } })
    if (!target)
      return NextResponse.json({ detail: 'Target local group not found' }, { status: 404 })

    await prisma.localGroupSuggestion.update({
      where: { id: suggestionId },
      data: { ...reviewBase, status: 'accepted', mergedIntoId, adminNotes },
    })
    notificationAction = 'merge'
  } else if (action === 'on_hold') {
    await prisma.localGroupSuggestion.update({
      where: { id: suggestionId },
      data: { ...reviewBase, status: 'on_hold', adminNotes },
    })
    notificationAction = 'on_hold'
  } else if (action === 'decline') {
    await prisma.localGroupSuggestion.update({
      where: { id: suggestionId },
      data: { ...reviewBase, status: 'declined', adminNotes },
    })
    notificationAction = 'declined'
  }

  const titleFn = NOTIFICATION_TITLES[notificationAction]
  const title = titleFn ? titleFn(finalName) : `Update on your local group suggestion`

  await createNotification(
    suggestion.suggestedBy.id,
    'local_group_suggestion',
    title,
    adminNotes,
    '/suggest-local-group',
  )

  await sendLocalGroupSuggestionEmail({
    to: suggestion.suggestedBy.email ?? '',
    name: suggestion.suggestedBy.name ?? 'there',
    action: notificationAction,
    groupName: finalName,
    adminNotes,
  })

  return NextResponse.json({ message: 'Suggestion updated' })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const { id } = await params
  const suggestionId = parseInt(id, 10)
  if (isNaN(suggestionId)) {
    return NextResponse.json({ detail: 'Invalid ID' }, { status: 400 })
  }

  const suggestion = await prisma.localGroupSuggestion.findUnique({ where: { id: suggestionId } })
  if (!suggestion) return NextResponse.json({ detail: 'Not found' }, { status: 404 })

  await prisma.localGroupSuggestion.delete({ where: { id: suggestionId } })

  return NextResponse.json({ message: 'Suggestion deleted' })
}
