import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { createNotification } from '@/lib/project'
import { fieldError, validationError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const errs: ReturnType<typeof fieldError>[] = []
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    errs.push(fieldError('title', 'Title is required'))
  } else if ((body.title as string).length > 300) {
    errs.push(fieldError('title', 'Title must be 300 characters or fewer'))
  }
  if (!body.description || typeof body.description !== 'string' || body.description.length < 10) {
    errs.push(fieldError('description', 'Description must be at least 10 characters'))
  }
  if (errs.length) return validationError(errs)

  const report = await prisma.bugReport.create({
    data: {
      reporterId: volunteer?.id ?? null,
      reporterEmail: volunteer ? volunteer.email : ((body.reporter_email as string | null) ?? null),
      title: (body.title as string).trim(),
      description: body.description as string,
      pageUrl: (body.page_url as string | null) ?? null,
      category: (body.category as string) || 'bug',
      severity: (body.severity as string) || 'medium',
    },
  })

  const admins = await prisma.volunteer.findMany({
    where: { isAdmin: true },
    select: { id: true },
  })
  await Promise.all(
    admins.map((admin) =>
      createNotification(
        admin.id,
        'new_bug_report',
        `New ${(body.category as string) || 'bug'}: ${(body.title as string).trim()}`,
        `Severity: ${(body.severity as string) || 'medium'}`,
        '/admin/bugs',
      ).catch((e) => console.error('[NOTIFY ERROR]', e)),
    ),
  )

  return Response.json({ id: report.id, message: 'Thank you for your feedback!' })
}
