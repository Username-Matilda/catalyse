import { test, expect, getAlert } from '../fixtures'
import { fake } from '../fake'
import {
  adminSaveProjectDraft,
  volunteerSaveProjectDraft,
  addTaskFromEditPage,
  publishDraftFromEditPage,
  deleteDraftFromEditPage,
} from '../actions/projects'

test.describe('Admin project drafts', () => {
  test('Admin saves a draft with no tasks; it stays hidden until published', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    // Saving a draft lands directly on its edit page.
    const projectId = await adminSaveProjectDraft(baseUrl, adminPage, title)

    // Also shows up in "My Drafts" back on the Org Projects page
    await adminPage.goto(`${baseUrl}/admin/projects/new`)
    await expect(adminPage.getByRole('heading', { name: 'My Drafts' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(adminPage.getByText(title)).toBeVisible()

    // Visiting the project page while it's still a draft redirects to its edit page
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
    await adminPage.waitForURL(`${baseUrl}/projects/${projectId}/edit`, { timeout: 10_000 })

    // Not in the triage queue — drafts never entered the review pipeline
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await expect(adminPage.locator('.card').filter({ hasText: title })).not.toBeVisible({
      timeout: 5_000,
    })

    // Not visible to a volunteer browsing projects
    await volunteer.page.goto(`${baseUrl}/projects`)
    await expect(volunteer.page.getByRole('link', { name: title })).toHaveCount(0)

    // Admin adds a task, then publishes via the edit page — straight live, no review step
    await addTaskFromEditPage(baseUrl, adminPage, projectId, 'Initial task')
    await adminPage.goto(`${baseUrl}/projects/${projectId}/edit`)
    await adminPage.getByRole('button', { name: 'Publish', exact: true }).click()
    const publishModal = adminPage.getByRole('dialog')
    await expect(publishModal.getByRole('heading', { name: 'Publish this project?' })).toBeVisible({
      timeout: 10_000,
    })
    // No mention of a review step — org projects skip it entirely
    await expect(publishModal).not.toContainText('review')
    await expect(publishModal).not.toContainText('team leads')
    await publishModal.getByRole('button', { name: 'Publish', exact: true }).click()

    await expect(getAlert(adminPage)).toContainText('Project published', { timeout: 10_000 })
    await adminPage.waitForURL(`${baseUrl}/projects/${projectId}`, { timeout: 10_000 })
    await expect(adminPage.getByLabel('project status')).toContainText('Ready', {
      timeout: 10_000,
    })

    // Never touched the triage queue
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await expect(adminPage.locator('.card').filter({ hasText: title })).not.toBeVisible({
      timeout: 5_000,
    })

    await volunteer.page.goto(`${baseUrl}/projects`)
    await expect(volunteer.page.getByRole('link', { name: title })).toBeVisible({
      timeout: 10_000,
    })
  })
})

test.describe('Volunteer project drafts', () => {
  test('Volunteer saves a draft, adds a task, and publishes it for review', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    // Saving a draft lands directly on its edit page.
    const projectId = await volunteerSaveProjectDraft(baseUrl, volunteer.page, title)

    // Also shows up in "My Drafts" back on the suggest page
    await volunteer.page.goto(`${baseUrl}/suggest`)
    await expect(volunteer.page.getByRole('heading', { name: 'My Drafts' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(volunteer.page.getByText(title)).toBeVisible()

    // Not visible to admins yet — no proposal notification, not in triage
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await expect(adminPage.locator('.card').filter({ hasText: title })).not.toBeVisible({
      timeout: 5_000,
    })

    // Back to the draft's edit page: add the required task, then publish
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}/edit`)
    await addTaskFromEditPage(baseUrl, volunteer.page, projectId, 'Initial task')
    await publishDraftFromEditPage(baseUrl, volunteer.page, projectId)

    await expect(getAlert(volunteer.page)).toContainText('Draft submitted for review', {
      timeout: 10_000,
    })

    // Now shows up in the admin triage queue like any other proposal
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await expect(adminPage.locator('.card').filter({ hasText: title })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Volunteer edits a task title and details on the draft edit page', async ({
    volunteer,
    baseUrl,
  }) => {
    const projectId = await volunteerSaveProjectDraft(baseUrl, volunteer.page, fake.projectTitle())
    await addTaskFromEditPage(baseUrl, volunteer.page, projectId, 'Original task title')

    await volunteer.page
      .locator('li', { hasText: 'Original task title' })
      .getByRole('button', { name: 'Edit' })
      .click()
    await volunteer.page.getByLabel('Edit task title').fill('Updated task title')
    await volunteer.page.getByLabel('Edit task details (optional)').fill('Updated task details')
    await volunteer.page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(volunteer.page.getByText('Updated task title')).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.getByText('Updated task details')).toBeVisible()
    await expect(volunteer.page.getByText('Original task title')).toHaveCount(0)
  })

  test('Publishing a draft with no tasks is rejected', async ({ volunteer, baseUrl }) => {
    const title = fake.projectTitle()
    const projectId = await volunteerSaveProjectDraft(baseUrl, volunteer.page, title)

    await publishDraftFromEditPage(baseUrl, volunteer.page, projectId)

    await expect(getAlert(volunteer.page)).toContainText(
      'Add at least one task before submitting this draft for review',
      { timeout: 10_000 },
    )
  })

  test('A volunteer is blocked from saving a third draft', async ({ volunteer, baseUrl }) => {
    await volunteerSaveProjectDraft(baseUrl, volunteer.page, fake.projectTitle())
    await volunteerSaveProjectDraft(baseUrl, volunteer.page, fake.projectTitle())

    await volunteer.page.goto(`${baseUrl}/suggest`)
    await volunteer.page.getByLabel('Project Title').fill(fake.projectTitle())
    await volunteer.page.getByRole('button', { name: 'Save as Draft' }).click()

    await expect(getAlert(volunteer.page)).toContainText('You already have 2 drafts', {
      timeout: 10_000,
    })
  })

  test('Volunteer deletes a draft from the edit page', async ({ volunteer, baseUrl }) => {
    const title = fake.projectTitle()
    const projectId = await volunteerSaveProjectDraft(baseUrl, volunteer.page, title)

    await deleteDraftFromEditPage(baseUrl, volunteer.page, projectId)
    await expect(getAlert(volunteer.page)).toContainText('Draft deleted', { timeout: 10_000 })

    await volunteer.page.waitForURL(`${baseUrl}/suggest`, { timeout: 10_000 })
    await expect(volunteer.page.getByText(title)).toHaveCount(0)
  })
})
