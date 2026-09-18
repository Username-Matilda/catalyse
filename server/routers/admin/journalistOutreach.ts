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

// Claim/contact state (claimedById, contactedAt, sentLeaning, ...) is never touched by an
// import — only the fields a CSV can actually describe.
const UPDATABLE_FIELDS = (Object.keys(CSV_COLUMNS) as (keyof typeof CSV_COLUMNS)[]).filter(
  (f) => f !== 'email',
)

type FieldChange = { field: string; from: unknown; to: unknown }

async function planImport(csv: string) {
  const { missingColumns, valid, invalid } = parseJournalistCsv(csv)
  const existing = new Map(
    (
      await prisma.experimentalJournalist.findMany({
        where: { email: { in: valid.map((r) => r.email) } },
      })
    ).map((j) => [j.email, j]),
  )
  const seen = new Set<string>()
  const toCreate: (JournalistRow & { line: number })[] = []
  const toUpdate: { line: number; email: string; id: number; changes: FieldChange[] }[] = []
  const duplicates: { line: number; email: string; reason: string }[] = []
  for (const row of valid) {
    const match = existing.get(row.email)
    if (match) {
      if (seen.has(row.email)) {
        duplicates.push({ line: row.line, email: row.email, reason: 'Repeated in this import' })
        continue
      }
      seen.add(row.email)
      const changes = UPDATABLE_FIELDS.flatMap((field) =>
        row[field] === match[field] ? [] : [{ field, from: match[field], to: row[field] }],
      )
      if (changes.length > 0)
        toUpdate.push({ line: row.line, email: row.email, id: match.id, changes })
      else
        duplicates.push({
          line: row.line,
          email: row.email,
          reason: 'Already on the list, no changes',
        })
    } else if (seen.has(row.email)) {
      duplicates.push({ line: row.line, email: row.email, reason: 'Repeated in this import' })
    } else {
      seen.add(row.email)
      toCreate.push(row)
    }
  }
  return { missingColumns, toCreate, toUpdate, duplicates, invalid }
}

export const adminJournalistOutreachRouter = {
  getPaused: adminProcedure.handler(async () => {
    const settings = await prisma.experimentalOutreachSettings.findUnique({ where: { id: 1 } })
    return { paused: settings?.paused ?? false }
  }),

  setPaused: adminProcedure.input(z.object({ paused: z.boolean() })).handler(async ({ input }) => {
    const settings = await prisma.experimentalOutreachSettings.upsert({
      where: { id: 1 },
      create: { id: 1, paused: input.paused },
      update: { paused: input.paused },
    })
    return { paused: settings.paused }
  }),

  previewImport: adminProcedure.input(CsvInput).handler(({ input }) => planImport(input.csv)),

  commitImport: adminProcedure.input(CsvInput).handler(async ({ input }) => {
    const { toCreate, toUpdate } = await planImport(input.csv)
    const { count } = await prisma.experimentalJournalist.createMany({
      data: toCreate.map(({ line: _line, ...row }) => row),
    })
    for (const { id, changes } of toUpdate) {
      await prisma.experimentalJournalist.update({
        where: { id },
        data: Object.fromEntries(changes.map(({ field, to }) => [field, to])),
      })
    }
    return { created: count, updated: toUpdate.length }
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
