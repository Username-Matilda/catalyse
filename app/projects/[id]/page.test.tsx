import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DragEndEvent } from '@dnd-kit/core'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createProject,
  createTask,
  createSkill,
  createTeam,
} from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import ProjectDetailPage from './page'
import { queryClient } from '@/lib/query-client'
import { orpc } from '@/lib/orpc'

const drags = await vi.hoisted(() => import('@/test/dnd').then((m) => m.captureDrags()))
vi.mock('@dnd-kit/core', (importOriginal) => drags.mockDndKit(importOriginal))
// The task list sets its own collision detection; the Gantt chart leaves it to dnd-kit.
const listDrag = () => drags.find((p) => p.collisionDetection !== undefined)
const ganttDrag = () => drags.find((p) => p.collisionDetection === undefined)

const row = (id: number) => prisma.workItem.findUniqueOrThrow({ where: { id } })
const mount = (id: number, as: Awaited<ReturnType<typeof createVolunteer>>, hash = '') =>
  renderApp(<ProjectDetailPage params={Promise.resolve({ id: String(id) })} />, {
    as,
    url: `/projects/${id}${hash}`,
  })

describe('project page — visitor', () => {
  it('shows the project, lets a volunteer express then withdraw interest, and claim tasks', async () => {
    const me = await createVolunteer()
    const owner = await createVolunteer({ name: 'Olive Owner' })
    const skill = await createSkill()
    const team = await createTeam({ name: 'Crew' })
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: me.id } })
    const project = await createProject({
      title: 'Visible project',
      description: 'Long description',
      assigneeId: owner.id,
      status: 'in_progress',
      isSeekingHelp: true,
      collaborationLink: 'https://doc.example',
      country: 'UK',
      localGroup: 'Leeds',
      remoteEligibility: 'GLOBAL',
      teamId: team.id,
      projectType: 'sprint',
      timeCommitmentHoursPerWeek: 3,
      estimatedDuration: '2 weeks',
      urgency: 'high',
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    const open = await createTask(project.id, {
      title: 'Open task',
      estimatedHours: 2,
      deadline: new Date('2020-01-01'),
    })
    await createTask(project.id, {
      title: 'Done task',
      status: 'completed',
      featuredAsQuickTask: true,
      deadline: new Date('2030-01-01'),
    })
    await prisma.workItemComment.create({
      data: { workItemId: open.id, authorId: owner.id, content: 'c' },
    })
    await mount(project.id, me)
    await screen.findByRole('heading', { name: 'Visible project' })
    expect(screen.getByRole('link', { name: 'Open Project Doc →' })).toHaveAttribute(
      'href',
      'https://doc.example',
    )
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByLabelText('1 comment')).toBeInTheDocument()
    expect(screen.getByText('Olive Owner')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Claim' }))
    await screen.findByText('Task claimed!')
    await waitFor(async () => expect((await row(open.id)).assigneeId).toBe(me.id))
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }))
    await screen.findByText('Task completed!')

    // Interest: the claim made me an accepted helper; withdrawing releases that.
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw Interest' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Withdraw' }),
    )
    await screen.findByText('Interest withdrawn')
    await userEvent.type(await screen.findByLabelText('Message (optional)'), 'Pick me')
    await userEvent.click(screen.getByRole('button', { name: 'Express Interest' }))
    await screen.findByText('Interest expressed!')

    await userEvent.click(screen.getByRole('button', { name: /Contact/ }))
    await userEvent.type(screen.getByLabelText('Subject'), 'Hello')
    await userEvent.type(screen.getByLabelText('Message'), 'Can I help?')
    fireEvent.submit(screen.getByLabelText('Subject').closest('form')!)
    await screen.findByText(/Message sent/)
    expect(
      await prisma.message.count({ where: { fromVolunteerId: me.id, toVolunteerId: owner.id } }),
    ).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: /Contact/ }))
    await userEvent.click(screen.getByLabelText('Close'))
    await userEvent.click(screen.getByRole('button', { name: /Contact/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: /Contact/ }))
    fireEvent.click(screen.getByRole('dialog', { name: 'Contact Owner' }).parentElement!)
    expect(screen.queryByRole('dialog', { name: 'Contact Owner' })).toBeNull()
  })

  it('redirects for unknown projects and drafts, and shows want-to-own interest with a response', async () => {
    const me = await createVolunteer()
    await mount(999999, me)
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/projects'))
    cleanup()
    const draft = await createProject({ status: 'draft', creatorId: me.id })
    await mount(draft.id, me)
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(`/projects/${draft.id}/edit`),
    )
    cleanup()
    const project = await createProject({ title: 'Ownerless', status: 'ready' })
    await mount(project.id, me)
    await screen.findByRole('heading', { name: 'Ownerless' })
    await userEvent.click(screen.getByLabelText(/I want to own/))
    await userEvent.click(screen.getByRole('button', { name: 'Express Interest' }))
    await screen.findByText('Interest expressed!')
    const interest = await prisma.workItemInterest.findFirstOrThrow({
      where: { workItemId: project.id, volunteerId: me.id },
    })
    expect(interest.interestType).toBe('want_to_own')
    await prisma.workItemInterest.update({
      where: { id: interest.id },
      data: { status: 'declined', responseMessage: 'Sorry, no' },
    })
    cleanup()
    await mount(project.id, me)
    await screen.findByText(/Sorry, no/)
    expect(screen.queryByRole('button', { name: 'Withdraw Interest' })).toBeNull()
    // A failed withdrawal is reported.
    await prisma.workItemInterest.update({
      where: { id: interest.id },
      data: { status: 'pending' },
    })
    cleanup()
    await mount(project.id, me)
    const withdraw = await screen.findByRole('button', { name: 'Withdraw Interest' })
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(withdraw)
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Withdraw' }),
    )
    await screen.findByText('Unauthorized')
  })
})

describe('project page — owner', () => {
  it('manages tasks: add, assign, unassign, reorder, delete; changes status; reviews interests', async () => {
    const owner = await createVolunteer({ name: 'Owen Owner' })
    const helper = await createVolunteer({ name: 'Hana Helper' })
    const other = await createVolunteer({ name: 'Otto Other' })
    const project = await createProject({
      title: 'Owned project',
      assigneeId: owner.id,
      status: 'in_progress',
      isSeekingHelp: true,
    })
    const t1 = await createTask(project.id, { title: 'First task', sortOrder: 1 })
    const t2 = await createTask(project.id, { title: 'Second task', sortOrder: 2 })
    await prisma.workItemInterest.create({
      data: {
        workItemId: project.id,
        volunteerId: helper.id,
        interestType: 'want_to_contribute',
        message: 'me please',
      },
    })
    await prisma.workItemInterest.create({
      data: { workItemId: project.id, volunteerId: other.id, interestType: 'want_to_own' },
    })
    await mount(project.id, owner)
    await screen.findByRole('heading', { name: 'Owned project' })

    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await userEvent.type(screen.getByLabelText('Task title'), 'Third task')
    await userEvent.type(screen.getByLabelText('Description'), 'details')
    await userEvent.type(screen.getByLabelText('Estimated hours'), '2')
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2030-01-01' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2029-12-01' } })
    await userEvent.type(screen.getByLabelText('Duration (days)'), '3')
    await userEvent.click(screen.getByRole('checkbox', { name: /quick task/i }))
    fireEvent.submit(screen.getByLabelText('Task title').closest('form')!)
    await screen.findByText('Task added!')
    const t3 = await prisma.workItem.findFirstOrThrow({ where: { title: 'Third task' } })
    expect(t3).toMatchObject({ estimatedHours: 2, durationDays: 3, featuredAsQuickTask: true })

    // Accept one interest, decline the other with a message.
    const interestCard = (name: string) =>
      screen.getByText(name).closest('li, div[class*="border"]') as HTMLElement
    await userEvent.click(
      within(interestCard('Hana Helper')).getByRole('button', { name: 'Accept' }),
    )
    await screen.findByText('Interest accepted')
    await userEvent.click(
      await within(interestCard('Otto Other')).findByRole('button', { name: 'Decline' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(interestCard('Otto Other')).getByRole('button', { name: 'Decline' }),
    )
    await userEvent.keyboard('{Escape}')
    await userEvent.click(
      within(interestCard('Otto Other')).getByRole('button', { name: 'Decline' }),
    )
    await userEvent.type(screen.getByLabelText('Optional message for the volunteer'), 'Not now')
    fireEvent.submit(screen.getByLabelText('Optional message for the volunteer').closest('form')!)
    await screen.findByText('Interest declined')
    await waitFor(async () =>
      expect(
        (await prisma.workItemInterest.findFirstOrThrow({ where: { volunteerId: other.id } }))
          .responseMessage,
      ).toBe('Not now'),
    )

    // Assign a task to the accepted helper via the task menu, then unassign it.
    await userEvent.click(screen.getByLabelText('Task actions for First task'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Assign volunteer to First task' }),
    )
    await userEvent.click(screen.getByRole('option', { name: 'Hana Helper' }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Assign' }))
    await screen.findByText('Task assigned!')
    await waitFor(async () => expect((await row(t1.id)).assigneeId).toBe(helper.id))
    await userEvent.click(screen.getByLabelText('Task actions for First task'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Unassign' }))
    await screen.findByText('Task unassigned!')
    // An accepted helper can be removed again (declined).
    await userEvent.click(
      within(interestCard('Hana Helper')).getByRole('button', { name: 'Remove' }),
    )
    fireEvent.submit(screen.getByLabelText('Optional message for the volunteer').closest('form')!)
    await waitFor(() => expect(screen.getAllByText('Interest declined')).toHaveLength(2))
    // Clicking outside closes the menu.
    await userEvent.click(screen.getByLabelText('Task actions for First task'))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()

    act(() => listDrag()({ active: { id: t2.id }, over: { id: t1.id } } as DragEndEvent))
    await waitFor(async () => expect((await row(t2.id)).sortOrder).toBe(1))
    act(() => listDrag()({ active: { id: t2.id }, over: null } as never))
    act(() => listDrag()({ active: { id: t2.id }, over: { id: t2.id } } as DragEndEvent))

    await userEvent.click(screen.getByLabelText('Task actions for Second task'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete task' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(await prisma.workItem.count({ where: { id: t2.id } })).toBe(1)
    await userEvent.click(screen.getByLabelText('Task actions for Second task'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete task' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete task' }),
    )
    await screen.findByText('Task deleted!')

    await userEvent.click(screen.getByRole('button', { name: 'project status' }))
    await userEvent.click(screen.getByRole('option', { name: 'On Hold' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'project status' }))
    await userEvent.click(screen.getByRole('option', { name: 'On Hold' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Status updated!')
    await waitFor(async () => expect((await row(project.id)).status).toBe('on_hold'))

    // Enter submits the assign form even while its button is disabled.
    fireEvent.submit(screen.getByRole('button', { name: 'Volunteer to assign' }).closest('form')!)
    await userEvent.click(screen.getByRole('button', { name: 'Volunteer to assign' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Otto Other' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Volunteer to assign' }).closest('form')!)
    await screen.findByText('Volunteer assigned!')

    expect(screen.getByRole('link', { name: /Edit/ })).toHaveAttribute(
      'href',
      `/projects/${project.id}/edit`,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Export / Import' }))
    expect(screen.getByRole('dialog', { name: 'Export and import' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
  })

  it('reports failures for the owner actions', async () => {
    const owner = await createVolunteer()
    const helper = await createVolunteer({ name: 'Hana Helper' })
    const project = await createProject({
      title: 'Fragile',
      assigneeId: owner.id,
      status: 'in_progress',
      isSeekingHelp: true,
    })
    const t1 = await createTask(project.id, { title: 'Doomed task' })
    await prisma.workItemInterest.create({
      data: { workItemId: project.id, volunteerId: helper.id, interestType: 'want_to_contribute' },
    })
    await mount(project.id, owner)
    await screen.findByRole('heading', { name: 'Fragile' })
    await prisma.workItem.delete({ where: { id: t1.id } })
    await userEvent.click(screen.getByLabelText('Task actions for Doomed task'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Assign volunteer to Doomed task' }),
    )
    await userEvent.click(screen.getAllByRole('option', { name: 'Hana Helper' })[0])
    await userEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Assign' }))
    await screen.findByText('Project or task not found')
    await userEvent.click(screen.getByLabelText('Task actions for Doomed task'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete task' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete task' }),
    )
    await screen.findByText('Task not found')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await userEvent.type(screen.getByLabelText('Task title'), 'x')
    await prisma.workItemInterest.deleteMany({ where: { workItemId: project.id } })
    await prisma.workItem.delete({ where: { id: project.id } })
    fireEvent.submit(screen.getByLabelText('Task title').closest('form')!)
    await screen.findByText('Project not found')
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText('Not authorized')
    await userEvent.click(screen.getByRole('button', { name: 'Volunteer to assign' }))
    await userEvent.click((await screen.findAllByRole('option', { name: 'Hana Helper' }))[0])
    fireEvent.submit(screen.getByRole('button', { name: 'Volunteer to assign' }).closest('form')!)
    await waitFor(() => expect(screen.getAllByText('Project not found').length).toBeGreaterThan(1))
    await userEvent.click(screen.getByRole('button', { name: 'project status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Completed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getAllByText('Project not found').length).toBeGreaterThan(2))
    act(() => listDrag()({ active: { id: t1.id }, over: { id: t1.id + 1 } } as DragEndEvent))
  })
})

describe('project page — admin', () => {
  it('reviews a proposal, records an outcome, and manages ownership', async () => {
    const admin = await createAdmin()
    const proposer = await createVolunteer({ name: 'Pat Proposer' })
    const newOwner = await createVolunteer({ name: 'Nina New' })
    const pending = await createProject({
      title: 'Proposal',
      status: 'pending_review',
      creatorId: proposer.id,
    })
    await createTask(pending.id)
    await mount(pending.id, admin)
    await screen.findByRole('heading', { name: 'Proposal' })
    expect(screen.getByText('Pat Proposer')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/discussion/i))
    await userEvent.type(screen.getByLabelText('Message to Proposer'), 'Tell us more')
    fireEvent.submit(screen.getByLabelText('Message to Proposer').closest('form')!)
    await screen.findByText('Project sent for discussion.')
    await waitFor(async () => expect((await row(pending.id)).status).toBe('needs_discussion'))
    cleanup()
    await mount(pending.id, admin)
    await screen.findByRole('heading', { name: 'Proposal' })
    fireEvent.submit(screen.getByLabelText(/approve/i).closest('form')!)
    await screen.findByText('Project approved!')

    await userEvent.click(await screen.findByLabelText('Ownership actions'))
    await userEvent.click(screen.getByRole('button', { name: 'Transfer to' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Nina New' }))
    await userEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    await userEvent.click(screen.getByLabelText('Ownership actions'))
    await userEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Transfer' }),
    )
    await screen.findByText('Ownership transferred!')
    await waitFor(async () => expect((await row(pending.id)).assigneeId).toBe(newOwner.id))
    await userEvent.click(screen.getByLabelText('Ownership actions'))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Remove/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove ownership' }),
    )
    await waitFor(async () => expect((await row(pending.id)).assigneeId).toBeNull())

    // Outcome on a completed project (admin-only status pick first).
    await userEvent.click(screen.getByRole('button', { name: 'project status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Completed' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await screen.findByText('Status updated!')
    await userEvent.click(await screen.findByRole('button', { name: 'Outcome' }))
    fireEvent.submit(screen.getByLabelText('Outcome Notes').closest('form')!)
    await userEvent.click(screen.getByRole('option', { name: 'Successful' }))
    await userEvent.type(screen.getByLabelText('Outcome Notes'), 'Went well')
    await userEvent.click(screen.getByRole('button', { name: 'Record Outcome' }))
    await screen.findByText('Outcome recorded!')
    await waitFor(() =>
      expect(screen.getByText(/Outcome:/).parentElement).toHaveTextContent('Successful'),
    )
  })

  it('shows org-proposed projects, the other outcome labels, and admin-only status values', async () => {
    const admin = await createAdmin()
    for (const [outcome, label] of [
      ['partial', 'Partial'],
      ['not_completed', 'Not Completed'],
      ['ongoing', 'Ongoing'],
      ['weird', 'weird'],
    ] as const) {
      cleanup()
      const p = await createProject({
        title: `Outcome ${outcome}`,
        status: 'completed',
        outcome,
        isOrgProposed: true,
        creatorId: admin.id,
      })
      await mount(p.id, admin)
      await screen.findByRole('heading', { name: `Outcome ${outcome}` })
      expect(screen.getByText(/Outcome:/).parentElement).toHaveTextContent(label)
      expect(screen.getByText(/Proposer:/)).toHaveTextContent('PauseAI')
    }
    cleanup()
    const archived = await createProject({ title: 'Archived one', status: 'archived' })
    await mount(archived.id, admin)
    await screen.findByRole('heading', { name: 'Archived one' })
    expect(screen.getByRole('button', { name: 'project status' })).toHaveTextContent('Archived')
  })
})

describe('project page — timeline tab', () => {
  async function setupTimeline() {
    const owner = await createVolunteer({ name: 'Tina Timeline' })
    const helper = await createVolunteer({ name: 'Hal Helper' })
    const project = await createProject({
      title: 'Timed project',
      assigneeId: owner.id,
      status: 'in_progress',
      startDate: new Date('2026-06-01T00:00:00Z'),
    })
    const a = await createTask(project.id, {
      title: 'Alpha',
      durationDays: 2,
      startDate: new Date('2026-06-01T00:00:00Z'),
      baselineStartDate: new Date('2026-06-01T00:00:00Z'),
      baselineDurationDays: 2,
      baselineSetAt: new Date('2026-05-01T00:00:00Z'),
    })
    const b = await createTask(project.id, { title: 'Beta', durationDays: 1 })
    const c = await createTask(project.id, { title: 'Gamma' })
    await prisma.workItemDependency.create({ data: { predecessorId: a.id, successorId: b.id } })
    return { owner, helper, project, a, b, c }
  }

  it('opens from the URL hash, switches tabs, and drives the chart and panel', async () => {
    const { owner, helper, project, a, b, c } = await setupTimeline()
    await mount(project.id, owner, '#timeline')
    await screen.findByRole('heading', { name: 'Timed project' })
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true')
    await screen.findByRole('button', { name: /^Alpha:/ })
    expect(screen.getByText('Unscheduled (1)')).toBeInTheDocument()
    expect(screen.getByText(/Baseline set/)).toBeInTheDocument()

    // Tab switching pushes history; the popstate/hashchange listeners read it back.
    await userEvent.click(screen.getByRole('tab', { name: 'List' }))
    expect(window.location.hash).toBe('')
    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(window.location.hash).toBe('#timeline')
    act(() => {
      window.history.pushState(null, '', `/projects/${project.id}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
    act(() => {
      window.location.hash = '#timeline'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByRole('button', { name: /^Alpha:/ })

    await userEvent.click(screen.getByLabelText('Add Gamma to the timeline'))
    await waitFor(async () => expect((await row(c.id)).durationDays).toBe(1))
    await waitFor(() => expect(screen.queryByText(/Unscheduled/)).toBeNull())

    // Drag a bar (via the captured DndContext), then link two bars.
    act(() =>
      ganttDrag()({
        active: { data: { current: { kind: 'move', rowId: b.id } } },
        delta: { x: 800, y: 0 },
      } as never),
    )
    await waitFor(async () => expect((await row(b.id)).startDate).not.toBeNull())
    act(() =>
      ganttDrag()({
        active: { data: { current: { kind: 'link', rowId: b.id } } },
        over: { data: { current: { rowId: c.id } } },
        delta: { x: 0, y: 0 },
      } as never),
    )
    await screen.findByText('Dependency added')

    // Select a bar to open the panel; edit dates, anchor, lag, dependencies, assignment.
    await userEvent.click(screen.getByRole('button', { name: /^Beta:/ }))
    const panel = () => screen.getByRole('complementary')
    await within(panel()).findByText('Beta')
    fireEvent.change(within(panel()).getByLabelText('Duration'), { target: { value: '4' } })
    fireEvent.submit(within(panel()).getByLabelText('Duration').closest('form')!)
    await waitFor(async () => expect((await row(b.id)).durationDays).toBe(4))
    await userEvent.click(within(panel()).getByRole('checkbox'))
    await waitFor(async () => expect((await row(b.id)).isAnchor).toBe(true))
    const lag = within(panel()).getByLabelText(/Lag/, { selector: 'input[id^="panel-lag-"]' })
    fireEvent.change(lag, { target: { value: '2' } })
    fireEvent.blur(lag)
    await waitFor(async () =>
      expect(
        (await prisma.workItemDependency.findFirstOrThrow({ where: { successorId: b.id } }))
          .lagDays,
      ).toBe(2),
    )
    await userEvent.click(within(panel()).getByRole('button', { name: /Remove dependency on/ }))
    await waitFor(async () =>
      expect(await prisma.workItemDependency.count({ where: { successorId: b.id } })).toBe(0),
    )
    await waitFor(() =>
      expect(
        within(within(panel()).getByLabelText('Add a dependency')).getByRole('option', {
          name: 'Alpha',
        }),
      ).toBeInTheDocument(),
    )
    await userEvent.selectOptions(within(panel()).getByLabelText('Add a dependency'), String(a.id))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Add' }))
    await waitFor(async () =>
      expect(await prisma.workItemDependency.count({ where: { successorId: b.id } })).toBe(1),
    )
    await userEvent.click(within(panel()).getByRole('button', { name: 'Assign to me' }))
    await screen.findByText('Task claimed!')
    await waitFor(async () => expect((await row(b.id)).assigneeId).toBe(owner.id))
    await userEvent.click(await within(panel()).findByRole('button', { name: 'Unassign' }))
    await screen.findByText('Task unassigned!')
    await userEvent.selectOptions(
      await within(panel()).findByLabelText('Assign to a volunteer'),
      String(helper.id),
    )
    await userEvent.click(within(panel()).getByRole('button', { name: 'Assign' }))
    await screen.findByText('Task assigned!')
    await userEvent.click(within(panel()).getByLabelText('Close panel'))
    expect(screen.queryByRole('complementary')).toBeNull()
    // Selecting the same bar twice toggles the panel off.
    await userEvent.click(screen.getByRole('button', { name: /^Beta:/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Beta:/ }))
    expect(screen.queryByRole('complementary')).toBeNull()

    // Remove an arrow from the chart itself (selected row's edges show a ×).
    await userEvent.click(screen.getByRole('button', { name: /^Beta:/ }))
    await userEvent.click(
      await screen.findByRole('button', { name: /Remove dependency Alpha → Beta/ }),
    )
    await waitFor(async () =>
      expect(await prisma.workItemDependency.count({ where: { successorId: b.id } })).toBe(0),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Re-baseline' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Re-baseline' }))
    await userEvent.click(screen.getByRole('button', { name: 'Replace baseline' }))
    await screen.findByText('Baseline updated')
    await waitFor(async () => expect((await row(b.id)).baselineDurationDays).toBe(4))
    const startBefore = (await row(b.id)).startDate

    // A drag whose cache entry has been evicted still lands; there is just nothing to patch
    // optimistically. Last, because removing a live query detaches the chart from its refetches.
    queryClient.removeQueries({ queryKey: orpc.projects.listTasks.key() })
    act(() =>
      ganttDrag()({
        active: { data: { current: { kind: 'move', rowId: b.id } } },
        delta: { x: 800, y: 0 },
      } as never),
    )
    await waitFor(async () => expect((await row(b.id)).startDate).not.toEqual(startBefore))
  })

  it('handles the empty timeline, "add all", and failures', async () => {
    const owner = await createVolunteer()
    const project = await createProject({
      title: 'Empty timeline',
      assigneeId: owner.id,
      status: 'in_progress',
    })
    await mount(project.id, owner, '#timeline')
    await screen.findByRole('heading', { name: 'Empty timeline' })
    await screen.findByText(/No tasks/i)
    cleanup()
    const t1 = await createTask(project.id, { title: 'Loose one' })
    const t2 = await createTask(project.id, { title: 'Loose two' })
    await mount(project.id, owner, '#timeline')
    await screen.findByText('Unscheduled (2)')
    expect(screen.getByText(/No tasks have dates yet/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add all to timeline' }))
    await waitFor(async () => expect((await row(t2.id)).durationDays).toBe(1))
    await screen.findByRole('button', { name: /^Loose one:/ })
    await userEvent.click(screen.getByRole('button', { name: 'Set baseline' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Set baseline' })[1])
    await screen.findByText('Baseline updated')

    // Failures: an anchor change and a reschedule on a task that vanished.
    await userEvent.click(screen.getByRole('button', { name: /^Loose one:/ }))
    await prisma.workItem.delete({ where: { id: t1.id } })
    const panel = screen.getByRole('complementary')
    await userEvent.click(within(panel).getByRole('checkbox'))
    await screen.findByText('Project or task not found')
    await userEvent.selectOptions(within(panel).getByLabelText('Add a dependency'), String(t2.id))
    await userEvent.click(within(panel).getByRole('button', { name: 'Add' }))
    await screen.findByText('One or both items were not found')
    // A failed reschedule is rolled back and the timeline refetched (which drops the panel).
    fireEvent.submit(within(panel).getByLabelText('Duration').closest('form')!)
    await screen.findByText('One or more items were not found')
    await userEvent.click(await screen.findByRole('button', { name: 'Re-baseline' }))
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Replace baseline' }))
    await screen.findByText('Unauthorized')
  })

  it('shows a read-only timeline to a visitor', async () => {
    const { project } = await setupTimeline()
    const visitor = await createVolunteer()
    await mount(project.id, visitor, '#timeline')
    await screen.findByRole('button', { name: /^Alpha:/ })
    expect(screen.queryByRole('button', { name: 'Add all to timeline' })).toBeNull()
    expect(screen.getByText(/These tasks have no dates yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /baseline/i })).toBeNull()
  })
})

describe('project page — remaining edges', () => {
  it('ignores an empty task title, a same-status pick, declined confirms, and lets an admin approve the contribute radio', async () => {
    const admin = await createAdmin()
    const owner = await createVolunteer({ name: 'Rita Owner' })
    const project = await createProject({
      title: 'Edge project',
      assigneeId: owner.id,
      status: 'in_progress',
      creatorId: owner.id,
    })
    await mount(project.id, admin)
    await screen.findByRole('heading', { name: 'Edge project' })
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    fireEvent.submit(screen.getByLabelText('Task title').closest('form')!)
    expect(await prisma.workItem.count({ where: { parentId: project.id } })).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'project status' }))
    await userEvent.click(screen.getByRole('option', { name: 'In Progress' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'project status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Archived' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(await screen.findByLabelText('Ownership actions'))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Remove/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect((await row(project.id)).assigneeId).toBe(owner.id)

    cleanup()
    const pending = await createProject({
      title: 'Approve me',
      status: 'pending_review',
      creatorId: owner.id,
    })
    await mount(pending.id, admin)
    await screen.findByRole('heading', { name: 'Approve me' })
    await userEvent.click(screen.getByLabelText(/discussion/i))
    await userEvent.click(screen.getByLabelText(/approve/i))
    await prisma.workItem.delete({ where: { id: pending.id } })
    fireEvent.submit(screen.getByLabelText(/approve/i).closest('form')!)
    await screen.findByText('Project not found')
  })

  it('a visitor can switch interest type back to contribute, and sees errors for interest, contact and outcome', async () => {
    const me = await createVolunteer()
    const owner = await createVolunteer()
    const project = await createProject({
      title: 'Interest edges',
      assigneeId: owner.id,
      status: 'in_progress',
      isSeekingHelp: true,
    })
    await mount(project.id, me)
    await screen.findByRole('heading', { name: 'Interest edges' })
    await userEvent.click(screen.getByLabelText(/I want to own/))
    await userEvent.click(screen.getByLabelText(/contribute|help/i))
    // Claiming a task that no longer exists, then declining the withdraw confirmation.
    const gone = await createTask(project.id, { title: 'Gone task' })
    cleanup()
    await mount(project.id, me)
    await screen.findByRole('button', { name: 'Claim' })
    await prisma.workItem.delete({ where: { id: gone.id } })
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    await screen.findByText('Project or task not found')
    await prisma.workItemInterest.create({
      data: { workItemId: project.id, volunteerId: me.id, interestType: 'want_to_contribute' },
    })
    cleanup()
    await mount(project.id, me)
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw Interest' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(
      (await prisma.workItemInterest.findFirstOrThrow({ where: { volunteerId: me.id } })).status,
    ).toBe('pending')
    await prisma.workItemInterest.deleteMany({ where: { volunteerId: me.id } })
    cleanup()
    await mount(project.id, me)
    await screen.findByLabelText(/I want to own/)
    await prisma.workItem.update({ where: { id: project.id }, data: { isSeekingHelp: false } })
    await userEvent.click(screen.getByRole('button', { name: 'Express Interest' }))
    await screen.findByText('This project is not currently seeking volunteers')
    await userEvent.click(screen.getByRole('button', { name: /Contact/ }))
    await userEvent.type(screen.getByLabelText('Subject'), 'Hi')
    await userEvent.type(screen.getByLabelText('Message'), 'There')
    await prisma.volunteer.update({
      where: { id: owner.id },
      data: { consentContactableByProjectOwners: false },
    })
    fireEvent.submit(screen.getByLabelText('Subject').closest('form')!)
    await screen.findByText(/doesn't accept messages/)

    cleanup()
    const admin = await createAdmin()
    const done = await createProject({
      title: 'Outcome edge',
      status: 'completed',
      assigneeId: owner.id,
    })
    await mount(done.id, admin)
    await screen.findByRole('heading', { name: 'Outcome edge' })
    await userEvent.click(screen.getByRole('button', { name: 'Outcome' }))
    await userEvent.click(screen.getByRole('option', { name: 'Ongoing' }))
    await prisma.workItem.delete({ where: { id: done.id } })
    await userEvent.click(screen.getByRole('button', { name: 'Record Outcome' }))
    await screen.findByText('Project not found')
  })

  it('shows direct contact details for the owner and an import through the porting modal', async () => {
    const me = await createVolunteer()
    const owner = await createVolunteer({
      discordHandle: 'own#1',
      signalNumber: '+1',
      whatsappNumber: '+2',
      consentContactableByProjectOwners: true,
      consentShareContactInfoWithProjectOwner: true,
    })
    const project = await createProject({
      title: 'Contact edge',
      assigneeId: owner.id,
      status: 'in_progress',
    })
    await mount(project.id, me)
    await screen.findByRole('heading', { name: 'Contact edge' })
    await userEvent.click(screen.getByRole('button', { name: /Contact/ }))
    await screen.findByText(/own#1/)

    cleanup()
    const { clientAs } = await import('@/test/rpc')
    const file = await clientAs(owner).projects.exportPlan({ projectId: project.id })
    await mount(project.id, owner)
    await screen.findByRole('heading', { name: 'Contact edge' })
    await userEvent.click(screen.getByRole('button', { name: 'Export / Import' }))
    const edited = { ...file, project: { ...file.project, title: 'Imported title' } }
    fireEvent.change(screen.getByLabelText('Paste export JSON'), {
      target: { value: JSON.stringify(edited) },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Preview pasted JSON' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }))
    await screen.findByText(/Imported:/)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Export and import' })).toBeNull(),
    )
  })
})
