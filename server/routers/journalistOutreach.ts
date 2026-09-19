import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { generateAuthToken, hashToken } from '@/lib/auth'
import { sendOutreachLoginEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  CLAIM_MS,
  OUTREACH_SESSION_EXPIRED,
  OUTREACH_TOKEN_HEADER,
  claimCutoff,
} from '@/lib/journalist-outreach'
import type { ExperimentalJournalist as Journalist } from '@/generated/prisma/client'
import { ExperimentalJournalistLeaning } from '@/generated/prisma/enums'
import { authedProcedure, publicProcedure } from '../procedures'

const LOGIN_TOKEN_TTL_MS = 60 * 60 * 1000
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

function limit(request: Request, route: string, max: number) {
  if (!checkRateLimit(request, route, { limit: max, windowMs: 60 * 60 * 1000 }).allowed) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message: 'Too many requests. Try again later.' })
  }
}

const participantProcedure = publicProcedure.use(async ({ context, next }) => {
  const token = context.request.headers.get(OUTREACH_TOKEN_HEADER)
  const session = token
    ? await prisma.experimentalOutreachSession.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { participant: true },
      })
    : null
  // Not UNAUTHORIZED: the client treats that as the main login expiring and signs the user out.
  if (!session || session.expiresAt < new Date()) {
    throw new ORPCError(OUTREACH_SESSION_EXPIRED, { status: 401 })
  }
  return next({ context: { participant: session.participant } })
})

async function isPaused() {
  const settings = await prisma.experimentalOutreachSettings.findUnique({ where: { id: 1 } })
  return settings?.paused ?? false
}

/** Journalists that nobody has contacted and nobody holds a live claim on. */
const availableWhere = (now: Date) => ({
  contactedAt: null,
  OR: [{ claimedAt: null }, { claimedAt: { lte: claimCutoff(now) } }],
})

async function activeClaim(participantId: number, now: Date) {
  return prisma.experimentalJournalist.findFirst({
    where: { claimedById: participantId, contactedAt: null, claimedAt: { gt: claimCutoff(now) } },
  })
}

async function createOutreachSession(participantId: number): Promise<string> {
  const token = generateAuthToken()
  await prisma.experimentalOutreachSession.create({
    data: {
      participantId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  return token
}

function toTask(j: Journalist, claimedAt: Date) {
  return {
    id: j.id,
    firstName: j.firstName,
    lastName: j.lastName,
    email: j.email,
    organisation: j.organisation,
    leaning: j.leaning,
    leaningConfidence: j.leaningConfidence,
    medium: j.medium,
    website: j.website,
    interests: j.interests,
    notes: j.notes,
    claimExpiresAt: new Date(claimedAt.getTime() + CLAIM_MS),
  }
}

export const journalistOutreachRouter = {
  status: publicProcedure.handler(async () => ({ paused: await isPaused() })),

  requestLink: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email().max(254) }))
    .handler(async ({ input, context }) => {
      limit(context.request, 'outreach-request-link', 10)
      const participant = await prisma.experimentalOutreachParticipant.upsert({
        where: { email: input.email },
        create: { email: input.email },
        update: {},
      })
      const loginToken = generateAuthToken()
      await prisma.experimentalOutreachLoginToken.create({
        data: {
          participantId: participant.id,
          tokenHash: hashToken(loginToken),
          expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
        },
      })
      await sendOutreachLoginEmail({ to: input.email, loginToken })
      return { success: true }
    }),

  verify: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      limit(context.request, 'outreach-verify', 30)
      const now = new Date()
      // Marking used in the same conditional update stops a link being redeemed twice.
      const login = await prisma.experimentalOutreachLoginToken.findUnique({
        where: { tokenHash: hashToken(input.token) },
      })
      const redeemed = login
        ? await prisma.experimentalOutreachLoginToken.updateMany({
            where: { id: login.id, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now },
          })
        : { count: 0 }
      if (!login || redeemed.count === 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'This link has expired or already been used. Request a new one.',
        })
      }
      const participant = await prisma.experimentalOutreachParticipant.findUniqueOrThrow({
        where: { id: login.participantId },
      })
      return { token: await createOutreachSession(participant.id), email: participant.email }
    }),

  /** Anyone logged in to Catalyse skips the email link and joins as their account email. */
  catalyseSignIn: authedProcedure.handler(async ({ context }) => {
    const email = context.volunteer.email?.toLowerCase()
    if (!email) {
      throw new ORPCError('BAD_REQUEST', { message: 'Your account has no email address.' })
    }
    // The emailed link proves the address for everyone else; an account must have too.
    if (!context.volunteer.emailConfirmed) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Confirm your email address first, or request a sign-in link instead.',
      })
    }
    const participant = await prisma.experimentalOutreachParticipant.upsert({
      where: { email },
      create: { email },
      update: {},
    })
    return { token: await createOutreachSession(participant.id), email }
  }),

  current: participantProcedure.handler(async ({ context }) => {
    const now = new Date()
    const { participant } = context
    await prisma.experimentalOutreachParticipant.update({
      where: { id: participant.id },
      data: { lastSeenAt: now },
    })
    const [claim, contactedCount, availableCount] = await Promise.all([
      activeClaim(participant.id, now),
      prisma.experimentalJournalist.count({ where: { contactedById: participant.id } }),
      prisma.experimentalJournalist.count({ where: availableWhere(now) }),
    ])
    return {
      email: participant.email,
      contactedCount,
      availableCount,
      task: claim ? toTask(claim, claim.claimedAt ?? now) : null,
    }
  }),

  claimNext: participantProcedure.handler(async ({ context }) => {
    const { participant } = context
    const now = new Date()
    const existing = await activeClaim(participant.id, now)
    if (existing) return toTask(existing, existing.claimedAt ?? now)
    if (await isPaused()) {
      throw new ORPCError('FORBIDDEN', {
        message: "We're adjusting our approach to contacting journalists. Come back soon.",
      })
    }

    // Another volunteer can claim the same candidate between the read and the write; the
    // conditional update then matches nothing and the next candidate is tried. Each lost
    // race removes a candidate, so the loop ends.
    for (;;) {
      const candidate = await prisma.experimentalJournalist.findFirst({
        where: availableWhere(now),
        // Highest priority tier first (untiered last); within a tier, skipped ones go behind.
        orderBy: [
          { priorityTier: { sort: 'asc', nulls: 'last' } },
          { skipCount: 'asc' },
          { id: 'asc' },
        ],
      })
      if (!candidate) return null
      const won = await prisma.experimentalJournalist.updateMany({
        where: { id: candidate.id, ...availableWhere(now) },
        data: { claimedById: participant.id, claimedAt: now },
      })
      if (won.count === 1) return toTask(candidate, now)
    }
  }),

  markSent: participantProcedure
    .input(
      z.object({
        journalistId: z.number().int(),
        sentLeaning: z.enum(ExperimentalJournalistLeaning),
      }),
    )
    .handler(async ({ input, context }) => {
      const { participant } = context
      const now = new Date()
      // A lapsed claim still counts if nobody else has picked the journalist up since: the
      // email was sent either way.
      const updated = await prisma.experimentalJournalist.updateMany({
        where: {
          id: input.journalistId,
          contactedAt: null,
          OR: [
            { claimedById: participant.id },
            { claimedAt: null },
            { claimedAt: { lte: claimCutoff(now) } },
          ],
        },
        data: {
          contactedById: participant.id,
          contactedAt: now,
          sentLeaning: input.sentLeaning,
          claimedById: null,
          claimedAt: null,
        },
      })
      if (updated.count === 0) {
        throw new ORPCError('CONFLICT', {
          message:
            'Another volunteer has already picked up this journalist. Please let press@pauseai.info know you emailed them too.',
        })
      }
      const contactedCount = await prisma.experimentalJournalist.count({
        where: { contactedById: participant.id },
      })
      return { contactedCount }
    }),

  reportBounce: participantProcedure
    .input(z.object({ journalistId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const updated = await prisma.experimentalJournalist.updateMany({
        where: {
          id: input.journalistId,
          contactedById: context.participant.id,
          bouncedAt: null,
        },
        data: { bouncedAt: new Date() },
      })
      if (updated.count === 0) {
        throw new ORPCError('CONFLICT', {
          message: 'Could not find that journalist in your sent list.',
        })
      }
      return { success: true }
    }),

  release: participantProcedure
    .input(z.object({ journalistId: z.number().int() }))
    .handler(async ({ input, context }) => {
      // Skipped and timed-out journalists both drop behind untried ones, so the volunteer
      // who let one go isn't handed it straight back.
      await prisma.experimentalJournalist.updateMany({
        where: { id: input.journalistId, claimedById: context.participant.id, contactedAt: null },
        data: { claimedById: null, claimedAt: null, skipCount: { increment: 1 } },
      })
      return { success: true }
    }),
}
