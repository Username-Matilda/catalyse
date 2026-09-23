import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, act, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createProject,
  createQuickTask,
  createSkill,
  createTask,
  createTeam,
} from '@/test/factories'
import { renderApp } from '@/test/render'
import HomePage from './page'

const DAY = 24 * 60 * 60 * 1000

/** Whether `a` comes before `b` in the document. */
const before = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('home', () => {
  it('shows a new applicant the checklist and notifications only', async () => {
    const pending = await createVolunteer({
      approvalStatus: 'pending',
      emailConfirmed: false,
      emailDigest: null,
    })
    await renderApp(<HomePage />, { as: pending, url: '/dashboard' })
    await screen.findByRole('heading', { name: `Hi ${pending.name}` })
    expect(document.title).toBe('Catalyse | Home')
    const checklist = screen.getByRole('region', { name: 'Getting started' })
    expect(within(checklist).getByText('Application under review')).toBeInTheDocument()
    expect(within(checklist).getByText(/Your account is pending approval/)).toBeInTheDocument()
    expect(within(checklist).getByRole('link', { name: 'Confirm your email' })).toHaveAttribute(
      'href',
      '/verify-email',
    )
    // No first task to pick until approved.
    expect(within(checklist).queryByRole('link', { name: 'Pick a first task' })).toBeNull()
    expect(within(checklist).getByText('Pick a first task')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Needs your attention/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'My work' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Propose a project' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument()

    expect(screen.getByText(/Stay in the loop/)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText(/Stay in the loop/)).toBeNull()
    cleanup()

    const needsInfo = await createVolunteer({ approvalStatus: 'needs_info' })
    await renderApp(<HomePage />, { as: needsInfo, url: '/dashboard' })
    expect(await screen.findByRole('link', { name: 'Update Application' })).toBeInTheDocument()
  })

  it('opens discovery for someone with nothing of their own yet', async () => {
    const fresh = await createVolunteer({ country: null })
    await createQuickTask({ title: 'Open starter' })
    await renderApp(<HomePage />, { as: fresh, url: '/dashboard' })
    await screen.findByRole('link', { name: 'Propose a project' })

    const checklist = screen.getByRole('region', { name: 'Getting started' })
    expect(within(checklist).getByText('Application approved')).toBeInTheDocument()
    expect(within(checklist).getByRole('link', { name: 'Pick a first task' })).toHaveAttribute(
      'href',
      '/quick-tasks',
    )
    expect(screen.getByText('Nothing is waiting on you right now.')).toBeInTheDocument()
    expect(screen.getByText(/not working on anything yet/)).toBeInTheDocument()

    const find = screen.getByRole('button', { name: /Find something to do/ })
    expect(find).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Open starter' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add skills' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Add your country' })).toHaveAttribute(
      'href',
      '/settings',
    )
    await userEvent.click(find)
    expect(find).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Open starter' })).toBeNull()
  })

  it('orders attention, my work, then a folded Find; filters work; acts on items', async () => {
    const skill = await createSkill()
    const me = await createVolunteer({
      emailDigest: 'match',
      country: 'UK',
      skills: { create: [{ skillId: skill.id }] },
    })
    const other = await createVolunteer({ name: 'Sam' })
    const lead = await createProject({
      title: 'Westminster',
      assigneeId: me.id,
      status: 'in_progress',
    })
    await prisma.workItemInterest.create({
      data: { workItemId: lead.id, volunteerId: other.id, interestType: 'want_to_contribute' },
    })
    const task = await createTask(lead.id, {
      title: 'Scout',
      assigneeId: me.id,
      status: 'in_progress',
    })
    await prisma.workItem.update({
      where: { id: task.id },
      data: { updatedAt: new Date(Date.now() - 9 * DAY) },
    })
    const team = await createTeam({ name: 'Comms team' })
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: me.id } })
    const mention = await prisma.notification.create({
      data: {
        volunteerId: me.id,
        type: 'mention',
        title: 'Sam mentioned you on "Westminster"',
        body: 'ping',
        link: `/projects/${lead.id}#comment-1`,
      },
    })
    await createProject({
      title: 'Skill match',
      status: 'ready',
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    await createProject({ title: 'Local one', status: 'ready', country: 'UK' })

    await renderApp(<HomePage />, { as: me, url: '/dashboard' })
    const attention = await screen.findByRole('region', { name: /Needs your attention/ })
    const work = screen.getByRole('region', { name: 'My work' })
    const find = screen.getByRole('region', { name: 'Find something to do' })
    const notifications = screen.getByRole('region', { name: /Notifications/ })
    expect(before(attention, work) && before(work, find) && before(find, notifications)).toBe(true)
    // Nothing left to get started on: a task is claimed.
    expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull()

    expect(within(attention).getByText('Sam wants to help on "Westminster"')).toBeInTheDocument()
    expect(within(attention).getByText('"Scout": no update for 9 days')).toBeInTheDocument()
    expect(
      within(attention).getByRole('link', { name: 'Review: Sam wants to help on "Westminster"' }),
    ).toHaveAttribute('href', `/projects/${lead.id}`)

    // Opening a mention marks it read.
    await userEvent.click(within(attention).getByRole('link', { name: /^Open: Sam mentioned you/ }))
    await waitFor(async () =>
      expect(
        (await prisma.notification.findUniqueOrThrow({ where: { id: mention.id } })).readAt,
      ).not.toBeNull(),
    )
    // Other items are not notifications, so nothing is marked.
    await userEvent.click(within(attention).getByRole('link', { name: /^Add update:/ }))

    const rows = () =>
      within(work)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    expect(rows()).toEqual([
      expect.stringContaining('Scout'),
      expect.stringContaining('Westminster'),
      expect.stringContaining('Comms team'),
    ])
    expect(within(work).getByText('in Westminster')).toBeInTheDocument()
    await userEvent.click(within(work).getByRole('button', { name: 'Teams' }))
    expect(rows()).toEqual([expect.stringContaining('Comms team')])
    expect(within(work).getByRole('button', { name: 'Teams' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(within(work).getByRole('button', { name: 'Tasks' }))
    expect(rows()).toEqual([expect.stringContaining('Scout')])

    // Find is folded because there is work of my own; it opens on request.
    const toggle = within(find).getByRole('button', { name: /Find something to do/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(within(find).getByRole('link', { name: 'Skill match' })).toBeInTheDocument()
    expect(within(find).getByText(/Uses your skills/)).toBeInTheDocument()
    expect(within(find).getByRole('link', { name: 'Local one' })).toBeInTheDocument()
  })

  it('says so when a filter leaves nothing, and when nothing matches', async () => {
    const skill = await createSkill()
    const me = await createVolunteer({
      country: 'ZZ',
      skills: { create: [{ skillId: skill.id }] },
    })
    const team = await createTeam()
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: me.id } })
    await renderApp(<HomePage />, { as: me, url: '/dashboard#tab-suggested' })
    const work = await screen.findByRole('region', { name: 'My work' })
    await userEvent.click(within(work).getByRole('button', { name: 'Projects' }))
    expect(within(work).getByText('Nothing here. Try another filter.')).toBeInTheDocument()
    // #tab-suggested opens Find even though there is work.
    expect(screen.getByRole('button', { name: /Find something to do/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('No projects match your skills right now.')).toBeInTheDocument()
    expect(screen.getByText('No projects in your country right now.')).toBeInTheDocument()
  })

  it('keeps old #tab- links working', async () => {
    const me = await createVolunteer()
    await createProject({ title: 'Mine', assigneeId: me.id })
    const team = await createTeam()
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: me.id } })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    await renderApp(<HomePage />, { as: me, url: '/dashboard#tab-applications' })
    const work = await screen.findByRole('region', { name: 'My work' })
    expect(within(work).getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(scrollIntoView).toHaveBeenCalled()

    // The hash can also change while the page is open; an unknown one does nothing.
    act(() => {
      window.location.hash = '#tab-junk'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    act(() => {
      window.location.hash = '#tab-notifications'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('pages, filters and marks notifications', async () => {
    const me = await createVolunteer()
    await prisma.notification.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        volunteerId: me.id,
        type: 'x',
        title: `Note ${i}`,
        link: i === 0 ? '/projects/1' : null,
        readAt: i === 1 ? new Date() : null,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      })),
    })
    await renderApp(<HomePage />, { as: me, url: '/dashboard#tab-notifications' })
    await screen.findByText('Note 20')
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 2')
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('Page 1 of 2')
    await userEvent.click(screen.getByRole('button', { name: 'Read' }))
    await screen.findByText('Note 1')
    await waitFor(() => expect(screen.queryByText('Note 20')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Mark as unread' }))
    await waitFor(() =>
      expect(screen.getByText(/No notifications marked read/)).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Read' }))
    await userEvent.click(screen.getByRole('button', { name: 'Unread' }))
    await screen.findByText('Note 20')
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0])
    await waitFor(async () =>
      expect(await prisma.notification.count({ where: { volunteerId: me.id, readAt: null } })).toBe(
        20,
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Unread' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull(),
    )
    expect(await prisma.notification.count({ where: { volunteerId: me.id, readAt: null } })).toBe(0)
    // Note 0 (the one with a link) is the oldest: on the second page of "all".
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('link', { name: 'View' })).toHaveAttribute('href', '/projects/1')
    // The page was cached from the first visit, when Note 0 was unread; wait for the refetch.
    await screen.findByRole('button', { name: 'Mark as unread' })
    // Following the link marks the notification read, unless it already was.
    const linked = () => prisma.notification.findFirstOrThrow({ where: { title: 'Note 0' } })
    const readAt = (await linked()).readAt
    await userEvent.click(screen.getByRole('link', { name: 'View' }))
    expect((await linked()).readAt).toEqual(readAt)
    await userEvent.click(screen.getByRole('button', { name: 'Mark as unread' }))
    // Unread items lead the list, so Note 0 moves to the top of the first page.
    await userEvent.click(await screen.findByRole('button', { name: 'Previous' }))
    await screen.findByRole('button', { name: 'Mark as read' })
    expect((await linked()).readAt).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: 'View' }))
    await waitFor(async () => expect((await linked()).readAt).not.toBeNull())
  })

  it('groups notifications under Unread and Earlier, and only when both are present', async () => {
    const me = await createVolunteer()
    const day = (d: number) => new Date(Date.UTC(2026, 0, d))
    await prisma.notification.createMany({
      data: [
        { volunteerId: me.id, type: 'x', title: 'Fresh', createdAt: day(1) },
        { volunteerId: me.id, type: 'x', title: 'Seen', readAt: day(9), createdAt: day(5) },
      ],
    })
    await renderApp(<HomePage />, { as: me, url: '/dashboard#tab-notifications' })
    const unread = await screen.findByRole('heading', { name: 'Unread' })
    const earlier = screen.getByRole('heading', { name: 'Earlier' })
    const fresh = screen.getByText('Fresh')
    const seen = screen.getByText('Seen')
    expect(before(unread, fresh)).toBe(true)
    expect(before(fresh, earlier)).toBe(true)
    expect(before(earlier, seen)).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Read' }))
    await waitFor(() => expect(screen.queryByText('Fresh')).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Unread' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull()
  })

  it('welcomes an approved volunteer once, pointing at projects or email confirmation', async () => {
    const me = await createVolunteer({ emailConfirmed: false })
    const note = () =>
      prisma.notification.findFirstOrThrow({
        where: { volunteerId: me.id, type: 'application_approved' },
      })
    await prisma.notification.create({
      data: { volunteerId: me.id, type: 'application_approved', title: 'Approved' },
    })
    await renderApp(<HomePage />, { as: me, url: '/dashboard' })
    const dialog = await screen.findByRole('dialog', { name: /You're approved/ })
    expect(within(dialog).getByRole('link', { name: 'Confirm your email' })).toHaveAttribute(
      'href',
      '/verify-email',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(async () => expect((await note()).readAt).not.toBeNull())

    // Read, so a later visit does not show it again.
    cleanup()
    await renderApp(<HomePage />, { as: me, url: '/dashboard' })
    await screen.findByRole('heading', { name: `Hi ${me.name}` })
    expect(screen.queryByRole('dialog')).toBeNull()

    // A confirmed volunteer is sent to the projects, and following the link dismisses it.
    await prisma.volunteer.update({ where: { id: me.id }, data: { emailConfirmed: true } })
    await prisma.notification.update({ where: { id: (await note()).id }, data: { readAt: null } })
    cleanup()
    await renderApp(<HomePage />, { as: me, url: '/dashboard' })
    const confirmed = await screen.findByRole('dialog', { name: /You're approved/ })
    await userEvent.click(within(confirmed).getByRole('link', { name: 'Browse projects' }))
    await waitFor(async () => expect((await note()).readAt).not.toBeNull())

    // Closing the dialog any other way counts as dismissing it too.
    await prisma.notification.update({ where: { id: (await note()).id }, data: { readAt: null } })
    cleanup()
    await renderApp(<HomePage />, { as: me, url: '/dashboard' })
    await screen.findByRole('dialog', { name: /You're approved/ })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(async () => expect((await note()).readAt).not.toBeNull())
  })
})
