import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { generateAuthToken, hashToken } from '@/lib/auth'
import { CLAIM_MS, OUTREACH_TOKEN_HEADER } from '@/lib/journalist-outreach'
import { anon, clientAs } from '@/test/rpc'
import { nextSeq } from '@/test/factories'

const { checkRateLimitMock } = vi.hoisted(() => ({ checkRateLimitMock: vi.fn() }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/rate-limit')>()
  checkRateLimitMock.mockImplementation(original.checkRateLimit)
  return { ...original, checkRateLimit: checkRateLimitMock }
})

vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendOutreachLoginEmail: vi.fn(async () => true),
}))
import { sendOutreachLoginEmail } from '@/lib/email'

beforeEach(async () => {
  vi.clearAllMocks()
  await prisma.experimentalJournalist.deleteMany()
})

const as = (token: string) =>
  clientAs(null, {
    request: new Request('http://localhost/api/rpc', {
      headers: { [OUTREACH_TOKEN_HEADER]: token },
    }),
  })

/** Signs a new participant in through the magic link flow and returns their client. */
async function signIn(email = `p${nextSeq()}@example.com`) {
  await anon().journalistOutreach.requestLink({ email })
  const { loginToken } = vi.mocked(sendOutreachLoginEmail).mock.lastCall![0]
  const { token } = await anon().journalistOutreach.verify({ token: loginToken })
  const participant = await prisma.experimentalOutreachParticipant.findUniqueOrThrow({
    where: { email },
  })
  return { api: as(token).journalistOutreach, participant, token }
}

const createJournalist = (
  overrides: { skipCount?: number; claimedAt?: Date; priorityTier?: number } = {},
) => {
  const n = nextSeq()
  return prisma.experimentalJournalist.create({
    data: {
      firstName: 'Journalist',
      lastName: `${n}`,
      email: `j${n}@press.com`,
      organisation: 'Daily Planet',
      leaning: 'DEMOCRAT',
      website: 'https://planet.com',
      interests: 'AI policy',
      ...overrides,
    },
  })
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000)

describe('journalistOutreach sign-in', () => {
  it('emails a one-use link that signs the normalised email in', async () => {
    await anon().journalistOutreach.requestLink({ email: '  Sam@Example.com ' })
    const { to, loginToken } = vi.mocked(sendOutreachLoginEmail).mock.lastCall![0]
    expect(to).toBe('sam@example.com')

    const res = await anon().journalistOutreach.verify({ token: loginToken })
    expect(res.email).toBe('sam@example.com')
    await expect(as(res.token).journalistOutreach.current()).resolves.toMatchObject({
      email: 'sam@example.com',
      task: null,
    })

    await expect(anon().journalistOutreach.verify({ token: loginToken })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    // A second request reuses the same participant.
    await anon().journalistOutreach.requestLink({ email: 'sam@example.com' })
    expect(
      await prisma.experimentalOutreachParticipant.count({ where: { email: 'sam@example.com' } }),
    ).toBe(1)
  })

  it('rejects unknown and expired links', async () => {
    await expect(anon().journalistOutreach.verify({ token: 'nope' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const participant = await prisma.experimentalOutreachParticipant.create({
      data: { email: `old${nextSeq()}@example.com` },
    })
    const token = generateAuthToken()
    await prisma.experimentalOutreachLoginToken.create({
      data: {
        participantId: participant.id,
        tokenHash: hashToken(token),
        expiresAt: minutesAgo(1),
      },
    })
    await expect(anon().journalistOutreach.verify({ token })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('refuses participant calls without a live session', async () => {
    const expired = { code: 'OUTREACH_SESSION_EXPIRED', status: 401 }
    await expect(anon().journalistOutreach.current()).rejects.toMatchObject(expired)
    await expect(as('bogus').journalistOutreach.current()).rejects.toMatchObject(expired)
    const { participant } = await signIn()
    const token = generateAuthToken()
    await prisma.experimentalOutreachSession.create({
      data: {
        participantId: participant.id,
        tokenHash: hashToken(token),
        expiresAt: minutesAgo(1),
      },
    })
    await expect(as(token).journalistOutreach.current()).rejects.toMatchObject(expired)
  })

  it('rate limits link requests and verification', async () => {
    const denied = { allowed: false, retryAfterMs: 1 }
    checkRateLimitMock.mockReturnValueOnce(denied)
    await expect(
      anon().journalistOutreach.requestLink({ email: 'a@example.com' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    checkRateLimitMock.mockReturnValueOnce(denied)
    await expect(anon().journalistOutreach.verify({ token: 'x' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })
})

describe('journalistOutreach claiming', () => {
  it('hands out journalists by priority tier, then fewest skips, untiered last', async () => {
    const untiered = await createJournalist()
    const tier3 = await createJournalist({ priorityTier: 3 })
    const tier1Skipped = await createJournalist({ priorityTier: 1, skipCount: 1 })
    const tier1 = await createJournalist({ priorityTier: 1 })
    const tier2 = await createJournalist({ priorityTier: 2 })
    const { api } = await signIn()

    const order: number[] = []
    for (let i = 0; i < 5; i++) {
      const task = await api.claimNext()
      order.push(task!.id)
      await api.markSent({ journalistId: task!.id, sentLeaning: 'DEMOCRAT' })
    }
    expect(order).toEqual([tier1.id, tier1Skipped.id, tier2.id, tier3.id, untiered.id])
  })

  it('hands out the least-skipped journalist and keeps returning the same claim', async () => {
    await createJournalist({ skipCount: 2 })
    const fresh = await createJournalist()
    const { api } = await signIn()

    const task = await api.claimNext()
    expect(task).toMatchObject({
      id: fresh.id,
      firstName: 'Journalist',
      lastName: fresh.lastName,
      organisation: 'Daily Planet',
      leaning: 'DEMOCRAT',
      leaningConfidence: null,
      medium: null,
      website: 'https://planet.com',
      interests: 'AI policy',
      notes: null,
    })
    expect(task!.claimExpiresAt.getTime() - Date.now()).toBeGreaterThan(CLAIM_MS - 5000)
    expect((await api.claimNext())!.id).toBe(fresh.id)
    expect(await api.current()).toMatchObject({ task: { id: fresh.id }, availableCount: 1 })
  })

  it('never gives two volunteers the same journalist, and frees lapsed claims', async () => {
    const j = await createJournalist()
    const a = await signIn()
    const b = await signIn()
    expect((await a.api.claimNext())!.id).toBe(j.id)
    expect(await b.api.claimNext()).toBeNull()

    await prisma.experimentalJournalist.update({
      where: { id: j.id },
      data: { claimedAt: minutesAgo(21) },
    })
    expect(await a.api.current()).toMatchObject({ task: null })
    expect((await b.api.claimNext())!.id).toBe(j.id)
  })

  it('moves on to the next candidate when another volunteer wins the race', async () => {
    const first = await createJournalist()
    const second = await createJournalist()
    const { api } = await signIn()
    const updateMany = vi.spyOn(prisma.experimentalJournalist, 'updateMany')
    updateMany.mockImplementationOnce((async () => {
      await prisma.experimentalJournalist.update({
        where: { id: first.id },
        data: { claimedAt: new Date() },
      })
      return { count: 0 }
    }) as never)
    expect((await api.claimNext())!.id).toBe(second.id)
    updateMany.mockRestore()
  })

  it('marks a sent journalist contacted, including after the claim lapsed', async () => {
    const j1 = await createJournalist()
    const j2 = await createJournalist()
    const { api, participant } = await signIn()

    await api.claimNext()
    // The volunteer switched to the other template for this one.
    expect(await api.markSent({ journalistId: j1.id, sentLeaning: 'REPUBLICAN' })).toEqual({
      contactedCount: 1,
    })
    const contacted = await prisma.experimentalJournalist.findUniqueOrThrow({
      where: { id: j1.id },
    })
    expect(contacted).toMatchObject({
      contactedById: participant.id,
      claimedById: null,
      leaning: 'DEMOCRAT',
      sentLeaning: 'REPUBLICAN',
    })

    await api.claimNext()
    await api.release({ journalistId: j2.id })
    expect(await api.markSent({ journalistId: j2.id, sentLeaning: 'DEMOCRAT' })).toEqual({
      contactedCount: 2,
    })
    expect(await api.current()).toMatchObject({ contactedCount: 2, availableCount: 0 })
  })

  it('refuses to mark sent a journalist someone else holds or already contacted', async () => {
    const j = await createJournalist()
    const a = await signIn()
    const b = await signIn()
    await a.api.claimNext()
    await expect(
      b.api.markSent({ journalistId: j.id, sentLeaning: 'DEMOCRAT' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await a.api.markSent({ journalistId: j.id, sentLeaning: 'DEMOCRAT' })
    await expect(
      b.api.markSent({ journalistId: j.id, sentLeaning: 'DEMOCRAT' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('releases only the caller’s own claim, counting skips', async () => {
    const j = await createJournalist()
    const a = await signIn()
    const b = await signIn()
    await a.api.claimNext()
    await b.api.release({ journalistId: j.id })
    expect(
      await prisma.experimentalJournalist.findUniqueOrThrow({ where: { id: j.id } }),
    ).toMatchObject({
      claimedById: a.participant.id,
      skipCount: 0,
    })
    await a.api.release({ journalistId: j.id })
    expect(
      await prisma.experimentalJournalist.findUniqueOrThrow({ where: { id: j.id } }),
    ).toMatchObject({
      claimedById: null,
      skipCount: 1,
    })
  })
})
