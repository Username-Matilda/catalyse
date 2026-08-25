import { test, expect, getAlert, readAdminToken, createApprovedVolunteer } from '../fixtures'
import type { Page } from '@playwright/test'
import { createSkillViaApi } from '../actions/skills'
import type { SkillInfo } from '../actions/skills'
import { goToDashboardNotifications } from '../actions/dashboard'
import { fake } from '../fake'
import { selectFilterDropdown } from '../actions/ui'
import { createApiClient } from '../client'

// API-equivalent of driving the create-quick-task dialog, for tests that need "an open quick
// task exists" purely as setup for testing claim/assign/complete/comment flows — the
// create-dialog UI flow itself is already proven end-to-end by "Admin creates a quick task"
// below.
async function createOpenQuickTaskViaApi(baseUrl: string, skill: SkillInfo): Promise<string> {
  const taskTitle = fake.quickTaskTitle()
  const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))
  const result = await adminApi.quickTasks.create({
    body: {
      title: taskTitle,
      description: 'E2E test task description',
      skillId: skill.id,
      estimatedHours: 2,
    },
  })
  if (result.status !== 200)
    throw new Error(`Quick task creation failed: ${JSON.stringify(result.body)}`)
  return taskTitle
}

async function assignQuickTask(
  baseUrl: string,
  adminPage: Page,
  taskTitle: string,
  volunteerName: string,
): Promise<void> {
  await adminPage.goto(`${baseUrl}/quick-tasks`)
  await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
    timeout: 10_000,
  })

  const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
  await expect(taskCard).toBeVisible({ timeout: 10_000 })
  await taskCard.getByText(taskTitle, { exact: true }).click()
  await selectFilterDropdown(adminPage, `Assign volunteer to ${taskTitle}`, volunteerName, taskCard)
  await taskCard.getByRole('button', { name: 'Assign', exact: true }).click()
  await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 })
}

async function submitQuickTask(
  baseUrl: string,
  volunteerPage: Page,
  taskTitle: string,
): Promise<void> {
  await volunteerPage.goto(`${baseUrl}/dashboard`)
  await expect(volunteerPage.getByRole('heading', { name: /Welcome back/ })).toBeVisible({
    timeout: 10_000,
  })

  const banner = volunteerPage.getByRole('region', { name: 'Quick Tasks' })
  const taskCard = banner.getByRole('article').filter({ hasText: taskTitle })
  await expect(taskCard).toBeVisible({ timeout: 10_000 })
  await taskCard.getByText(taskTitle, { exact: true }).click()
  await expect(taskCard.getByRole('button', { name: 'Mark as Complete' })).toBeVisible({
    timeout: 10_000,
  })
  await taskCard.getByRole('button', { name: 'Mark as Complete' }).click()
  await expect(getAlert(volunteerPage)).toContainText('Task submitted for review!', {
    timeout: 10_000,
  })
}

test.describe('Quick Tasks (admin)', () => {
  test('Admin creates a quick task', async ({ adminPage, baseUrl }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = fake.quickTaskTitle()

    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })

    await adminPage.getByRole('button', { name: 'Create Task' }).click()
    const createDialog = adminPage.getByRole('dialog', { name: 'Create Quick Task' })
    await expect(createDialog).toBeVisible({ timeout: 10_000 })

    await createDialog.getByLabel('Title').fill(taskTitle)
    await createDialog.getByLabel('Description').fill('E2E test task description')
    await selectFilterDropdown(adminPage, 'Skill Being Tested', skill.optionLabel, createDialog)
    await createDialog.getByLabel('Estimated Hours').fill('2')
    await createDialog.getByRole('button', { name: 'Create Task' }).click()

    await expect(getAlert(adminPage)).toContainText('Task created!', { timeout: 10_000 })

    // Task appears in the list with status 'open'
    const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await expect(taskCard.getByRole('status')).toContainText('open')
  })

  test('Admin assigns a quick task to a volunteer; task status becomes assigned and volunteer receives a notification', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)

    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })

    // Expand the card to reveal the inline assign dropdown
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

    // Volunteer receives an assignment notification
    await goToDashboardNotifications(baseUrl, volunteer.page)
    await expect(
      volunteer.page.locator('strong').filter({ hasText: "You've been assigned a Quick Task" }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Admin posts a comment on a quick task and it appears in the thread', async ({
    adminPage,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)
    const commentText = `comment ${Date.now()}`

    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })

    const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await taskCard.getByText(taskTitle, { exact: true }).click()

    await taskCard.getByLabel('Add a comment').fill(commentText)
    await taskCard.getByRole('button', { name: 'Post Comment' }).click()

    await expect(taskCard.getByText(commentText)).toBeVisible({ timeout: 10_000 })
  })

  test('Admin and assignee exchange comments on a quick task in a back-and-forth thread', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)
    await assignQuickTask(baseUrl, adminPage, taskTitle, volunteer.name)
    const adminComment = `admin note ${Date.now()}`
    const volunteerReply = `volunteer reply ${Date.now()}`

    // Admin expands the task and posts the first comment
    await adminPage.goto(`${baseUrl}/quick-tasks`)
    const adminCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(adminCard).toBeVisible({ timeout: 10_000 })
    await adminCard.getByText(taskTitle, { exact: true }).click()
    await adminCard.getByLabel('Add a comment').fill(adminComment)
    await adminCard.getByRole('button', { name: 'Post Comment' }).click()
    await expect(adminCard.getByText(adminComment)).toBeVisible({ timeout: 10_000 })

    // Assignee sees admin's comment on the dashboard and replies
    await volunteer.page.goto(`${baseUrl}/dashboard`)
    const volBanner = volunteer.page.getByRole('region', { name: 'Quick Tasks' })
    const volCard = volBanner.getByRole('article').filter({ hasText: taskTitle })
    await expect(volCard).toBeVisible({ timeout: 10_000 })
    await volCard.getByText(taskTitle, { exact: true }).click()
    await expect(volCard.getByText(adminComment)).toBeVisible({ timeout: 10_000 })
    await volCard.getByLabel('Add a comment').fill(volunteerReply)
    await volCard.getByRole('button', { name: 'Post Comment' }).click()
    await expect(volCard.getByText(volunteerReply)).toBeVisible({ timeout: 10_000 })

    // Admin reloads and sees both messages in the thread
    await adminPage.goto(`${baseUrl}/quick-tasks`)
    const refreshedCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(refreshedCard).toBeVisible({ timeout: 10_000 })
    await refreshedCard.getByText(taskTitle, { exact: true }).click()
    await expect(refreshedCard.getByText(adminComment)).toBeVisible({ timeout: 10_000 })
    await expect(refreshedCard.getByText(volunteerReply)).toBeVisible({ timeout: 10_000 })
  })

  test('Volunteer views their assigned quick task on the dashboard', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)
    await assignQuickTask(baseUrl, adminPage, taskTitle, volunteer.name)

    await volunteer.page.goto(`${baseUrl}/dashboard`)
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({
      timeout: 10_000,
    })

    // Quick task banner shows the assigned task with its details
    const banner = volunteer.page.getByRole('region', { name: 'Quick Tasks' })
    const taskCard = banner.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await expect(taskCard.getByRole('status')).toContainText('In Progress')
  })

  test('Volunteer submits a completed quick task; task status becomes submitted and admin receives a notification', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)
    await assignQuickTask(baseUrl, adminPage, taskTitle, volunteer.name)

    // Volunteer expands the task card and submits it
    await volunteer.page.goto(`${baseUrl}/dashboard`)
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({
      timeout: 10_000,
    })

    const banner = volunteer.page.getByRole('region', { name: 'Quick Tasks' })
    const taskCard = banner.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await taskCard.getByText(taskTitle, { exact: true }).click()
    await expect(taskCard.getByRole('button', { name: 'Mark as Complete' })).toBeVisible({
      timeout: 10_000,
    })
    await taskCard.getByRole('button', { name: 'Mark as Complete' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Task submitted for review!', {
      timeout: 10_000,
    })

    // Task status changes to 'under_review' on the admin page
    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })
    const adminTaskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(adminTaskCard.getByRole('status')).toContainText('under_review', {
      timeout: 10_000,
    })

    // Admin receives a notification (admins are also volunteers and can view their dashboard)
    await goToDashboardNotifications(baseUrl, adminPage)
    await expect(
      adminPage.locator('strong').filter({ hasText: `${volunteer.name} submitted:` }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Admin reviews a quick task as excellent; task becomes completed and a skill endorsement is auto-created for the volunteer', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)
    await assignQuickTask(baseUrl, adminPage, taskTitle, volunteer.name)
    await submitQuickTask(baseUrl, volunteer.page, taskTitle)

    // Admin opens the review modal
    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })

    const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await taskCard.getByText(taskTitle, { exact: true }).click()
    await expect(taskCard.getByRole('button', { name: 'Review' })).toBeVisible({ timeout: 10_000 })
    await taskCard.getByRole('button', { name: 'Review' }).click()

    const reviewDialog = adminPage.getByRole('dialog', { name: 'Review Task' })
    await expect(reviewDialog).toBeVisible({ timeout: 10_000 })
    await reviewDialog.getByRole('radio', { name: /Excellent/ }).click()
    await reviewDialog.getByLabel("Feedback to Volunteer (they'll see this)").fill('Great work!')
    await reviewDialog.getByRole('button', { name: 'Submit Review' }).click()

    await expect(getAlert(adminPage)).toContainText('Task reviewed!', { timeout: 10_000 })

    // Task status becomes 'completed'
    await expect(taskCard.getByRole('status')).toContainText('completed', { timeout: 10_000 })

    // Volunteer receives a feedback notification
    await goToDashboardNotifications(baseUrl, volunteer.page)
    await expect(
      volunteer.page.locator('strong').filter({ hasText: 'Your Quick Task was reviewed' }),
    ).toBeVisible({ timeout: 10_000 })

    // Skill endorsement is auto-created; navigate to admin volunteer detail via the task card link
    await taskCard.getByRole('link', { name: volunteer.name }).click()
    await expect(
      adminPage.getByRole('heading', { name: 'Verified Skills (Endorsed)', level: 3 }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(adminPage.locator('#endorsements')).toContainText(skill.name, { timeout: 10_000 })
  })

  test('Admin reviews a quick task as needs_improvement; task becomes completed and no skill endorsement is created', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)
    await assignQuickTask(baseUrl, adminPage, taskTitle, volunteer.name)
    await submitQuickTask(baseUrl, volunteer.page, taskTitle)

    // Admin opens the review modal
    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })

    const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await taskCard.getByText(taskTitle, { exact: true }).click()
    await expect(taskCard.getByRole('button', { name: 'Review' })).toBeVisible({ timeout: 10_000 })
    await taskCard.getByRole('button', { name: 'Review' }).click()

    const reviewDialog = adminPage.getByRole('dialog', { name: 'Review Task' })
    await expect(reviewDialog).toBeVisible({ timeout: 10_000 })
    await reviewDialog.getByRole('radio', { name: /Needs improvement/ }).click()
    await reviewDialog
      .getByLabel("Feedback to Volunteer (they'll see this)")
      .fill('Please try again.')
    await reviewDialog.getByRole('button', { name: 'Submit Review' }).click()

    await expect(getAlert(adminPage)).toContainText('Task reviewed!', { timeout: 10_000 })

    // Task status becomes 'completed'
    await expect(taskCard.getByRole('status')).toContainText('completed', { timeout: 10_000 })

    // Volunteer receives a feedback notification
    await goToDashboardNotifications(baseUrl, volunteer.page)
    await expect(
      volunteer.page.locator('strong').filter({ hasText: 'Your Quick Task was reviewed' }),
    ).toBeVisible({ timeout: 10_000 })

    // No skill endorsement created; navigate to admin volunteer detail to confirm
    await taskCard.getByRole('link', { name: volunteer.name }).click()
    await expect(
      adminPage.getByRole('heading', { name: 'Verified Skills (Endorsed)', level: 3 }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(adminPage.locator('#endorsements')).not.toContainText(skill.name, {
      timeout: 10_000,
    })
  })

  test('Admin deletes a quick task; task disappears from the list', async ({
    adminPage,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)

    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })

    const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    await taskCard.getByText(taskTitle, { exact: true }).click()
    await expect(taskCard.getByRole('button', { name: 'Delete' })).toBeVisible({ timeout: 10_000 })

    adminPage.once('dialog', (dialog) => dialog.accept())
    await taskCard.getByRole('button', { name: 'Delete' }).click()

    await expect(getAlert(adminPage)).toContainText('Task deleted', { timeout: 10_000 })
    await expect(taskCard).not.toBeVisible({ timeout: 10_000 })
  })

  test('Deep-linking to ?id= auto-expands the matching task card', async ({
    adminPage,
    baseUrl,
  }) => {
    const skill = await createSkillViaApi(baseUrl)
    const taskTitle = await createOpenQuickTaskViaApi(baseUrl, skill)

    await adminPage.goto(`${baseUrl}/quick-tasks`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })

    // Get the task ID from the card's DOM id attribute (card has id="task-N")
    const taskCard = adminPage.getByRole('article').filter({ hasText: taskTitle })
    await expect(taskCard).toBeVisible({ timeout: 10_000 })
    const cardId = await taskCard.getAttribute('id')
    const taskId = parseInt(cardId!.replace('task-', ''), 10)

    // Navigate directly to the deep-link — card should be expanded without clicking
    await adminPage.goto(`${baseUrl}/quick-tasks#task-${taskId}`)
    await expect(adminPage.getByRole('heading', { name: 'Quick Tasks', level: 1 })).toBeVisible({
      timeout: 10_000,
    })
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })

    const deepLinkCard = adminPage.locator(`#task-${taskId}`)
    await expect(deepLinkCard).toBeVisible({ timeout: 10_000 })
    // Card is expanded — action buttons are visible without clicking the header
    await expect(deepLinkCard.getByRole('button', { name: 'Edit' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Quick task comments are hidden from non-assignee volunteers once claimed', async ({
    baseUrl,
  }) => {
    const adminToken = readAdminToken(baseUrl)
    expect(adminToken).toBeTruthy()
    const adminApi = createApiClient(baseUrl, adminToken)

    // Admin creates a quick task and assigns it to a specific volunteer
    const created = await adminApi.quickTasks.create({
      body: { title: `Iso task ${Date.now()}`, description: 'isolation test description' },
    })
    expect(created.status).toBe(200)
    const workItemId = (created.body as { id: number }).id

    const assignee = await createApprovedVolunteer(baseUrl)
    const assignResult = await adminApi.quickTasks.assign({
      body: { id: workItemId, volunteerId: assignee.id },
    })
    expect(assignResult.status).toBe(200)

    const commentText = `admin-only ${Date.now()}`
    const added = await adminApi.workItemComments.add({
      body: { workItemId, content: commentText },
    })
    expect(added.status).toBe(200)

    // Admin can read the thread
    const adminList = await adminApi.workItemComments.list({ body: { workItemId } })
    expect(adminList.status).toBe(200)
    expect(
      (adminList.body as { comments: { content: string }[] }).comments.some(
        (c) => c.content === commentText,
      ),
    ).toBe(true)

    // A fresh, approved volunteer who is not the assignee
    const outsider = await createApprovedVolunteer(baseUrl)
    const volApi = createApiClient(baseUrl, outsider.token)

    // Cannot read the thread (work item not visible) or post to it
    const volList = await volApi.workItemComments.list({ body: { workItemId } })
    expect(volList.status).toBe(404)
    const volAdd = await volApi.workItemComments.add({
      body: { workItemId, content: 'should be rejected' },
    })
    expect(volAdd.status).toBe(403)
  })

  test('An open, unclaimed quick task is visible to any approved volunteer', async ({
    baseUrl,
  }) => {
    const adminToken = readAdminToken(baseUrl)
    expect(adminToken).toBeTruthy()
    const adminApi = createApiClient(baseUrl, adminToken)

    const created = await adminApi.quickTasks.create({
      body: { title: `Open task ${Date.now()}`, description: 'open browse test' },
    })
    expect(created.status).toBe(200)
    const workItemId = (created.body as { id: number }).id

    const outsider = await createApprovedVolunteer(baseUrl)
    const volApi = createApiClient(baseUrl, outsider.token)

    const result = await volApi.quickTasks.get({ body: { id: workItemId } })
    expect(result.status).toBe(200)

    const available = await volApi.quickTasks.available()
    expect(available.status).toBe(200)
    expect(
      (available.body as { kind: string; id: number }[]).some(
        (t) => t.kind === 'quick' && t.id === workItemId,
      ),
    ).toBe(true)
  })
})
