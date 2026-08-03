import { test, expect, getAlert, readAdminToken, createApprovedVolunteer } from '../fixtures'
import { createApiClient } from '../client'
import { fake } from '../fake'
import { selectFilterDropdown } from '../actions/ui'

test.describe('Quick Tasks: self-serve', () => {
  test('Volunteer browses and claims an open Quick Task', async ({ volunteer, baseUrl }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const taskTitle = fake.quickTaskTitle()
    const created = await adminApi.quickTasks.create({
      body: { title: taskTitle, description: 'Browse and claim test' },
    })
    expect(created.status).toBe(200)

    await volunteer.page.goto(`${baseUrl}/quick-tasks`)
    await expect(volunteer.page.getByRole('heading', { name: 'Browse Quick Tasks' })).toBeVisible({
      timeout: 10_000,
    })

    const card = volunteer.page.getByRole('article').filter({ hasText: taskTitle })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('button', { name: 'Claim' }).click()

    await expect(getAlert(volunteer.page)).toContainText('Task claimed!', { timeout: 10_000 })

    // Moves out of the browse pool into "My Quick Tasks" — same title, now with a status
    // badge and no Claim button, proving it's no longer the open/unclaimed browse card.
    await expect(card.getByRole('status')).toContainText('Assigned', { timeout: 10_000 })
    await expect(card.getByRole('button', { name: 'Claim' })).not.toBeVisible()
    await expect(volunteer.page.getByRole('article').filter({ hasText: taskTitle })).toHaveCount(1)
  })

  test('Volunteer views an unclaimed Quick Task detail page and claims from there', async ({
    volunteer,
    baseUrl,
  }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const taskTitle = fake.quickTaskTitle()
    const created = await adminApi.quickTasks.create({
      body: { title: taskTitle, description: 'Detail-page claim test' },
    })
    const taskId = (created.body as { id: number }).id

    await volunteer.page.goto(`${baseUrl}/quick-tasks/${taskId}`)
    await expect(volunteer.page.getByRole('heading', { name: taskTitle, level: 1 })).toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Claim' }).click()

    await expect(getAlert(volunteer.page)).toContainText('Task claimed!', { timeout: 10_000 })
    await expect(volunteer.page.getByRole('button', { name: 'Mark as Complete' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Admin flags a project task as a Quick Task; it appears in the browse pool and links back to the project', async ({
    volunteer,
    baseUrl,
  }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const taskTitle = `Quick-flagged ${Date.now()}`
    const projectCreated = await adminApi.admin.projects.create({
      body: {
        title: fake.projectTitle(),
        description: 'Featured task test project',
        projectType: null,
        estimatedDuration: null,
        timeCommitmentHoursPerWeek: null,
        urgency: 'medium',
        collaborationLink: null,
        country: null,
        localGroup: null,
        isSeekingHelp: true,
        isSeekingOwner: false,
        tasks: [{ title: 'Seed task' }],
      },
    })
    const projectId = (projectCreated.body as { id: number }).id

    const taskCreated = await adminApi.projects.createTask({
      body: { projectId, title: taskTitle, featuredAsQuickTask: true },
    })
    const taskId = (taskCreated.body as { id: number }).id

    await volunteer.page.goto(`${baseUrl}/quick-tasks`)
    const card = volunteer.page.getByRole('article').filter({ hasText: taskTitle })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText('Part of Project:')

    // Task title links into the task's own page in the project, not a separate Quick Task page.
    await expect(card.getByRole('link', { name: taskTitle })).toHaveAttribute(
      'href',
      `/projects/${projectId}/tasks/${taskId}`,
    )

    // Claiming from Quick Tasks assigns the task and auto-adds the volunteer as an
    // accepted participant on the project, even though they never expressed interest.
    await card.getByRole('button', { name: 'Claim' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Task claimed!', { timeout: 10_000 })

    // A claimed project task is not a QuickTask row, so it never lands in "My Quick
    // Tasks" — the volunteer is taken to the task itself rather than left on a page where
    // what they just claimed has silently disappeared.
    await expect(volunteer.page).toHaveURL(`${baseUrl}/projects/${projectId}/tasks/${taskId}`, {
      timeout: 10_000,
    })

    const project = await adminApi.projects.getById({ body: { id: projectId } })
    expect(project.status).toBe(200)
    const interests = (
      project.body as {
        interests: { volunteerId: number; status: string; message: string | null }[]
      }
    ).interests
    const autoInterest = interests.find((i) => i.volunteerId && i.status === 'accepted')
    expect(autoInterest).toBeTruthy()
    expect(autoInterest?.message).toContain(taskTitle)
  })

  test('Self-claim does not create a duplicate interest for a volunteer who already has one', async ({
    baseUrl,
  }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectCreated = await adminApi.admin.projects.create({
      body: {
        title: fake.projectTitle(),
        description: 'Duplicate interest guard test',
        projectType: null,
        estimatedDuration: null,
        timeCommitmentHoursPerWeek: null,
        urgency: 'medium',
        collaborationLink: null,
        country: null,
        localGroup: null,
        isSeekingHelp: true,
        isSeekingOwner: false,
        tasks: [{ title: 'Seed task' }],
      },
    })
    const projectId = (projectCreated.body as { id: number }).id
    const taskCreated = await adminApi.projects.createTask({
      body: { projectId, title: 'Claimable task' },
    })
    const taskId = (taskCreated.body as { id: number }).id

    const volunteer = await createApprovedVolunteer(baseUrl)
    const volApi = createApiClient(baseUrl, volunteer.token)

    // Volunteer already expressed interest before ever claiming a task
    const interestResult = await volApi.projects.expressInterest({
      body: { projectId, interestType: 'want_to_contribute', message: 'I would like to help' },
    })
    expect(interestResult.status).toBe(200)

    const claimResult = await volApi.projects.updateTask({
      body: { projectId, taskId, data: { status: 'in_progress', assigneeId: volunteer.id } },
    })
    expect(claimResult.status).toBe(200)

    const project = await adminApi.projects.getById({ body: { id: projectId } })
    const interests = (
      project.body as { interests: { volunteerId: number; message: string | null }[] }
    ).interests.filter((i) => i.volunteerId === volunteer.id)
    expect(interests).toHaveLength(1)
    expect(interests[0].message).toBe('I would like to help')
  })

  test('Admin unassigns a volunteer from a Quick Task via the inline action', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const taskTitle = fake.quickTaskTitle()
    await adminApi.quickTasks.create({
      body: { title: taskTitle, description: 'Unassign test' },
    })

    await adminPage.goto(`${baseUrl}/quick-tasks`)
    const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await taskCard.getByText(taskTitle, { exact: true }).click()

    await selectFilterDropdown(
      adminPage,
      `Assign volunteer to ${taskTitle}`,
      volunteer.name,
      taskCard,
    )
    await taskCard.getByRole('button', { name: 'Assign', exact: true }).click()
    await expect(getAlert(adminPage)).toContainText('Task assigned!', { timeout: 10_000 })
    await expect(taskCard.getByRole('status')).toContainText('in_progress', { timeout: 10_000 })

    await taskCard.getByRole('button', { name: 'Unassign' }).click()
    await expect(getAlert(adminPage)).toContainText('Assignee removed', { timeout: 10_000 })
    await expect(taskCard.getByRole('status')).toContainText('open', { timeout: 10_000 })
  })
})

test.describe('Leaving a project', () => {
  // A project with one seed task plus one extra claimable task, owned by nobody in
  // particular — enough to test who may self-claim on it.
  async function seedProjectWithTask(
    baseUrl: string,
    taskTitle: string,
    featuredAsQuickTask = false,
  ): Promise<{ projectId: number; taskId: number }> {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectCreated = await adminApi.admin.projects.create({
      body: {
        title: fake.projectTitle(),
        description: 'Leaving-a-project test',
        projectType: null,
        estimatedDuration: null,
        timeCommitmentHoursPerWeek: null,
        urgency: 'medium',
        collaborationLink: null,
        country: null,
        localGroup: null,
        isSeekingHelp: true,
        isSeekingOwner: false,
        tasks: [{ title: 'Seed task' }],
      },
    })
    const projectId = (projectCreated.body as { id: number }).id
    const taskCreated = await adminApi.projects.createTask({
      body: { projectId, title: taskTitle, featuredAsQuickTask },
    })
    return { projectId, taskId: (taskCreated.body as { id: number }).id }
  }

  test('A volunteer declined from a project cannot claim its tasks', async ({ baseUrl }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const taskTitle = `Declined-claim ${Date.now()}`
    const { projectId, taskId } = await seedProjectWithTask(baseUrl, taskTitle, true)

    const volunteer = await createApprovedVolunteer(baseUrl)
    const volApi = createApiClient(baseUrl, volunteer.token)

    await volApi.projects.expressInterest({
      body: { projectId, interestType: 'want_to_contribute', message: 'Keen to help' },
    })
    const project = await adminApi.projects.getById({ body: { id: projectId } })
    const interestId = (
      project.body as { interests: { id: number; volunteerId: number }[] }
    ).interests.find((i) => i.volunteerId === volunteer.id)!.id
    const declined = await adminApi.projects.respondToInterest({
      body: { projectId, interestId, status: 'declined', responseMessage: 'Not this time' },
    })
    expect(declined.status).toBe(200)

    const claim = await volApi.projects.updateTask({
      body: { projectId, taskId, data: { status: 'in_progress', assigneeId: volunteer.id } },
    })
    expect(claim.status).toBe(403)

    // And the task isn't advertised to them in the Quick Tasks browse pool either.
    const available = await volApi.quickTasks.available()
    const titles = (available.body as { title: string }[]).map((t) => t.title)
    expect(titles).not.toContain(taskTitle)
  })

  test('Withdrawing from a project releases the tasks that volunteer holds on it', async ({
    baseUrl,
  }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const taskTitle = `Withdraw-release ${Date.now()}`
    const { projectId, taskId } = await seedProjectWithTask(baseUrl, taskTitle)

    const volunteer = await createApprovedVolunteer(baseUrl)
    const volApi = createApiClient(baseUrl, volunteer.token)

    const claim = await volApi.projects.updateTask({
      body: { projectId, taskId, data: { status: 'in_progress', assigneeId: volunteer.id } },
    })
    expect(claim.status).toBe(200)

    const withdrawn = await volApi.projects.withdrawInterest({ body: { projectId } })
    expect(withdrawn.status).toBe(200)

    const task = await adminApi.projects.getTask({ body: { projectId, taskId } })
    expect((task.body as { status: string }).status).toBe('open')
    expect((task.body as { assignedToId: number | null }).assignedToId).toBeNull()

    // Having left, they can no longer pick it back up.
    const reclaim = await volApi.projects.updateTask({
      body: { projectId, taskId, data: { status: 'in_progress', assigneeId: volunteer.id } },
    })
    expect(reclaim.status).toBe(403)
  })
})
