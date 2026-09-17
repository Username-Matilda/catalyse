import { describe, it, expect } from 'vitest'
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createSuperAdmin,
  createProject,
  createSkill,
  createTeam,
} from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import ProjectsPage from './page'

describe('projects directory', () => {
  it('shows the grouped overview with summary badges, view-all links and a collapsible completed section', async () => {
    const skill = await createSkill()
    const me = await createVolunteer({ skills: { create: [{ skillId: skill.id }] } })
    const owner = await createVolunteer()
    const team = await createTeam()
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: me.id } })
    await createProject({
      title: 'Seeking A',
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    await createProject({ title: 'Seeking B', teamId: team.id })
    await createProject({
      title: 'Working',
      assigneeId: owner.id,
      status: 'in_progress',
      isSeekingHelp: false,
    })
    await createProject({
      title: 'Paused',
      assigneeId: owner.id,
      status: 'on_hold',
      isSeekingHelp: false,
    })
    await createProject({ title: 'Finished', status: 'completed' })
    await renderApp(<ProjectsPage />, { as: me, url: '/projects' })
    await screen.findByRole('heading', { name: 'Projects' })
    await screen.findByRole('link', { name: 'Seeking A' })
    expect(screen.getByText('Looking for People: 2')).toBeInTheDocument()
    expect(screen.getByText('In Progress: 1')).toBeInTheDocument()
    expect(screen.getByText('Your Team Projects: 1 project')).toBeInTheDocument()
    expect(screen.getByText('On Hold: 1 project')).toBeInTheDocument()
    // Completed is collapsed until clicked (mouse or keyboard).
    const completedHeading = screen.getByRole('button', { name: /Completed: 1 project/ })
    expect(screen.queryByRole('link', { name: 'Finished' })).toBeNull()
    await userEvent.click(completedHeading)
    expect(screen.getByRole('link', { name: 'Finished' })).toBeInTheDocument()
    fireEvent.keyDown(completedHeading, { key: 'Enter' })
    expect(screen.queryByRole('link', { name: 'Finished' })).toBeNull()
    fireEvent.keyDown(completedHeading, { key: 'a' })
    expect(screen.getByRole('button', { name: 'Team filter' })).toBeInTheDocument()
  })

  it('filters via the URL, pages the flat view, and clears filters', async () => {
    const me = await createVolunteer()
    const owner = await createVolunteer()
    const team = await createTeam()
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: me.id } })
    for (let i = 0; i < 51; i++)
      await createProject({
        title: `Flat ${i}`,
        assigneeId: owner.id,
        status: 'in_progress',
        isSeekingHelp: false,
        urgency: 'low',
      })
    await createProject({
      title: 'Urgent UK',
      urgency: 'high',
      country: 'UK',
      localGroup: 'London',
      teamId: team.id,
      isOrgProposed: true,
    })
    await renderApp(<ProjectsPage />, { as: me, url: '/projects?status=in_progress&page=2' })
    await screen.findByRole('heading', { name: 'Projects' })
    await screen.findByText('Page 2 of 2')
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('Page 1 of 2')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 2')
    expect(window.location.search).toContain('page=2')

    // Changing any filter resets to page 1.
    await userEvent.click(screen.getByRole('button', { name: 'Priority filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'High' }))
    await waitFor(() => expect(window.location.search).not.toContain('page='))
    await waitFor(() => expect(screen.getByText('No projects found')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Status filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'All Active' }))
    await userEvent.click(screen.getByRole('button', { name: 'Needs filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'Looking for People' }))
    await screen.findByRole('link', { name: 'Urgent UK' })
    await userEvent.click(screen.getByRole('button', { name: 'Needs filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'Seeking Help' }))
    await userEvent.click(screen.getByRole('button', { name: 'Needs filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'Seeking Owner' }))
    await screen.findByRole('link', { name: 'Urgent UK' })
    await userEvent.click(screen.getByRole('button', { name: 'Needs filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'Not Seeking' }))
    await userEvent.click(screen.getByRole('button', { name: 'Country/Group filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'United Kingdom - London' }))
    await userEvent.click(screen.getByRole('button', { name: 'Team filter' }))
    await userEvent.click(screen.getByRole('option', { name: team.name }))
    await userEvent.click(screen.getByRole('button', { name: 'Sort filter' }))
    await userEvent.click(screen.getByRole('option', { name: 'Best match' }))
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Urgent' } })
    await waitFor(() => expect(window.location.search).toContain('q=Urgent'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(navigation.replace).toHaveBeenCalledWith('?', { scroll: false })
    expect(screen.getByLabelText('Search')).toHaveValue('')
  })

  it('shows admin alerts, the all-teams filter, and the email confirmation error', async () => {
    const admin = await createSuperAdmin()
    await createProject({ status: 'pending_review' })
    await createVolunteer({ approvalStatus: 'pending' })
    await createVolunteer({ approvalStatus: 'pending' })
    await renderApp(<ProjectsPage />, { as: admin, url: '/projects' })
    await screen.findByText('1 project pending review.')
    await waitFor(() =>
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName === 'STRONG' &&
            /2 applications\s+pending review/.test(el.textContent ?? ''),
        ),
      ).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Team filter' }))
    expect(screen.getByRole('option', { name: 'All teams' })).toBeInTheDocument()

    cleanup()
    const unconfirmed = await createVolunteer({ emailConfirmed: false })
    await renderApp(<ProjectsPage />, { as: unconfirmed, url: '/projects?status=ready' })
    await screen.findByText("Couldn't load projects")
    expect(screen.getByRole('link', { name: 'Confirm your email' })).toBeInTheDocument()
  })

  it('keeps unapproved volunteers out', async () => {
    const pending = await createVolunteer({ approvalStatus: 'pending' })
    await renderApp(<ProjectsPage />, { as: pending, url: '/projects' })
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/dashboard'))
  })
})
