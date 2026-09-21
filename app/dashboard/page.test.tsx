import { describe, it, expect } from 'vitest'
import { screen, waitFor, act, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createProject, createQuickTask, createSkill } from '@/test/factories'
import { renderApp } from '@/test/render'
import DashboardPage from './page'

describe('dashboard', () => {
  it('shows approval banners and the empty tabs for a fresh applicant', async () => {
    const pending = await createVolunteer({ approvalStatus: 'pending', emailDigest: null })
    await renderApp(<DashboardPage />, { as: pending, url: '/dashboard' })
    await screen.findByRole('heading', { name: `Welcome back, ${pending.name}!` })
    expect(screen.getByText(/pending approval/)).toBeInTheDocument()
    expect(screen.getByText(/Stay in the loop/)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText(/Stay in the loop/)).toBeNull()
    expect(
      screen.getByText(/haven't got any projects|no projects|You don't own/i),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Interested Projects' }))
    expect(screen.getByText(/haven't expressed interest/)).toBeInTheDocument()
    expect(window.location.hash).toBe('#tab-interests')
    await userEvent.click(screen.getByRole('tab', { name: 'Proposed Projects' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Suggested for You' }))
    expect(screen.getByText(/No suggested projects/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Owned Projects' }))
    expect(window.location.hash).toBe('')
    expect(document.title).toBe('Catalyse | Owned Projects')

    cleanup()
    const needsInfo = await createVolunteer({ approvalStatus: 'needs_info' })
    await renderApp(<DashboardPage />, { as: needsInfo, url: '/dashboard' })
    expect(await screen.findByRole('link', { name: 'Update Application' })).toBeInTheDocument()
  })

  it('lists owned, interested, proposed and suggested projects, and quick tasks', async () => {
    const skill = await createSkill()
    const me = await createVolunteer({
      emailDigest: 'match',
      skills: { create: [{ skillId: skill.id }] },
    })
    const other = await createVolunteer()
    const owned = await createProject({
      title: 'Owned one',
      assigneeId: me.id,
      status: 'in_progress',
    })
    const proposed = await createProject({ title: 'Proposed one', creatorId: me.id })
    const interested = await createProject({
      title: 'Interested one',
      assigneeId: other.id,
      isSeekingHelp: true,
      status: 'in_progress',
    })
    await prisma.workItemInterest.create({
      data: { workItemId: interested.id, volunteerId: me.id, interestType: 'want_to_contribute' },
    })
    const suggested = await createProject({
      title: 'Suggested one',
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    const qt = await createQuickTask({
      title: 'Quick one',
      assigneeId: me.id,
      status: 'in_progress',
      skillId: skill.id,
    })
    await createQuickTask({ title: 'Done one', assigneeId: me.id, status: 'completed' })
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard#tab-suggested' })
    await screen.findByRole('link', { name: 'Suggested one' })
    expect(screen.getByRole('tab', { name: 'Suggested for You' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Owned Projects' }))
    expect(screen.getByRole('link', { name: 'Owned one' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Interested Projects' }))
    expect(screen.getByRole('link', { name: 'Interested one' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Proposed Projects' }))
    expect(screen.getByRole('link', { name: 'Proposed one' })).toBeInTheDocument()

    // The hash can also change externally (the header's tab buttons).
    act(() => {
      window.location.hash = '#tab-notifications'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByText(/No notifications/)).toBeInTheDocument()
    act(() => {
      window.location.hash = ''
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('tab', { name: 'Owned Projects' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // Quick task card expands and can be submitted for review.
    expect(screen.queryByText('Done one')).toBeNull()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Quick one'))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Complete' }))
    await screen.findByText(/Submitted\. An admin will review it/)
    await waitFor(async () =>
      expect((await prisma.workItem.findUniqueOrThrow({ where: { id: qt.id } })).status).toBe(
        'under_review',
      ),
    )
    await userEvent.click(screen.getByText('Quick one'))
    void owned
    void proposed
    void suggested
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
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard#tab-notifications' })
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
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard#tab-notifications' })
    const unread = await screen.findByRole('heading', { name: 'Unread' })
    const earlier = screen.getByRole('heading', { name: 'Earlier' })
    const fresh = screen.getByText('Fresh')
    const seen = screen.getByText('Seen')
    const before = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
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
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard' })
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
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard' })
    await screen.findByRole('heading', { name: /Welcome back/ })
    expect(screen.queryByRole('dialog')).toBeNull()

    // A confirmed volunteer is sent to the projects, and following the link dismisses it.
    await prisma.volunteer.update({ where: { id: me.id }, data: { emailConfirmed: true } })
    await prisma.notification.update({ where: { id: (await note()).id }, data: { readAt: null } })
    cleanup()
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard' })
    const confirmed = await screen.findByRole('dialog', { name: /You're approved/ })
    await userEvent.click(within(confirmed).getByRole('link', { name: 'Browse projects' }))
    await waitFor(async () => expect((await note()).readAt).not.toBeNull())

    // Closing the dialog any other way counts as dismissing it too.
    await prisma.notification.update({ where: { id: (await note()).id }, data: { readAt: null } })
    cleanup()
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard' })
    await screen.findByRole('dialog', { name: /You're approved/ })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(async () => expect((await note()).readAt).not.toBeNull())
  })

  it('surfaces a failed quick-task submission', async () => {
    const me = await createVolunteer()
    const qt = await createQuickTask({ title: 'Fragile', assigneeId: me.id, status: 'in_progress' })
    await renderApp(<DashboardPage />, { as: me, url: '/dashboard' })
    await userEvent.click(await screen.findByText('Fragile'))
    await prisma.workItem.delete({ where: { id: qt.id } })
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Complete' }))
    await screen.findByText('Task not found or not assigned to you')
  })
})
