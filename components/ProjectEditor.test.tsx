import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import ProjectEditor from './ProjectEditor'

const mount = (
  props: React.ComponentProps<typeof ProjectEditor>,
  as: Awaited<ReturnType<typeof createVolunteer>>,
) => renderApp(<ProjectEditor {...props} />, { as })

const row = (id: number) => prisma.workItem.findUniqueOrThrow({ where: { id } })
const blur = (el: HTMLElement) => fireEvent.blur(el)

afterEach(() => vi.restoreAllMocks())

describe('ProjectEditor — new volunteer proposal', () => {
  it('requires a title before saving, then lazily creates a draft and moves to its edit page', async () => {
    const me = await createVolunteer()
    await mount({ variant: 'volunteer' }, me)
    await waitFor(() => expect(localStorage.getItem('authToken')).toBeTruthy())
    expect(screen.getByText(/reviewed by PauseAI team leads/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('A title is required, even for a draft.')).toBeInTheDocument()
    // Toasts expire on a timer, so clear this one and check Submit raises its own.
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(screen.queryByText('A title is required, even for a draft.')).toBeNull(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('A title is required, even for a draft.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Project Title'), 'My idea')
    await userEvent.type(screen.getByLabelText('Description'), 'Some words')
    const skill = await prisma.skill.findFirstOrThrow()
    await userEvent.click(await screen.findByLabelText(skill.name))
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        expect.stringMatching(/\/projects\/\d+\/edit/),
      ),
    )
    const draft = await prisma.workItem.findFirstOrThrow({ where: { creatorId: me.id } })
    expect(draft).toMatchObject({ title: 'My idea', status: 'draft', isOrgProposed: false })
    expect(
      await prisma.workItemSkill.count({ where: { workItemId: draft.id, skillId: skill.id } }),
    ).toBe(1)
    // Once the draft exists the editor reloads it; fields then commit on blur.
    const hours = await screen.findByLabelText('Hours per Week')
    fireEvent.change(hours, { target: { value: '4' } })
    blur(hours)
    await waitFor(async () => expect((await row(draft.id)).timeCommitmentHoursPerWeek).toBe(4))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Last saved/))
  })

  it('adding a task creates the draft first; the delete button cancels', async () => {
    const me = await createVolunteer()
    const onCancel = vi.fn()
    await mount({ variant: 'volunteer', onCancel }, me)
    await waitFor(() => expect(localStorage.getItem('authToken')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Add Task' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onCancel).toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Task title'), 'First task')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    expect(await screen.findByText('A title is required, even for a draft.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Project Title'), 'With task')
    await userEvent.type(screen.getByLabelText('Details (optional)'), 'detail')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled())
    const draft = await prisma.workItem.findFirstOrThrow({
      where: { creatorId: me.id, type: 'PROJECT' },
    })
    await waitFor(async () =>
      expect(await prisma.workItem.count({ where: { parentId: draft.id } })).toBe(1),
    )
    // The just-created draft's first load may have raced the task insert; the editor must still show it.
    await waitFor(() => expect(screen.getByDisplayValue('First task')).toBeInTheDocument())
  })

  it('asks for a task before submitting, without leaving a draft behind', async () => {
    const me = await createVolunteer()
    await mount({ variant: 'volunteer' }, me)
    await waitFor(() => expect(localStorage.getItem('authToken')).toBeTruthy())
    await userEvent.type(screen.getByLabelText('Project Title'), 'One click')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add at least one task before submitting.',
    )
    expect(screen.queryByText('Submit draft for review?')).toBeNull()
    expect(await prisma.workItem.count({ where: { creatorId: me.id } })).toBe(0)

    // The error stays until a task exists, and then submitting works.
    await userEvent.type(screen.getByLabelText('Task title'), 'First step')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await waitFor(() =>
      expect(screen.queryByText('Add at least one task before submitting.')).toBeNull(),
    )
    // Once the new draft has loaded, Submit is the draft's own button.
    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    await screen.findByText('Submit draft for review?')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await screen.findByText('Submit draft for review?')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Submit draft for review?')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Submit for Review' }))
    await screen.findByText('Draft submitted for review!')
    const draft = await prisma.workItem.findFirstOrThrow({
      where: { creatorId: me.id, type: 'PROJECT' },
    })
    expect(draft.status).toBe('pending_review')
  })

  it('keeps a start date and duration typed before the first save', async () => {
    const me = await createVolunteer()
    await mount({ variant: 'volunteer' }, me)
    await waitFor(() => expect(localStorage.getItem('authToken')).toBeTruthy())
    await userEvent.type(screen.getByLabelText('Project Title'), 'Dated')
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('Duration (days)'), { target: { value: '10' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(async () =>
      expect(await prisma.workItem.count({ where: { creatorId: me.id } })).toBe(1),
    )
    expect(await prisma.workItem.findFirstOrThrow({ where: { creatorId: me.id } })).toMatchObject({
      startDate: new Date('2026-07-01T00:00:00Z'),
      durationDays: 10,
    })
  })

  it('falls back to router.back() without onCancel, and admins publish org projects directly', async () => {
    const admin = await createAdmin()
    await mount({ variant: 'admin' }, admin)
    await waitFor(() => expect(localStorage.getItem('authToken')).toBeTruthy())
    expect(screen.queryByText(/reviewed by PauseAI/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(navigation.back).toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Project Title'), 'Org thing')
    await userEvent.type(screen.getByLabelText('Task title'), 'T1')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled())
    const draft = await prisma.workItem.findFirstOrThrow({
      where: { creatorId: admin.id, type: 'PROJECT' },
    })
    expect(draft.isOrgProposed).toBe(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Publish this project?')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Publish' })[1])
    await waitFor(async () => expect((await row(draft.id)).status).toBe('ready'))
    expect(await screen.findByText('Project published!')).toBeInTheDocument()
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/projects/${draft.id}`), {
      timeout: 3000,
    })
  })
})

describe('ProjectEditor — autosave line', () => {
  it('says when changes last saved, task changes included, and retries a failed save', async () => {
    const me = await createVolunteer()
    const project = await createProject({ creatorId: me.id, status: 'draft', title: 'Autosaved' })
    await mount({ projectId: project.id }, me)
    const title = await screen.findByDisplayValue('Autosaved')
    const line = () => screen.getByRole('status')
    expect(line()).toHaveTextContent('Changes save automatically.')
    expect(line()).not.toHaveTextContent('Last saved')

    await userEvent.type(screen.getByLabelText('Task title'), 'New task')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await waitFor(() => expect(line()).toHaveTextContent(/Last saved \d/))

    // A save that fails says so and can be retried once the cause is gone.
    const someoneElse = await createVolunteer()
    await prisma.workItem.update({
      where: { id: project.id },
      data: { creatorId: someoneElse.id },
    })
    fireEvent.change(title, { target: { value: 'Renamed' } })
    blur(title)
    await waitFor(() => expect(line()).toHaveTextContent("Couldn't save."))
    await prisma.workItem.update({ where: { id: project.id }, data: { creatorId: me.id } })
    await userEvent.click(within(line()).getByRole('button', { name: 'Retry' }))
    await waitFor(async () => expect((await row(project.id)).title).toBe('Renamed'))
    await waitFor(() => expect(line()).toHaveTextContent(/Last saved/))
  })
})

describe('ProjectEditor — editing an existing project', () => {
  it('loads the project, autosaves each field on change/blur, and manages tasks', async () => {
    const me = await createVolunteer()
    const team = await createTeam()
    const skill = await createSkill()
    const project = await createProject({
      creatorId: me.id,
      status: 'draft',
      title: 'Draft',
      description: 'D',
      skills: { create: [{ skillId: (await createSkill()).id }] },
      projectType: 'sprint',
      country: 'UK',
      localGroup: 'London',
      timeCommitmentHoursPerWeek: 2,
      startDate: new Date('2026-05-01T00:00:00Z'),
    })
    const task = await createTask(project.id, { title: 'Old title', description: null })
    await mount({ projectId: project.id }, me)
    expect(screen.getByText('Loading project…')).toBeInTheDocument()
    const title = await screen.findByDisplayValue('Draft')
    expect(screen.queryByRole('alert')).toBeNull()
    // Blurring untouched fields writes nothing.
    blur(title)
    blur(screen.getByLabelText('Description'))
    blur(screen.getByLabelText('Estimated Duration'))

    fireEvent.change(title, { target: { value: ' Draft 2 ' } })
    blur(title)
    await waitFor(async () => expect((await row(project.id)).title).toBe('Draft 2'))
    blur(title) // unchanged → no write
    const desc = screen.getByLabelText('Description')
    fireEvent.change(desc, { target: { value: 'New desc' } })
    blur(desc)
    await waitFor(async () => expect((await row(project.id)).description).toBe('New desc'))
    blur(desc)

    await userEvent.click(screen.getByRole('button', { name: 'Select project type' }))
    await userEvent.click(screen.getByRole('option', { name: /Time-boxed/ }))
    await waitFor(async () => expect((await row(project.id)).projectType).toBe('container'))
    const duration = screen.getByLabelText('Estimated Duration')
    fireEvent.change(duration, { target: { value: '6 weeks' } })
    blur(duration)
    await waitFor(async () => expect((await row(project.id)).estimatedDuration).toBe('6 weeks'))
    blur(duration)

    const hours = screen.getByLabelText('Hours per Week')
    blur(hours) // unchanged
    fireEvent.change(hours, { target: { value: '' } })
    blur(hours)
    await waitFor(async () => expect((await row(project.id)).timeCommitmentHoursPerWeek).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Select priority' }))
    await userEvent.click(screen.getByRole('option', { name: /High/ }))
    await waitFor(async () => expect((await row(project.id)).urgency).toBe('high'))

    await userEvent.click(screen.getByRole('button', { name: 'Select country/group' }))
    await userEvent.click(screen.getByRole('option', { name: 'Germany' }))
    await waitFor(async () =>
      expect(await row(project.id)).toMatchObject({ country: 'Germany', localGroup: null }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Select team' }))
    await userEvent.click(await screen.findByRole('option', { name: team.name }))
    await waitFor(async () => expect((await row(project.id)).teamId).toBe(team.id))

    await userEvent.click(screen.getByRole('button', { name: 'Select remote eligibility' }))
    await userEvent.click(screen.getByRole('option', { name: /any country/ }))
    await waitFor(async () => expect((await row(project.id)).remoteEligibility).toBe('GLOBAL'))

    const start = screen.getByLabelText('Start date')
    blur(start) // unchanged
    fireEvent.change(start, { target: { value: '2026-06-01' } })
    blur(start)
    await waitFor(async () =>
      expect((await row(project.id)).startDate).toEqual(new Date('2026-06-01T00:00:00Z')),
    )
    const days = screen.getByLabelText('Duration (days)')
    blur(days)
    fireEvent.change(days, { target: { value: '12' } })
    blur(days)
    await waitFor(async () => expect((await row(project.id)).durationDays).toBe(12))

    const link = screen.getByLabelText(/Collaboration Doc/)
    blur(link)
    fireEvent.change(link, { target: { value: 'https://doc' } })
    blur(link)
    await waitFor(async () => expect((await row(project.id)).collaborationLink).toBe('https://doc'))

    await userEvent.click(await screen.findByLabelText(skill.name))
    await waitFor(async () =>
      expect(await prisma.workItemSkill.count({ where: { workItemId: project.id } })).toBe(2),
    )

    await userEvent.click(screen.getByLabelText('Help / contributors'))
    await waitFor(async () => expect((await row(project.id)).isSeekingHelp).toBe(true))
    await userEvent.click(screen.getByLabelText(/I want to lead/))
    await waitFor(async () => expect((await row(project.id)).assigneeId).toBe(me.id))
    await userEvent.click(screen.getByLabelText('This project needs an owner / lead'))
    await waitFor(async () => expect((await row(project.id)).assigneeId).toBeNull())

    // Task edits save on blur only when changed; delete asks for confirmation.
    const taskTitle = screen.getByDisplayValue('Old title')
    blur(taskTitle)
    fireEvent.change(taskTitle, { target: { value: 'New title' } })
    blur(taskTitle)
    await waitFor(async () => expect((await row(task.id)).title).toBe('New title'))
    fireEvent.change(taskTitle, { target: { value: '   ' } })
    blur(taskTitle)
    const taskDesc = screen.getByLabelText('Details (optional)', {
      selector: `#task-desc-${task.id}`,
    })
    fireEvent.change(taskDesc, { target: { value: 'more' } })
    fireEvent.change(taskTitle, { target: { value: 'New title' } })
    blur(taskDesc)
    await waitFor(async () => expect((await row(task.id)).description).toBe('more'))
    const deleteTaskButton = screen.getByRole('button', { name: 'Delete task' })
    await userEvent.click(deleteTaskButton)
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(await row(task.id)).toBeTruthy()
    await userEvent.click(deleteTaskButton)
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete task' }),
    )
    await waitFor(async () =>
      expect(await prisma.workItem.count({ where: { id: task.id } })).toBe(0),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete Draft' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Draft' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Draft' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete Draft' })[1])
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/suggest'))
  })

  it('shows the permission notice to a stranger and refuses their edits', async () => {
    const owner = await createVolunteer()
    const stranger = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    await mount({ projectId: project.id }, stranger)
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission')
    expect(screen.getByLabelText('Project Title')).toBeDisabled()
    expect(screen.getByRole('link', { name: 'View Project' })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    )
    // Dropdowns are not disabled, so a change reaches the server and is refused there.
    await userEvent.click(screen.getByRole('button', { name: 'Select priority' }))
    await userEvent.click(screen.getByRole('option', { name: /Low/ }))
    expect(await screen.findByText('Not authorized to edit this project')).toBeInTheDocument()
    await userEvent.click(
      await screen.findByLabelText((await prisma.skill.findFirstOrThrow()).name),
    )
    expect(await prisma.workItemSkill.count({ where: { workItemId: project.id } })).toBe(0)
  })

  it('lets an admin delete a live project, and submits a volunteer draft for review', async () => {
    const admin = await createAdmin()
    const project = await createProject({ status: 'ready' })
    await mount({ projectId: project.id }, admin)
    await screen.findByDisplayValue(project.title)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Project' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Project' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Project' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete Project' })[1])
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/projects'))
    expect(await prisma.workItem.count({ where: { id: project.id } })).toBe(0)

    const me = await createVolunteer()
    const draft = await createProject({ status: 'draft', creatorId: me.id, title: 'Submit me' })
    await createTask(draft.id)
    navigation.reset()
    await mount({ projectId: draft.id }, me)
    await screen.findByDisplayValue('Submit me')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Submit for Review' }))
    await waitFor(async () => expect((await row(draft.id)).status).toBe('pending_review'))
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/dashboard#tab-projects'), {
      timeout: 3000,
    })
  })

  it('reports server errors for deletes and task writes', async () => {
    const me = await createVolunteer()
    const draft = await createProject({ status: 'draft', creatorId: me.id, title: 'Fragile' })
    const task = await createTask(draft.id, { title: 'T' })
    await mount({ projectId: draft.id }, me)
    await screen.findByDisplayValue('Fragile')
    // Pull the rug: the project disappears underneath the editor.
    await prisma.workItem.delete({ where: { id: draft.id } })
    const taskTitle = screen.getByDisplayValue('T')
    fireEvent.change(taskTitle, { target: { value: 'T2' } })
    blur(taskTitle)
    expect(await screen.findByText('Project or task not found')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete task' }),
    )
    expect(await screen.findByText('Project not found')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Task title', { selector: '#new-task-title' }), 'N')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))
    await waitFor(() => expect(screen.getAllByText('Project not found').length).toBeGreaterThan(1))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Draft' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete Draft' })[1])
    expect(await screen.findByText('Draft not found')).toBeInTheDocument()
    // Submitting checks the draft first, and says it has gone.
    for (const dismiss of screen.queryAllByLabelText('Dismiss')) await userEvent.click(dismiss)
    await waitFor(() => expect(screen.queryByText('Project not found')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Project not found')).toBeInTheDocument()
    expect(screen.queryByText('Submit draft for review?')).toBeNull()
    void task
  })

  it('reports a submit the server refuses', async () => {
    const me = await createVolunteer()
    const draft = await createProject({ status: 'draft', creatorId: me.id, title: 'Moved on' })
    await createTask(draft.id)
    await mount({ projectId: draft.id }, me)
    await screen.findByDisplayValue('Moved on')
    // Submitted from another tab meanwhile.
    await prisma.workItem.update({ where: { id: draft.id }, data: { status: 'pending_review' } })
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Submit for Review' }))
    expect(await screen.findByText('Not authorized to publish this draft')).toBeInTheDocument()
  })

  it('reports a failed create and a failed live delete', async () => {
    const admin = await createAdmin()
    const live = await createProject({ status: 'ready', title: 'Live' })
    await mount({ projectId: live.id }, admin)
    await screen.findByDisplayValue('Live')
    await prisma.workItem.delete({ where: { id: live.id } })
    await userEvent.click(screen.getByRole('button', { name: 'Delete Project' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete Project' })[1])
    expect(await screen.findByText('Project not found')).toBeInTheDocument()

    const me = await createVolunteer()
    for (let i = 0; i < 2; i++)
      await createProject({ status: 'draft', creatorId: me.id, isOrgProposed: false })
    cleanup()
    await mount({ variant: 'volunteer' }, me)
    await waitFor(() => expect(localStorage.getItem('authToken')).toBeTruthy())
    await userEvent.type(screen.getByLabelText('Project Title'), 'Third')
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/already have 2 drafts/)).toBeInTheDocument()
  })
})
