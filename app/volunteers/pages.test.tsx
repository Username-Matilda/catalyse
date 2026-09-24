import { describe, it, expect } from 'vitest'
import { screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createProject,
  createQuickTask,
  createSkill,
  createLocalGroup,
} from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import { emails } from '@/test/fakes/email'
import VolunteersPage from './page'
import VolunteerDetailPage from './[id]/page'

describe('volunteer directory', () => {
  it('lists, filters, pages and clears', async () => {
    const skill = await createSkill()
    const extra = await Promise.all(Array.from({ length: 6 }, () => createSkill()))
    await createLocalGroup({ name: 'Dir Town', country: 'UK' })
    const me = await createVolunteer()
    const ann = await createVolunteer({
      name: 'Ann Directory',
      bio: 'x'.repeat(120),
      country: 'UK',
      localGroup: 'Dir Town',
      availabilityHoursPerWeek: 4,
      skills: { create: [skill, ...extra].map((s) => ({ skillId: s.id })) },
    })
    await createVolunteer({ name: 'Hidden Person', consentMakeProfileVisibleInDirectory: false })
    for (let i = 0; i < 50; i++)
      await createVolunteer({
        name: `Filler ${i}`,
        bio: null,
        availabilityHoursPerWeek: null,
        location: 'Somewhere',
      })
    await renderApp(<VolunteersPage />, { as: me, url: '/volunteers' })
    await screen.findByText('Page 1 of 2')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 2')
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('Page 1 of 2')
    await userEvent.click(screen.getByRole('button', { name: 'Skill filter' }))
    await userEvent.click(await screen.findByRole('option', { name: skill.name }))
    await screen.findByRole('link', { name: 'Ann Directory' })
    expect(screen.getByText('and 1 more')).toBeInTheDocument()
    expect(screen.getByText(/📍 Dir Town · United Kingdom/)).toBeInTheDocument()
    expect(screen.getByText('🕐 4h/week')).toBeInTheDocument()
    expect(screen.queryByText('Filler 0')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Country/Group filter' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom - Dir Town' }))
    await screen.findByRole('link', { name: 'Ann Directory' })
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'nobody-matches' } })
    await screen.findByText('No volunteers found')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(navigation.replace).toHaveBeenCalledWith('?', { scroll: false })
    expect(screen.queryByText('Hidden Person')).toBeNull()
    void ann

    cleanup()
    const admin = await createAdmin()
    await renderApp(<VolunteersPage />, { as: admin, url: '/volunteers?q=Hidden' })
    await screen.findByRole('link', { name: 'Hidden Person' })
    expect(screen.getByText('Hidden')).toBeInTheDocument()
  })
})

describe('volunteer profile', () => {
  it('shows a full profile with contact, endorsements, tasks and history', async () => {
    const me = await createAdmin()
    const skill = await createSkill()
    const vol = await createVolunteer({
      name: 'Profiled',
      email: 'profiled@example.org',
      location: 'Leeds',
      localGroup: 'North',
      otherSkills: 'juggling',
      availabilityHoursPerWeek: 3,
      discordHandle: 'd#1',
      signalNumber: '+1',
      whatsappNumber: '+2',
      contactNotes: 'evenings',
      skills: { create: [{ skillId: skill.id }] },
    })
    await prisma.skillEndorsement.create({
      data: { volunteerId: vol.id, skillId: skill.id, endorsedById: me.id, rating: 'strong' },
    })
    await createQuickTask({
      title: 'Done task',
      assigneeId: vol.id,
      status: 'completed',
      reviewRating: 'good',
      skillId: skill.id,
    })
    await createQuickTask({
      title: 'Plain task',
      assigneeId: vol.id,
      status: 'completed',
      reviewRating: 'excellent',
    })
    await createProject({ title: 'Led', assigneeId: vol.id })
    await createProject({ title: 'Pitched', creatorId: vol.id })
    await renderApp(<VolunteerDetailPage params={Promise.resolve({ id: String(vol.id) })} />, {
      as: me,
    })
    await screen.findByRole('heading', { name: 'Profiled' })
    expect(screen.getByText('📍 Leeds · North')).toBeInTheDocument()
    expect(screen.getByText(`${skill.name} ✓`)).toBeInTheDocument()
    expect(screen.getByText('juggling')).toBeInTheDocument()
    expect(screen.getByText('3 hours/week')).toBeInTheDocument()
    // The login address is never on a profile, even for an admin.
    expect(screen.queryByText(/profiled@example\.org/)).toBeNull()
    expect(screen.getByText('Discord: d#1')).toBeInTheDocument()
    expect(screen.getByText('evenings')).toBeInTheDocument()
    expect(screen.getByText('Verified Skills')).toBeInTheDocument()
    expect(screen.getByText('Done task')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Led' })).toBeInTheDocument()
    expect(screen.getByText('Project owner')).toBeInTheDocument()
    expect(screen.getByText('Proposer')).toBeInTheDocument()
  })

  it('offers a message to a contactable volunteer, but not to themselves', async () => {
    const me = await createVolunteer({ name: 'Sender' })
    const vol = await createVolunteer({
      name: 'Reachable',
      email: 'reachable@example.org',
      consentShareContactInfoWithProjectOwner: false,
    })
    await renderApp(<VolunteerDetailPage params={Promise.resolve({ id: String(vol.id) })} />, {
      as: me,
    })
    await screen.findByRole('heading', { name: 'Reachable' })
    expect(screen.getByText('Contact via message')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Message' }))
    const dialog = screen.getByRole('dialog', { name: 'Message Reachable' })
    expect(dialog).toHaveTextContent(
      'Reachable will see this in their Inbox and get a copy by email.',
    )
    await userEvent.type(within(dialog).getByLabelText('Subject'), 'Hello')
    await userEvent.type(within(dialog).getByLabelText('Message'), 'Can we talk?')
    // Sharing my address lets them reply to the email itself.
    await userEvent.click(within(dialog).getByLabelText(/Let Reachable reply by email/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send Message' }))
    await screen.findByText(/Message sent\./)
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() =>
      expect(emails.lastTo('reachable@example.org')?.html).toContain('Can we talk?'),
    )
    expect(emails.lastTo('reachable@example.org')?.replyTo).toBe(me.email)
    expect(
      await prisma.message.findFirstOrThrow({ where: { toVolunteerId: vol.id } }),
    ).toMatchObject({ fromVolunteerId: me.id, subject: 'Hello', relatedWorkItemId: null })

    // Cancel closes without sending.
    await userEvent.click(screen.getByRole('button', { name: 'Message' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()

    await renderApp(<VolunteerDetailPage params={Promise.resolve({ id: String(vol.id) })} />, {
      as: vol,
    })
    await screen.findByRole('heading', { name: 'Reachable' })
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
  })

  it('shows a minimal profile, and a not-found state', async () => {
    const me = await createVolunteer()
    const bare = await createVolunteer({
      name: 'Bare',
      location: null,
      availabilityHoursPerWeek: null,
      consentContactableByProjectOwners: false,
      consentShareContactInfoWithProjectOwner: false,
    })
    await renderApp(<VolunteerDetailPage params={Promise.resolve({ id: String(bare.id) })} />, {
      as: me,
    })
    await screen.findByRole('heading', { name: 'Bare' })
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    expect(screen.queryByText('Verified Skills')).toBeNull()
    cleanup()
    await renderApp(<VolunteerDetailPage params={Promise.resolve({ id: '999999' })} />, { as: me })
    await screen.findByRole('link', { name: 'Back to Volunteers' })
  })
})
