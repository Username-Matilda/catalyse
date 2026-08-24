import { test, expect, getAlert } from '../fixtures'
import { fake } from '../fake'
import {
  adminSaveProjectDraft,
  volunteerSaveProjectDraft,
  addTaskFromEditPage,
  publishDraftFromEditPage,
  deleteDraftFromEditPage,
  setProjectStatus,
} from '../actions/projects'

test.describe('Admin project drafts', () => {
  test('Admin saves a draft with no tasks; it stays hidden until published', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const projectId = await adminSaveProjectDraft(baseUrl, adminPage, title)

    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await expect(adminPage.getByLabel('project status')).toContainText('Draft', {
      timeout: 10_000,
    })

    // Not in the triage queue — drafts never entered the review pipeline
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await expect(adminPage.locator('.card').filter({ hasText: title })).not.toBeVisible({
      timeout: 5_000,
    })

    // Not visible to a volunteer browsing projects
    await volunteer.page.goto(`${baseUrl}/projects`)
    await expect(volunteer.page.getByRole('link', { name: title })).toHaveCount(0)

    // Admin adds a task and publishes it live
    await addTaskFromEditPage(baseUrl, adminPage, projectId, 'Initial task')
    await setProjectStatus(baseUrl, adminPage, projectId, 'ready')

    await expect(adminPage.getByLabel('project status')).toContainText('Ready', {
      timeout: 10_000,
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
    const projectId = await volunteerSaveProjectDraft(baseUrl, volunteer.page, title)

    // Shows up in "My Drafts" on the suggest page
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

    // Edit the draft: add the required task, then publish
    await volunteer.page.getByRole('link', { name: 'Edit' }).first().click()
    await volunteer.page.waitForURL(`${baseUrl}/projects/${projectId}/edit`, { timeout: 10_000 })
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
