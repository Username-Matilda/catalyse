import { describe, it, expect } from 'vitest'
import { screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin, createTeam, createLocalGroup } from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import TeamsPage from './page'
import TeamDetailPage from './[id]/page'
import LocalGroupAdoptPage from '../local-groups/[id]/page'

async function setup() {
  const me = await createVolunteer()
  const leader = await createVolunteer({ name: 'Lead Person' })
  const open = await createTeam({
    name: 'Open Team',
    description: 'Join us',
    lumaUrl: 'https://luma',
    docUrl: 'https://doc',
  })
  await prisma.teamMembership.create({
    data: { teamId: open.id, volunteerId: leader.id, role: 'leader' },
  })
  const mine = await createTeam({ name: 'My Team' })
  await prisma.teamMembership.create({ data: { teamId: mine.id, volunteerId: me.id } })
  const led = await createTeam({ name: 'Led Team' })
  await prisma.teamMembership.create({
    data: { teamId: led.id, volunteerId: me.id, role: 'leader' },
  })
  const pending = await createTeam({ name: 'Pending Team' })
  await prisma.teamJoinRequest.create({ data: { teamId: pending.id, volunteerId: me.id } })
  return { me, leader, open, mine, led, pending }
}

describe('teams list', () => {
  it('shows each team with the right action, and applies/leaves', async () => {
    const { me, open, mine, led } = await setup()
    await renderApp(<TeamsPage />, { as: me })
    const openCard = (await screen.findByRole('link', { name: 'Open Team' })).closest('article')!
    expect(openCard).toHaveTextContent('1 member · Led by Lead Person')
    expect(openCard.querySelector('a[href="https://luma"]')).toBeNull()
    const ledCard = screen.getByRole('link', { name: 'Led Team' }).closest('article')!
    expect(ledCard).toHaveTextContent('Leader')
    expect(ledCard.querySelector(`a[href="/admin/teams/${led.id}"]`)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Application Pending' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Join' }))
    await screen.findByText(
      /Sent to the leader of .+\. You'll get a notification when they reply\./,
    )
    expect(
      await prisma.teamJoinRequest.count({ where: { teamId: open.id, volunteerId: me.id } }),
    ).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await screen.findByText('Left team')
    expect(
      await prisma.teamMembership.count({ where: { teamId: mine.id, volunteerId: me.id } }),
    ).toBe(0)
    // The list refetches: "My Team" is now joinable. Failed actions are reported. Scoped to
    // the card: the apply's refetch may still show "Open Team" as joinable for a moment.
    const apply = await within(
      screen.getByRole('link', { name: 'My Team' }).closest('article')!,
    ).findByRole('button', { name: 'Apply to Join' })
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(apply)
    await screen.findByText('Unauthorized')
    cleanup()
    localStorage.clear()
    await prisma.teamMembership.create({ data: { teamId: mine.id, volunteerId: me.id } })
    await renderApp(<TeamsPage />, { as: me })
    const leave = await screen.findByRole('button', { name: 'Leave' })
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(leave)
    await screen.findByText('Unauthorized')
  })

  it('renders the empty state and admin manage links', async () => {
    const admin = await createAdmin()
    await prisma.teamJoinRequest.deleteMany()
    await prisma.team.deleteMany()
    await renderApp(<TeamsPage />, { as: admin })
    await screen.findByText('No teams yet.')
    cleanup()
    await createTeam({ name: 'Admin Sees' })
    await renderApp(<TeamsPage />, { as: admin })
    await screen.findByRole('link', { name: 'Admin Sees' })
    expect(screen.getByRole('button', { name: 'Manage Members' })).toBeInTheDocument()
  })
})

describe('team detail', () => {
  it('shows a team with links for members, and each action state', async () => {
    const { me, open, mine, led, pending } = await setup()
    await renderApp(<TeamDetailPage params={Promise.resolve({ id: String(mine.id) })} />, {
      as: me,
    })
    await screen.findByRole('heading', { name: 'My Team' })
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await screen.findByText('Left team')
    cleanup()
    await renderApp(<TeamDetailPage params={Promise.resolve({ id: String(open.id) })} />, {
      as: me,
    })
    await screen.findByRole('heading', { name: 'Open Team' })
    expect(screen.queryByRole('link', { name: 'Meeting calendar' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Join' }))
    await screen.findByText(
      /Sent to the leader of .+\. You'll get a notification when they reply\./,
    )
    await screen.findByRole('button', { name: 'Application Pending' })
    cleanup()
    await renderApp(<TeamDetailPage params={Promise.resolve({ id: String(led.id) })} />, { as: me })
    await screen.findByRole('heading', { name: /Led Team/ })
    expect(screen.getByRole('button', { name: 'Manage Members' })).toBeInTheDocument()
    cleanup()
    await prisma.teamMembership.create({ data: { teamId: pending.id, volunteerId: me.id } })
    await prisma.team.update({
      where: { id: pending.id },
      data: { lumaUrl: 'https://luma2', docUrl: 'https://doc2' },
    })
    await renderApp(<TeamDetailPage params={Promise.resolve({ id: String(pending.id) })} />, {
      as: me,
    })
    expect(await screen.findByRole('link', { name: 'Meeting calendar' })).toHaveAttribute(
      'href',
      'https://luma2',
    )
    expect(screen.getByRole('link', { name: 'Team doc' })).toHaveAttribute('href', 'https://doc2')
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await screen.findByText('Unauthorized')
    cleanup()
    await renderApp(<TeamDetailPage params={Promise.resolve({ id: '999999' })} />, { as: me })
    await screen.findByText(/not found/i)
  })

  it('reports a failed apply', async () => {
    const { me, open } = await setup()
    await renderApp(<TeamDetailPage params={Promise.resolve({ id: String(open.id) })} />, {
      as: me,
    })
    await screen.findByRole('heading', { name: 'Open Team' })
    await prisma.teamMembership.create({ data: { teamId: open.id, volunteerId: me.id } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Join' }))
    await screen.findByText('Already a member of this team')
  })
})

describe('local group adoption', () => {
  it('sets the group as mine, or declines; handles unknown groups', async () => {
    const me = await createVolunteer()
    const group = await createLocalGroup({ name: 'Adopt Town', country: 'UK' })
    await renderApp(<LocalGroupAdoptPage params={Promise.resolve({ id: String(group.id) })} />, {
      as: me,
    })
    await screen.findByText(/listed under Adopt Town/)
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Set as my local group' }))
    await screen.findByText('Local group updated!')
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/settings'))
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({
      localGroup: 'Adopt Town',
      country: 'UK',
    })
    cleanup()
    await renderApp(<LocalGroupAdoptPage params={Promise.resolve({ id: '999999' })} />, { as: me })
    await screen.findByText(/not found/i)
    cleanup()
    await renderApp(<LocalGroupAdoptPage params={Promise.resolve({ id: 'abc' })} />, { as: me })
    await screen.findByText(/not found/i)
  })

  it('reports a failed update', async () => {
    const me = await createVolunteer()
    const group = await createLocalGroup({ name: 'Fail Town', country: 'UK' })
    await renderApp(<LocalGroupAdoptPage params={Promise.resolve({ id: String(group.id) })} />, {
      as: me,
    })
    await screen.findByText(/listed under Fail Town/)
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Set as my local group' }))
    await screen.findByText('Unauthorized')
  })
})
