import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer } from '@/lib/auth'
import { createNotification } from '@/lib/project'
import { parseBody } from '@/lib/errors'
import { CreateBugReportSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseBody(CreateBugReportSchema, raw)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const report = await prisma.bugReport.create({
    data: {
      reporterId: volunteer?.id ?? null,
      reporterEmail: volunteer ? volunteer.email : (body.reporterEmail ?? null),
      title: body.title.trim(),
      description: body.description,
      pageUrl: body.pageUrl ?? null,
      category: body.category ?? 'bug',
      severity: body.severity ?? 'medium',
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
        `New ${body.category ?? 'bug'}: ${body.title.trim()}`,
        `Severity: ${body.severity ?? 'medium'}`,
        '/admin/bugs',
      ).catch((e) => console.error('[NOTIFY ERROR]', e)),
    ),
  )

  return Response.json({ id: report.id, message: 'Thank you for your feedback!' })
}
