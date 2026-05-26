import { test, expect, getAlert } from '../fixtures'
import { goToDashboardNotifications } from '../actions/dashboard'
import { fake } from '../fake'
import {
  proposeProject,
  adminApproveProject,
  adminCreateProject,
  transferProjectOwnership,
} from '../actions/projects'
import { Page } from '@playwright/test'
import { selectFilterDropdown } from '../actions/ui'

// Creates an org project that immediately accepts interest (is_seeking_help = true by default)
async function setupSeekingProject(baseUrl: string, adminPage: Page): Promise<number> {
  return adminCreateProject(baseUrl, adminPage, fake.projectTitle(), 'Project seeking volunteers')
}

test.describe('Project Interests and Assignment', () => {
  test('Volunteer expresses interest to contribute', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

    // want_to_contribute is selected by default; submit directly
    await expect(volunteer.page.getByRole('radio', { name: /I want to help out/ })).toBeChecked({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click()

    await expect(getAlert(volunteer.page)).toContainText('Interest expressed!', { timeout: 10_000 })
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).not.toBeVisible({
      timeout: 10_000,
    })
    await expect(volunteer.page.getByLabel('interest status')).toContainText('pending', {
      timeout: 10_000,
    })
  })

  test('Volunteer expresses interest to own / lead', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

    await volunteer.page.getByRole('radio', { name: /I want to own/ }).click()
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click()

    await expect(getAlert(volunteer.page)).toContainText('Interest expressed!', { timeout: 10_000 })
    await expect(volunteer.page.getByLabel('interest status')).toContainText('pending', {
      timeout: 10_000,
    })
  })

  test('Project owner accepts a pending interest; volunteer receives a notification', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)

    // Volunteer expresses interest
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Interest expressed!', { timeout: 10_000 })

    // Admin (managing the project) accepts the interest
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    const interestCard = adminPage.locator('.interest-card').filter({ hasText: volunteer.name })
    await expect(interestCard).toBeVisible({ timeout: 10_000 })
    await interestCard.getByRole('button', { name: 'Accept' }).click()
    await expect(getAlert(adminPage)).toContainText('Interest accepted', { timeout: 10_000 })

    // Interest status updates to accepted
    await expect(
      adminPage.locator('.interest-card').filter({ hasText: volunteer.name }),
    ).toContainText('accepted', { timeout: 10_000 })

    // Volunteer receives a notification
    await goToDashboardNotifications(baseUrl, volunteer.page)
    await expect(volunteer.page.locator('strong').filter({ hasText: 'was accepted' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Project owner declines a pending interest', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)
    const declineMessage = fake.feedbackText()

    // Volunteer expresses interest
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Interest expressed!', { timeout: 10_000 })

    // Admin declines with a response message via browser prompt
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    const interestCard = adminPage.locator('.interest-card').filter({ hasText: volunteer.name })
    await expect(interestCard).toBeVisible({ timeout: 10_000 })
    // Admin declines with a response message via browser prompt
    adminPage.once('dialog', (dialog) => dialog.accept(declineMessage))
    await interestCard.getByRole('button', { name: 'Decline' }).click()
    await expect(getAlert(adminPage)).toContainText('Interest declined', { timeout: 10_000 })

    // Interest status updates to declined
    await expect(
      adminPage.locator('.interest-card').filter({ hasText: volunteer.name }),
    ).toContainText('declined', { timeout: 10_000 })
  })

  test('Volunteer withdraws their pending interest', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)

    // Express interest first
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Interest expressed!', { timeout: 10_000 })
    await expect(volunteer.page.getByRole('button', { name: 'Withdraw Interest' })).toBeVisible({
      timeout: 10_000,
    })

    volunteer.page.once('dialog', (dialog) => dialog.accept())
    await volunteer.page.getByRole('button', { name: 'Withdraw Interest' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Interest withdrawn', { timeout: 10_000 })

    // Interest form reappears
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Admin directly assigns a volunteer to a project', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)

    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
    await expect(adminPage.getByRole('heading', { name: 'Interested Volunteers' })).toBeVisible({
      timeout: 10_000,
    })
    await selectFilterDropdown(adminPage, 'Volunteer to assign', volunteer.name)
    await adminPage.getByRole('button', { name: 'Assign', exact: true }).click()
    await expect(getAlert(adminPage)).toContainText('Volunteer assigned!', { timeout: 10_000 })

    // Volunteer's interest record appears as accepted
    await expect(
      adminPage.locator('.interest-card').filter({ hasText: volunteer.name }),
    ).toContainText('accepted', { timeout: 10_000 })

    // Volunteer receives an assignment notification
    await goToDashboardNotifications(baseUrl, volunteer.page)
    await expect(
      volunteer.page.locator('strong').filter({ hasText: "You've been assigned to" }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Non-participant can read a project comment thread but cannot post', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)
    const commentText = `admin note ${Date.now()}`

    // Admin posts a comment on the project
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await adminPage.getByLabel('Add a comment').fill(commentText)
    await adminPage.getByRole('button', { name: 'Post Comment' }).click()
    await expect(adminPage.getByText(commentText)).toBeVisible({ timeout: 10_000 })

    // A non-participant volunteer can read the thread but has no post form
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.getByText(commentText)).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.getByLabel('Add a comment')).not.toBeVisible({ timeout: 5_000 })
    await expect(volunteer.page.getByRole('button', { name: 'Post Comment' })).not.toBeVisible({
      timeout: 5_000,
    })
  })

  test('Accepted helper can post in the project comment thread', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const projectId = await setupSeekingProject(baseUrl, adminPage)

    // Volunteer expresses interest to contribute
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Interest expressed!', { timeout: 10_000 })

    // Admin accepts the interest, making the volunteer a participant
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
    const interestCard = adminPage.locator('.interest-card').filter({ hasText: volunteer.name })
    await expect(interestCard).toBeVisible({ timeout: 10_000 })
    await interestCard.getByRole('button', { name: 'Accept' }).click()
    await expect(getAlert(adminPage)).toContainText('Interest accepted', { timeout: 10_000 })

    // The accepted helper can now post a comment
    const commentText = `helper comment ${Date.now()}`
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByLabel('Add a comment')).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByLabel('Add a comment').fill(commentText)
    await volunteer.page.getByRole('button', { name: 'Post Comment' }).click()
    await expect(volunteer.page.getByText(commentText)).toBeVisible({ timeout: 10_000 })
  })

  test('Posting a comment notifies other participants but not the author', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const projectId = await adminCreateProject(baseUrl, adminPage, title, 'Notify-on-comment test')
    // Admin is the creator; make the volunteer the owner (assignee)
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)

    // Owner (volunteer) posts a comment
    const commentText = `owner update ${Date.now()}`
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByLabel('Add a comment')).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByLabel('Add a comment').fill(commentText)
    await volunteer.page.getByRole('button', { name: 'Post Comment' }).click()
    await expect(volunteer.page.getByText(commentText)).toBeVisible({ timeout: 10_000 })

    // Admin (the project creator) receives a comment notification
    await goToDashboardNotifications(baseUrl, adminPage)
    await expect(
      adminPage.locator('strong').filter({ hasText: `New comment on "${title}"` }),
    ).toBeVisible({
      timeout: 10_000,
    })

    // The author (volunteer) is NOT notified of their own comment
    await goToDashboardNotifications(baseUrl, volunteer.page)
    await expect(
      volunteer.page.locator('strong').filter({ hasText: `New comment on "${title}"` }),
    ).not.toBeVisible({ timeout: 5_000 })
  })

  test('Volunteer cannot express interest in their own project', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const projectId = await proposeProject(
      baseUrl,
      volunteer.page,
      title,
      'Project owned by the volunteer',
    )
    await adminApproveProject(baseUrl, adminPage, title)
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

    // Interest form is hidden for the project owner
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).not.toBeVisible({
      timeout: 5_000,
    })
    await expect(
      volunteer.page.getByRole('heading', { name: 'Interested in this project?' }),
    ).not.toBeVisible({ timeout: 5_000 })
  })
})
