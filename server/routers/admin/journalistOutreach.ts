import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  CSV_COLUMNS,
  journalistStatus,
  parseJournalistCsv,
  toCsv,
  type JournalistRow,
} from '@/lib/journalist-outreach'
import { adminProcedure } from '../../procedures'

const CsvInput = z.object({ csv: z.string().max(2_000_000) })

async function planImport(csv: string) {
  const { missingColumns, valid, invalid } = parseJournalistCsv(csv)
  const existing = new Set(
    (
      await prisma.experimentalJournalist.findMany({
        where: { email: { in: valid.map((r) => r.email) } },
        select: { email: true },
      })
    ).map((j) => j.email),
  )
  const seen = new Set<string>()
  const toCreate: (JournalistRow & { line: number })[] = []
  const duplicates: { line: number; email: string; reason: string }[] = []
  for (const row of valid) {
    if (existing.has(row.email)) {
      duplicates.push({ line: row.line, email: row.email, reason: 'Already on the list' })
    } else if (seen.has(row.email)) {
      duplicates.push({ line: row.line, email: row.email, reason: 'Repeated in this import' })
    } else {
      seen.add(row.email)
      toCreate.push(row)
    }
  }
  return { missingColumns, toCreate, duplicates, invalid }
}

export const adminJournalistOutreachRouter = {
  previewImport: adminProcedure.input(CsvInput).handler(({ input }) => planImport(input.csv)),

  commitImport: adminProcedure.input(CsvInput).handler(async ({ input }) => {
    const { toCreate } = await planImport(input.csv)
    const { count } = await prisma.experimentalJournalist.createMany({
      data: toCreate.map(({ line: _line, ...row }) => row),
    })
    return { created: count }
  }),

  list: adminProcedure.handler(async () => {
    const now = new Date()
    const journalists = await prisma.experimentalJournalist.findMany({
      orderBy: { id: 'asc' },
      include: {
        claimedBy: { select: { email: true } },
        contactedBy: { select: { email: true } },
      },
    })
    const rows = journalists.map((j) => ({
      id: j.id,
      firstName: j.firstName,
      lastName: j.lastName,
      email: j.email,
      organisation: j.organisation,
      leaning: j.leaning,
      leaningConfidence: j.leaningConfidence,
      sentLeaning: j.sentLeaning,
      priorityTier: j.priorityTier,
      skipCount: j.skipCount,
      status: journalistStatus(j, now),
      claimedBy: j.claimedBy?.email ?? null,
      claimedAt: j.claimedAt,
      contactedBy: j.contactedBy?.email ?? null,
      contactedAt: j.contactedAt,
      bouncedAt: j.bouncedAt,
    }))
    const count = (s: string) => rows.filter((r) => r.status === s).length
    return {
      journalists: rows,
      totals: {
        available: count('available'),
        claimed: count('claimed'),
        contacted: count('contacted'),
        bounced: count('bounced'),
        volunteers: new Set(rows.map((r) => r.contactedBy).filter(Boolean)).size,
      },
    }
  }),

  reset: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    await prisma.experimentalJournalist.update({
      where: { id: input.id },
      data: {
        claimedById: null,
        claimedAt: null,
        contactedById: null,
        contactedAt: null,
        sentLeaning: null,
        bouncedAt: null,
      },
    })
    return { success: true }
  }),

  delete: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    await prisma.experimentalJournalist.delete({ where: { id: input.id } })
    return { success: true }
  }),

  exportCsv: adminProcedure.handler(async () => {
    const journalists = await prisma.experimentalJournalist.findMany({
      orderBy: { id: 'asc' },
      include: { contactedBy: { select: { email: true } } },
    })
    // Same headers as the import, so an export can be edited and re-imported.
    const fields = Object.keys(CSV_COLUMNS) as (keyof typeof CSV_COLUMNS)[]
    return toCsv([
      [
        ...fields.map((f) => CSV_COLUMNS[f].header),
        'Contacted by',
        'Contacted at',
        'Sent template',
      ],
      ...journalists.map((j) => [
        ...fields.map((f) => j[f]),
        j.contactedBy?.email ?? null,
        j.contactedAt?.toISOString() ?? null,
        j.sentLeaning,
      ]),
    ])
  }),
}
