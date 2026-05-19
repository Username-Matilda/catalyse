import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { isSuperAdmin } from '@/lib/auth'
import { sendPendingApplicationsSummaryEmail } from '@/lib/email'
import { APPLICATION_ANONYMISATION_MS } from '@/lib/applications'

export async function runApplicationsSummaryJob(): Promise<Record<string, unknown>> {
  const count = await prisma.volunteer.count({
    where: { approvalStatus: { in: ['PENDING', 'UNDER_REVIEW'] }, deletedAt: null },
  })

  if (!count) return { skipped: true, reason: 'no pending applications' }

  const admins = (
    await prisma.volunteer.findMany({
      where: { isAdmin: true, deletedAt: null },
      select: { name: true, email: true },
    })
  ).filter((a) => isSuperAdmin(a.email))

  let sent = 0
  for (const admin of admins) {
    if (admin.email) {
      await sendPendingApplicationsSummaryEmail({ to: admin.email, name: admin.name, count }).catch(
        (e) => console.error('[APPLICATIONS SUMMARY] Email failed:', e),
      )
      sent++
    }
  }

  return { sent, pending: count }
}

export async function runApplicationsAnonymisationJob(): Promise<Record<string, unknown>> {
  const cutoff = new Date(Date.now() - APPLICATION_ANONYMISATION_MS)

  const toAnonymise = await prisma.$queryRaw<
    Array<{
      id: number
      email: string | null
      rejected_at: string | null
      application_admin_notes: string | null
      application_applicant_notes: string | null
    }>
  >`
    SELECT id, email, rejected_at, application_admin_notes, application_applicant_notes
    FROM volunteers
    WHERE approval_status = 'REJECTED'
      AND rejected_at <= ${cutoff.toISOString()}
      AND deleted_at IS NULL
  `

  if (!toAnonymise.length) return { skipped: true, reason: 'no applications due for anonymisation' }

  let anonymised = 0
  for (const v of toAnonymise) {
    if (v.email) {
      const emailHash = createHash('sha256').update(v.email.toLowerCase().trim()).digest('hex')
      const rejectedAt = new Date(v.rejected_at!)
      await prisma.rejectedApplication.create({
        data: {
          emailHash,
          rejectedAt,
          adminNotes: v.application_admin_notes,
          applicantNotes: v.application_applicant_notes,
        },
      })
      await prisma.anonymisedEmail.upsert({
        where: { emailHash },
        create: { emailHash },
        update: {},
      })
    }

    await prisma.volunteer.update({
      where: { id: v.id },
      data: {
        name: '[Deleted User]',
        email: null,
        bio: null,
        discordHandle: null,
        signalNumber: null,
        whatsappNumber: null,
        contactNotes: null,
        location: null,
        otherSkills: null,
        authToken: null,
        passwordHash: null,
        applicationMessage: null,
        applicationAdminNotes: null,
        applicationApplicantNotes: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    anonymised++
  }

  return { anonymised }
}
