import { test, expect, getAlert, readAdminToken, confirmVolunteerEmail, approveVolunteer } from '../fixtures'
import { fake } from '../fake'
import { proposeProject, adminCreateProject, adminApproveProject } from '../actions/projects'
import { Page } from '@playwright/test'
import { createApiClient } from '../client'

// Produces an in_progress project with one open task ("Initial task") proposed by the volunteer
async function setupInProgressProject(
  baseUrl: string,
  adminPage: Page,
  volunteer: { page: Page; name: string },
): Promise<number> {
  const title = fake.projectTitle()
  const id = await proposeProject(baseUrl, volunteer.page, title, 'Setup for task scenarios')
  await adminApproveProject(baseUrl, adminPage, title)
  return id
}

test.describe('Project Tasks', () => {
  test('Adding a task to a needs_tasks project auto-promotes it to In Progress', async ({
    adminPage,
    baseUrl,
  }) => {
    await adminCreateProject(
      baseUrl,
      adminPage,
      fake.projectTitle(),
      'Project for auto-promotion test',
    )

    await expect(adminPage.getByLabel('project status')).toContainText('Needs Tasks', {
      timeout: 10_000,
    })

    await adminPage.getByRole('button', { name: 'Add Task' }).click()
    await adminPage.getByLabel('Task title').fill('First task')
    await adminPage.getByRole('button', { name: 'Create Task' }).click()
    await expect(getAlert(adminPage)).toContainText('Task added!', { timeout: 10_000 })

    await expect(adminPage.getByLabel('project status')).toContainText('In Progress', {
      timeout: 10_000,
    })
  })

  test('A volunteer can claim an open task', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupInProgressProject(baseUrl, adminPage, volunteer)

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

    await expect(volunteer.page.getByRole('button', { name: 'Claim' })).toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Claim' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Task claimed!', { timeout: 10_000 })

    // Done button appears only for the assignee — confirms task is now assigned to this volunteer
    await expect(volunteer.page.getByRole('button', { name: 'Done' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('A volunteer can mark their claimed task as done', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const projectId = await setupInProgressProject(baseUrl, adminPage, volunteer)

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

    await volunteer.page.getByRole('button', { name: 'Claim' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Task claimed!', { timeout: 10_000 })

    await volunteer.page.getByRole('button', { name: 'Done' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Task completed!', { timeout: 10_000 })

    await expect(volunteer.page.getByRole('button', { name: 'Done' })).not.toBeVisible({
      timeout: 10_000,
    })
    await expect(volunteer.page.getByText('done', { exact: true })).toBeVisible({ timeout: 10_000 })
  })

  // TODO: project task cards have no comment thread UI — convert this to a UI test once
  // a CommentThread is added to each task card on the project page (similar to how
  // starter tasks show comments on the dashboard and admin pages).
  test('Admin and task assignee exchange comments on a project task', async ({ baseUrl }) => {
    const adminToken = readAdminToken(baseUrl)
    expect(adminToken).toBeTruthy()
    const adminApi = createApiClient(baseUrl, adminToken)

    // Admin creates a project and a task
    const projectCreated = await adminApi.admin.projects.create({
      body: { title: fake.projectTitle(), description: 'Task comment back-and-forth test' },
    })
    expect(projectCreated.status).toBe(200)
    const projectId = (projectCreated.body as { id: number }).id

    const taskCreated = await adminApi.projects.createTask({
      body: { projectId, title: 'Back-and-forth comment task' },
    })
    expect(taskCreated.status).toBe(200)
    const taskId = (taskCreated.body as { id: number }).id

    // A fresh volunteer signs up, gets approved, and claims the task
    const person = fake.person()
    const api = createApiClient(baseUrl)
    const signup = await api.auth.signup({
      body: {
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    expect(signup.status).toBe(200)
    const {
      id: volId,
      token: volToken,
      emailVerificationToken,
    } = signup.body as { id: number; token: string; emailVerificationToken?: string }
    if (emailVerificationToken) await confirmVolunteerEmail(baseUrl, emailVerificationToken)
    await approveVolunteer(baseUrl, volId)
    const volApi = createApiClient(baseUrl, volToken)

    const claim = await volApi.projects.updateTask({
      body: { projectId, taskId, data: { status: 'in_progress', assigneeId: volId } },
    })
    expect(claim.status).toBe(200)

    // Admin posts the first comment on the task
    const adminComment = `admin feedback ${Date.now()}`
    const adminPost = await adminApi.workItemComments.add({
      body: { workItemId: taskId, content: adminComment },
    })
    expect(adminPost.status).toBe(200)

    // Volunteer reads the thread and sees admin's comment
    const volList = await volApi.workItemComments.list({ body: { workItemId: taskId } })
    expect(volList.status).toBe(200)
    expect(
      (volList.body as { comments: { content: string }[] }).comments.some(
        (c) => c.content === adminComment,
      ),
    ).toBe(true)

    // Volunteer replies
    const volunteerReply = `volunteer reply ${Date.now()}`
    const volPost = await volApi.workItemComments.add({
      body: { workItemId: taskId, content: volunteerReply },
    })
    expect(volPost.status).toBe(200)

    // Admin reads the thread and sees both messages
    const adminList = await adminApi.workItemComments.list({ body: { workItemId: taskId } })
    expect(adminList.status).toBe(200)
    const finalComments = (adminList.body as { comments: { content: string }[] }).comments
    expect(finalComments.some((c) => c.content === adminComment)).toBe(true)
    expect(finalComments.some((c) => c.content === volunteerReply)).toBe(true)
  })

  test('Admin deletes a task', async ({ adminPage, baseUrl }) => {
    test.setTimeout(60_000)
    await adminCreateProject(
      baseUrl,
      adminPage,
      fake.projectTitle(),
      'Project for task deletion test',
    )

    await adminPage.getByRole('button', { name: 'Add Task' }).click()
    await adminPage.getByLabel('Task title').fill('Task to delete')
    await adminPage.getByRole('button', { name: 'Create Task' }).click()
    await expect(getAlert(adminPage)).toContainText('Task added!', { timeout: 10_000 })

    adminPage.once('dialog', (dialog) => dialog.accept())
    await adminPage.getByRole('button', { name: 'Delete task' }).click()

    await expect(getAlert(adminPage)).toContainText('Task deleted!', { timeout: 10_000 })
    await expect(adminPage.getByText('Task to delete')).not.toBeVisible({ timeout: 10_000 })
  })
})
