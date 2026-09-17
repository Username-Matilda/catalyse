import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { generateAuthToken, hashToken } from '@/lib/auth'
import {
  CLAIM_MS,
  OUTREACH_PATH,
  OUTREACH_TOKEN_STORAGE_KEY,
  fullName,
} from '@/lib/journalist-outreach'
import type { Prisma } from '@/generated/prisma/client'
import { createVolunteer, nextSeq } from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import JournalistOutreachPage from './page'
import OutreachVerifyPage from './verify/page'

vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendOutreachLoginEmail: vi.fn(async () => true),
}))
import { sendOutreachLoginEmail } from '@/lib/email'

beforeEach(() => prisma.experimentalJournalist.deleteMany())

async function signedIn() {
  const participant = await prisma.experimentalOutreachParticipant.create({
    data: { email: `vol${nextSeq()}@example.com` },
  })
  const token = generateAuthToken()
  const session = await prisma.experimentalOutreachSession.create({
    data: {
      participantId: participant.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })
  localStorage.setItem(OUTREACH_TOKEN_STORAGE_KEY, token)
  return { participant, session }
}

const createJournalist = async (
  data: Partial<Prisma.ExperimentalJournalistUncheckedCreateInput> = {},
) => {
  const n = nextSeq()
  const j = await prisma.experimentalJournalist.create({
    data: {
      firstName: 'Reporter',
      lastName: `${n}`,
      email: `r${n}@press.com`,
      organisation: 'Daily Planet',
      leaning: 'DEMOCRAT',
      notes: 'Covers tech policy',
      ...data,
    },
  })
  return { ...j, name: fullName(j) }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })

/**
 * Moves the clock past the claim window. Only `Date` is faked: the countdown's real interval
 * still ticks and reads the new time, and Testing Library's polling keeps working.
 */
function runOutTheClaim() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + CLAIM_MS + 1000)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('journalist outreach sign-in', () => {
  it('sends a sign-in link and shows errors from the server', async () => {
    await renderApp(<JournalistOutreachPage />)
    await userEvent.type(screen.getByLabelText('Your email'), 'sam@example.com')
    await userEvent.click(button('Send me a link'))
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
    expect(vi.mocked(sendOutreachLoginEmail).mock.lastCall![0].to).toBe('sam@example.com')

    await userEvent.click(button('Use a different email'))
    await userEvent.clear(screen.getByLabelText('Your email'))
    await userEvent.type(screen.getByLabelText('Your email'), 'not-an-email')
    fireEvent.submit(screen.getByLabelText('Your email').closest('form')!)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('lets someone logged in to Catalyse continue without a link', async () => {
    const volunteer = await createVolunteer()
    await renderApp(<JournalistOutreachPage />, { as: volunteer })
    await userEvent.click(
      await screen.findByRole('button', { name: `Continue as ${volunteer.email}` }),
    )
    expect(await screen.findByText(`Signed in as ${volunteer.email}`, { exact: false }))
    expect(localStorage.getItem(OUTREACH_TOKEN_STORAGE_KEY)).toBeTruthy()
    expect(sendOutreachLoginEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: volunteer.email }),
    )
  })

  it('redeems a link and stores the session, or explains a bad link', async () => {
    await prisma.experimentalOutreachParticipant.create({ data: { email: 'link@example.com' } })
    const participant = await prisma.experimentalOutreachParticipant.findUniqueOrThrow({
      where: { email: 'link@example.com' },
    })
    const token = generateAuthToken()
    await prisma.experimentalOutreachLoginToken.create({
      data: {
        participantId: participant.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    const { unmount } = await renderApp(<OutreachVerifyPage />, {
      url: `${OUTREACH_PATH}/verify?token=${token}`,
    })
    expect(screen.getByText('Signing you in…')).toBeInTheDocument()
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(OUTREACH_PATH))
    expect(localStorage.getItem(OUTREACH_TOKEN_STORAGE_KEY)).toBeTruthy()
    unmount()

    const second = await renderApp(<OutreachVerifyPage />, {
      url: `${OUTREACH_PATH}/verify?token=${token}`,
    })
    expect(await screen.findByText(/expired or already been used/)).toBeInTheDocument()
    second.unmount()

    await renderApp(<OutreachVerifyPage />, { url: `${OUTREACH_PATH}/verify` })
    expect(screen.getByText('This link is missing its token.')).toBeInTheDocument()
  })
})

describe('journalist outreach task flow', () => {
  it('claims, copies, skips, confirms sending and runs out of journalists', async () => {
    const { participant } = await signedIn()
    const first = await createJournalist({
      leaning: 'REPUBLICAN',
      leaningConfidence: 'HIGH',
      medium: 'Web journalist',
      website: 'https://planet.com',
      interests: 'AI policy',
    })
    const second = await createJournalist({ leaningConfidence: 'MEDIUM' })
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })

    await renderApp(<JournalistOutreachPage />)
    expect(await screen.findByText(`Signed in as ${participant.email}`, { exact: false }))
    expect(screen.getByText('2 journalists waiting.', { exact: false })).toBeInTheDocument()
    expect(button('Get a journalist')).toBeDisabled()
    expect(screen.getByText('Add your name first.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Your name/), 'Sam')
    expect(localStorage.getItem('outreachName')).toBe('Sam')
    await userEvent.click(button('Get a journalist'))
    expect(await screen.findByRole('heading', { name: first.name })).toBeInTheDocument()
    expect(screen.getByText('Republican-leaning · high confidence')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /template/ })).not.toBeInTheDocument()
    expect(screen.getByText('Note: Covers tech policy')).toBeInTheDocument()
    expect(screen.getByText('Covers: AI policy')).toBeInTheDocument()
    expect(screen.getByText(/Daily Planet · Web journalist/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      'https://planet.com',
    )
    expect(screen.getByLabelText('Time left')).toHaveTextContent(/^(20:00|19:5\d) left$/)
    expect(screen.getByRole('link', { name: 'Open in Gmail' })).toHaveAttribute(
      'href',
      expect.stringContaining('mail.google.com'),
    )
    expect(screen.getByText(/Dear Reporter,/)).toHaveTextContent(/Sam$/)

    await userEvent.click(button('Copy To'))
    expect(writeText).toHaveBeenCalledWith(first.email)
    expect(await screen.findByText('To copied')).toBeInTheDocument()
    writeText.mockRejectedValueOnce(new Error('denied'))
    await userEvent.click(button('Copy Body'))
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument()

    await userEvent.click(button('Skip this journalist'))
    await screen.findByRole('button', { name: 'Get a journalist' })
    await userEvent.click(button('Get a journalist'))
    // The skipped journalist drops behind the one nobody has passed on.
    expect(await screen.findByRole('heading', { name: second.name })).toBeInTheDocument()
    expect(screen.getByText('Democrat-leaning · medium confidence')).toBeInTheDocument()

    // Not sure of the leaning: the volunteer can try the other template and back again.
    expect(screen.getByText(/We're not sure Reporter \d+ leans Democrat/)).toBeInTheDocument()
    const body = () => screen.getByText(/^Dear Reporter,/).textContent
    const democratBody = body()
    await userEvent.click(button('Use the Republican template instead'))
    expect(screen.getByText(/You're using the Republican template/)).toBeInTheDocument()
    expect(body()).not.toBe(democratBody)
    await userEvent.click(button('Switch back to the Democrat template'))
    expect(body()).toBe(democratBody)
    await userEvent.click(button('Use the Republican template instead'))

    await userEvent.click(button('I have sent it'))
    const dialog = screen.getByRole('dialog', { name: 'Definitely sent?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(button('I have sent it'))
    await userEvent.click(button("Yes, it's sent"))
    expect(await screen.findByText('Thank you!')).toBeInTheDocument()
    expect(screen.getByText("That's 1 journalist you've contacted.")).toBeInTheDocument()
    expect(
      await prisma.experimentalJournalist.findUniqueOrThrow({ where: { id: second.id } }),
    ).toMatchObject({ contactedById: participant.id, sentLeaning: 'REPUBLICAN' })

    await prisma.experimentalJournalist.update({
      where: { id: first.id },
      data: { contactedAt: new Date(), contactedById: participant.id },
    })
    await userEvent.click(button('Do another'))
    expect(await screen.findByText(/Every journalist is taken right now/)).toBeInTheDocument()
  })

  it('releases a journalist when the claim runs out and lets the volunteer carry on', async () => {
    const { participant } = await signedIn()
    localStorage.setItem('outreachName', 'Sam')
    const held = await createJournalist({ claimedById: participant.id, claimedAt: new Date() })
    const next = await createJournalist()

    await renderApp(<JournalistOutreachPage />)
    await screen.findByRole('heading', { name: held.name })
    runOutTheClaim()
    expect(await screen.findByText(/released .* back to other volunteers/)).toBeInTheDocument()
    // "Get another" is enabled once the release has reached the server.
    await waitFor(() => expect(button('Get another')).toBeEnabled())
    expect(
      (await prisma.experimentalJournalist.findUniqueOrThrow({ where: { id: held.id } })).claimedAt,
    ).toBeNull()

    await userEvent.click(button('I already sent it'))
    expect(await screen.findByText('Thank you!')).toBeInTheDocument()

    await userEvent.click(button('Do another'))
    expect(await screen.findByRole('heading', { name: next.name })).toBeInTheDocument()
  })

  it('offers another journalist or a break after a claim expires', async () => {
    const { participant } = await signedIn()
    localStorage.setItem('outreachName', 'Sam')
    const held = await createJournalist({ claimedById: participant.id, claimedAt: new Date() })
    const spare = await createJournalist()

    const { unmount } = await renderApp(<JournalistOutreachPage />)
    await screen.findByRole('heading', { name: held.name })
    runOutTheClaim()
    await screen.findByRole('dialog', { name: 'Journalist released' })
    await waitFor(() => expect(button('Get another')).toBeEnabled())
    await userEvent.click(button('Done for now'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()

    await prisma.experimentalJournalist.update({
      where: { id: held.id },
      data: { claimedById: participant.id, claimedAt: new Date() },
    })
    await renderApp(<JournalistOutreachPage />)
    await screen.findByRole('heading', { name: held.name })
    runOutTheClaim()
    await screen.findByRole('dialog', { name: 'Journalist released' })
    await waitFor(() => expect(button('Get another')).toBeEnabled())
    await userEvent.click(button('Get another'))
    expect(await screen.findByRole('heading', { name: spare.name })).toBeInTheDocument()
  })

  it('signs out when the session has expired and reports failed actions', async () => {
    const { session } = await signedIn()
    await renderApp(<JournalistOutreachPage />)
    await screen.findByText(/Signed in as/)
    localStorage.setItem('outreachName', 'Sam')
    await userEvent.type(screen.getByLabelText(/Your name/), 'Sam')

    await prisma.experimentalOutreachSession.delete({ where: { id: session.id } })
    await userEvent.click(button('Get a journalist'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.click(button('Sign out'))
    expect(await screen.findByLabelText('Your email')).toBeInTheDocument()
    expect(localStorage.getItem(OUTREACH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('returns to the sign-in form when a stored session is no longer valid', async () => {
    localStorage.setItem(OUTREACH_TOKEN_STORAGE_KEY, 'stale')
    await renderApp(<JournalistOutreachPage />)
    expect(await screen.findByLabelText('Your email')).toBeInTheDocument()
    expect(localStorage.getItem(OUTREACH_TOKEN_STORAGE_KEY)).toBeNull()
  })
})
