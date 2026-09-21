import { describe, it, expect } from 'vitest'
import { screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin, createProject, createTask } from '@/test/factories'
import { renderApp } from '@/test/render'
import TaskDetailPage from './page'

const row = (id: number) => prisma.workItem.findUniqueOrThrow({ where: { id } })
const mount = (
  projectId: number | string,
  taskId: number | string,
  as: Awaited<ReturnType<typeof createVolunteer>>,
) =>
  renderApp(
    <TaskDetailPage params={Promise.resolve({ id: String(projectId), taskId: String(taskId) })} />,
    { as },
  )

describe('task detail page', () => {
  it('shows a task, lets a volunteer claim it, and the owner edit it and manage dependencies', async () => {
    const owner = await createVolunteer({ name: 'Ola Owner' })
    const me = await createVolunteer()
    const project = await createProject({
      title: 'Parent',
      assigneeId: owner.id,
      status: 'in_progress',
    })
    const pred = await createTask(project.id, { title: 'Predecessor', sortOrder: 1 })
    const other = await createTask(project.id, { title: 'Other', sortOrder: 2 })
    const task = await createTask(project.id, {
      title: 'The task',
      description: 'Details',
      estimatedHours: 2,
      deadline: new Date('2030-01-01T00:00:00Z'),
      startDate: new Date('2029-12-01T00:00:00Z'),
      durationDays: 1,
      sortOrder: 3,
    })
    await prisma.workItemDependency.create({
      data: { predecessorId: pred.id, successorId: task.id, lagDays: 1 },
    })

    await mount(project.id, task.id, me)
    await screen.findByRole('heading', { name: 'The task' })
    expect(screen.getByRole('link', { name: '← Back to Parent' })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    )
    expect(screen.getByText('~2h estimated')).toBeInTheDocument()
    expect(screen.getByText('Due 1 January 2030')).toBeInTheDocument()
    expect(screen.getByText(/Planned 1 December 2029 · 1 day/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Predecessor' })).toBeInTheDocument()
    const depRow = (name: string) => screen.getByRole('link', { name }).closest('li') as HTMLElement
    expect(within(depRow('Predecessor')).getByRole('spinbutton')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    await screen.findByText(/Task claimed\. Post an update/)
    await waitFor(async () => expect((await row(task.id)).assigneeId).toBe(me.id))
    await screen.findByText(`Assigned to ${me.name}`)
    await screen.findByText(/Started/)

    cleanup()
    await mount(project.id, task.id, owner)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const title = screen.getByLabelText('Task title')
    await userEvent.clear(title)
    // Enter submits the form even though Save is disabled; a blank title must not be sent.
    fireEvent.submit(title.closest('form')!)
    await userEvent.type(title, 'Renamed task')
    await userEvent.clear(screen.getByLabelText('Description'))
    await userEvent.clear(screen.getByLabelText('Estimated hours'))
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } })
    await userEvent.clear(screen.getByLabelText('Duration (days)'))
    await userEvent.click(screen.getByRole('checkbox'))
    fireEvent.submit(title.closest('form')!)
    await screen.findByText('Task updated!')
    expect(await row(task.id)).toMatchObject({
      title: 'Renamed task',
      description: null,
      estimatedHours: null,
      deadline: null,
      startDate: null,
      durationDays: null,
      featuredAsQuickTask: true,
    })
    await screen.findByRole('heading', { name: 'Renamed task' })

    // Lag edits write only on change; dependencies can be removed and added.
    const lag = within(depRow('Predecessor')).getByRole('spinbutton')
    fireEvent.change(lag, { target: { value: '1' } })
    fireEvent.blur(lag)
    fireEvent.change(lag, { target: { value: '' } })
    fireEvent.blur(lag)
    await waitFor(async () =>
      expect(
        (await prisma.workItemDependency.findFirstOrThrow({ where: { successorId: task.id } }))
          .lagDays,
      ).toBe(0),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    await screen.findByText('Dependency removed')
    fireEvent.submit(screen.getByLabelText('Lag (days)').closest('form')!)
    await userEvent.selectOptions(
      await screen.findByLabelText('Add a dependency'),
      String(other.id),
    )
    await userEvent.type(screen.getByLabelText('Lag (days)'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('Dependency added')
    expect(
      await prisma.workItemDependency.findFirst({
        where: { predecessorId: other.id, successorId: task.id },
      }),
    ).toMatchObject({ lagDays: 2 })
  })

  it('handles missing tasks, the no-sibling case, and failures', async () => {
    const admin = await createAdmin()
    const project = await createProject({ title: 'Solo' })
    const only = await createTask(project.id, { title: 'Only task' })
    await mount(project.id, only.id, admin)
    await screen.findByRole('heading', { name: 'Only task' })
    expect(screen.getByText(/no other tasks/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await prisma.workItem.delete({ where: { id: only.id } })
    fireEvent.submit(screen.getByLabelText('Task title').closest('form')!)
    await screen.findByText('Project or task not found')
    cleanup()
    const done = await createTask(project.id, {
      title: 'Done one',
      status: 'completed',
      completedAt: new Date('2026-02-02T00:00:00Z'),
      startedAt: new Date('2026-02-01T00:00:00Z'),
    })
    await mount(project.id, done.id, admin)
    await screen.findByText(/finished 2 February 2026/)
    cleanup()
    await mount(project.id, 999999, admin)
    await screen.findByRole('link', { name: 'Back to Project' })
    cleanup()
    await mount('x', 'y', admin)
    await screen.findByRole('link', { name: 'Back to Project' })
  })

  it('reports dependency failures', async () => {
    const admin = await createAdmin()
    const project = await createProject({ title: 'Deps' })
    const a = await createTask(project.id, { title: 'A' })
    const b = await createTask(project.id, { title: 'B' })
    const dep = await prisma.workItemDependency.create({
      data: { predecessorId: a.id, successorId: b.id },
    })
    await mount(project.id, b.id, admin)
    await screen.findByRole('heading', { name: 'B' })
    await prisma.workItemDependency.delete({ where: { id: dep.id } })
    const lag = within(
      screen.getByRole('link', { name: 'A' }).closest('li') as HTMLElement,
    ).getByRole('spinbutton')
    fireEvent.change(lag, { target: { value: '3' } })
    fireEvent.blur(lag)
    await screen.findByText('Dependency not found')
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getAllByText('Dependency not found')).toHaveLength(2))
    // The task still lists A as a predecessor (stale), so add a fresh sibling and loop through it.
    const c = await createTask(project.id, { title: 'C' })
    await prisma.workItemDependency.create({ data: { predecessorId: b.id, successorId: c.id } })
    cleanup()
    await mount(project.id, b.id, admin)
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Add a dependency')).getByRole('option', { name: 'C' }),
      ).toBeInTheDocument(),
    )
    await userEvent.selectOptions(screen.getByLabelText('Add a dependency'), String(c.id))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText(/would create a loop/)
  })
})
