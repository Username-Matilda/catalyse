import { test, expect, getAlert, readAdminToken, createApprovedVolunteer } from '../fixtures'
import { createApiClient } from '../client'
import { fake } from '../fake'
import { selectFilterDropdown } from '../actions/ui'

test.describe('Quick Tasks: self-serve', () => {
  test('Volunteer browses and claims an open Quick Task', async ({ volunteer, baseUrl }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
    const taskTitle = fake.starterTaskTitle()
    const created = await adminApi.starterTasks.create({
      body: { title: taskTitle, description: 'Browse and claim test' },
    })
    expect(created.status).toBe(200)

    await volunteer.page.goto(`${baseUrl}/starter-tasks`)
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
    const taskTitle = fake.starterTaskTitle()
    const created = await adminApi.starterTasks.create({
      body: { title: taskTitle, description: 'Detail-page claim test' },
    })
    const taskId = (created.body as { id: number }).id

    await volunteer.page.goto(`${baseUrl}/starter-tasks/${taskId}`)
    await expect(volunteer.page.getByRole('heading', { name: taskTitle, level: 1 })).toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Claim' }).click()

    await expect(getAlert(volunteer.page)).toContainText('Task claimed!', { timeout: 10_000 })
    await expect(
      volunteer.page.getByRole('button', { name: 'Mark as Complete' }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Admin flags a project task as a Quick Task; it appears in the browse pool and links back to the project', async ({
    adminPage,
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

    await volunteer.page.goto(`${baseUrl}/starter-tasks`)
    const card = volunteer.page.getByRole('article').filter({ hasText: taskTitle })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText('Part of Project:')

    // Claiming from Quick Tasks assigns the task and auto-adds the volunteer as an
    // accepted participant on the project, even though they never expressed interest.
    await card.getByRole('button', { name: 'Claim' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Task claimed!', { timeout: 10_000 })

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

    // Task title links into the task's own page in the project, not a separate Quick Task page
    await card.getByRole('link', { name: taskTitle }).click()
    await expect(volunteer.page).toHaveURL(`${baseUrl}/projects/${projectId}/tasks/${taskId}`)
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
    const taskTitle = fake.starterTaskTitle()
    await adminApi.starterTasks.create({
      body: { title: taskTitle, description: 'Unassign test' },
    })

    await adminPage.goto(`${baseUrl}/admin/starter-tasks`)
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
