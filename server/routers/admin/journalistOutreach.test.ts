import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { parseJournalistCsv } from '@/lib/journalist-outreach'
import { createAdmin, createVolunteer } from '@/test/factories'
import { anon, clientAs } from '@/test/rpc'

beforeEach(() => prisma.experimentalJournalist.deleteMany())

const CSV = [
  'First name,Last name,Email,Organisation,Leaning,Interests/areas of activity,Priority/Tier',
  'Jane,Doe,jane@x.com,Daily Planet,R,,',
  'Old,Timer,OLD@x.com,Gazette,D,,',
  'Jane,Again,jane@x.com,Other,D,,',
  'Broken,Row,nope,P,R,,',
  'Sam,Lee,sam@x.com,Tribune,Democrat,covers AI,Tier 1 - VIP',
].join('\n')

const base = { lastName: 'Doe', organisation: 'P', leaning: 'REPUBLICAN' as const }

describe('admin.journalistOutreach', () => {
  it('previews and imports new journalists, skipping duplicates and invalid rows', async () => {
    const api = clientAs(await createAdmin()).admin.journalistOutreach
    await prisma.experimentalJournalist.create({
      data: { ...base, firstName: 'Old', email: 'old@x.com' },
    })

    const preview = await api.previewImport({ csv: CSV })
    expect(preview.missingColumns).toEqual([])
    expect(preview.toCreate.map((r) => r.email)).toEqual(['jane@x.com', 'sam@x.com'])
    expect(preview.duplicates).toEqual([
      { line: 3, email: 'old@x.com', reason: 'Already on the list' },
      { line: 4, email: 'jane@x.com', reason: 'Repeated in this import' },
    ])
    expect(preview.invalid).toHaveLength(1)
    expect(await prisma.experimentalJournalist.count()).toBe(1)

    expect(await api.commitImport({ csv: CSV })).toEqual({ created: 2 })
    expect(await api.commitImport({ csv: CSV })).toEqual({ created: 0 })
    expect(
      await prisma.experimentalJournalist.findUnique({ where: { email: 'sam@x.com' } }),
    ).toMatchObject({
      firstName: 'Sam',
      lastName: 'Lee',
      organisation: 'Tribune',
      leaning: 'DEMOCRAT',
      interests: 'covers AI',
      priorityTier: 1,
      notes: null,
    })
  })

  it('reports missing columns without importing', async () => {
    const api = clientAs(await createAdmin()).admin.journalistOutreach
    const csv = 'Name,Email\nJane Doe,jane@x.com'
    expect(await api.previewImport({ csv })).toMatchObject({
      missingColumns: ['First name', 'Last name', 'Organisation', 'Leaning'],
      toCreate: [],
    })
    expect(await api.commitImport({ csv })).toEqual({ created: 0 })
  })

  it('lists status and totals, resets, deletes and exports a re-importable CSV', async () => {
    const api = clientAs(await createAdmin()).admin.journalistOutreach
    const p = await prisma.experimentalOutreachParticipant.create({
      data: { email: 'vol@example.com' },
    })
    const now = new Date()
    const available = await prisma.experimentalJournalist.create({
      data: {
        ...base,
        firstName: 'A',
        email: 'a@x.com',
        claimedAt: new Date(0),
        leaningConfidence: 'LOW',
        category: 'AI press',
        priorityTier: 1,
        medium: 'Web',
        website: 'https://a.com',
        interests: 'AI, policy',
        notes: 'n',
      },
    })
    const claimed = await prisma.experimentalJournalist.create({
      data: { ...base, firstName: 'B', email: 'b@x.com', claimedById: p.id, claimedAt: now },
    })
    const contacted = await prisma.experimentalJournalist.create({
      data: {
        ...base,
        firstName: 'C',
        email: 'c@x.com',
        contactedById: p.id,
        contactedAt: now,
        sentLeaning: 'DEMOCRAT',
      },
    })

    const list = await api.list()
    expect(list.totals).toEqual({ available: 1, claimed: 1, contacted: 1, volunteers: 1 })
    expect(list.journalists.map((j) => [j.id, j.status, j.claimedBy, j.contactedBy])).toEqual([
      [available.id, 'available', null, null],
      [claimed.id, 'claimed', 'vol@example.com', null],
      [contacted.id, 'contacted', null, 'vol@example.com'],
    ])
    expect(list.journalists[0]).toMatchObject({
      firstName: 'A',
      priorityTier: 1,
      leaningConfidence: 'LOW',
      sentLeaning: null,
    })
    expect(list.journalists[2]).toMatchObject({ leaning: 'REPUBLICAN', sentLeaning: 'DEMOCRAT' })

    const exported = await api.exportCsv()
    expect(exported.split('\n')).toEqual([
      'First name,Last name,Email,Organisation,Leaning,Leaning confidence,Category,Priority/Tier,Medium,Website,Interests/areas of activity,Notes,Contacted by,Contacted at,Sent template',
      'A,Doe,a@x.com,P,REPUBLICAN,LOW,AI press,1,Web,https://a.com,"AI, policy",n,,,',
      'B,Doe,b@x.com,P,REPUBLICAN,,,,,,,,,,',
      `C,Doe,c@x.com,P,REPUBLICAN,,,,,,,,vol@example.com,${now.toISOString()},DEMOCRAT`,
    ])
    expect(parseJournalistCsv(exported).valid).toHaveLength(3)

    await api.reset({ id: contacted.id })
    expect(
      await prisma.experimentalJournalist.findUniqueOrThrow({ where: { id: contacted.id } }),
    ).toMatchObject({ contactedAt: null, sentLeaning: null })
    await api.delete({ id: claimed.id })
    expect((await api.list()).totals).toEqual({
      available: 2,
      claimed: 0,
      contacted: 0,
      volunteers: 0,
    })
  })

  it('is admin only', async () => {
    await expect(anon().admin.journalistOutreach.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(
      clientAs(await createVolunteer()).admin.journalistOutreach.previewImport({ csv: '' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
