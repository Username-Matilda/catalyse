import { test, expect, getAlert } from '../fixtures'
import { proposeProject, adminApproveProject, transferProjectOwnership } from '../actions/projects'
import { Page } from '@playwright/test'
import { fake } from '../fake'

// Regression coverage for bug 12 (checkbox-only edit wiping the save) and bug 13 (tasks wiped
// on unrelated project edits). See TODO #141/#143/#144.

async function setupOwnedProject(
  baseUrl: string,
  adminPage: Page,
  volunteer: { page: Page; name: string },
): Promise<number> {
  const title = fake.projectTitle()
  const projectId = await proposeProject(
    baseUrl,
    volunteer.page,
    title,
    'Setup description for edit regression tests',
  )
  await adminApproveProject(baseUrl, adminPage, title)
  await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)
  return projectId
}

test.describe('Project Edit Regressions', () => {
  test('Toggling only the seeking-help checkbox persists on reload (bug 12)', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const projectId = await setupOwnedProject(baseUrl, adminPage, volunteer)

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}/edit`)
    await expect(volunteer.page.getByRole('heading', { name: 'Edit Project' })).toBeVisible({
      timeout: 10_000,
    })

    const checkbox = volunteer.page.getByLabel('Help / contributors')
    const wasChecked = await checkbox.isChecked()

    // The visible box is a decorative sibling of the sr-only input, so a plain click on
    // the input is reported as intercepted even though the label's native click still works.
    // Fields autosave on change now, so there's no separate save step.
    await Promise.all([
      volunteer.page.waitForResponse((resp) => resp.url().includes('/api/rpc/projects/update')),
      checkbox.click({ force: true }),
    ])
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)

    const badge = volunteer.page.getByText('Seeking Help')
    if (wasChecked) {
      await expect(badge).toBeHidden({ timeout: 10_000 })
    } else {
      await expect(badge).toBeVisible({ timeout: 10_000 })
    }

    // Reload to rule out stale client state masking a save that didn't actually persist.
    await volunteer.page.reload()
    if (wasChecked) {
      await expect(badge).toBeHidden({ timeout: 10_000 })
    } else {
      await expect(badge).toBeVisible({ timeout: 10_000 })
    }
  })

  test('Tasks survive an unrelated project field edit (bug 13)', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const projectId = await setupOwnedProject(baseUrl, adminPage, volunteer)
    const taskTitle = `regression task ${Date.now()}`

    // Add a task on the project detail page.
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByRole('button', { name: 'Add Task' }).click()
    await volunteer.page.getByLabel('Task title').fill(taskTitle)
    await volunteer.page.getByRole('button', { name: 'Create Task' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Task added!', { timeout: 10_000 })
    await expect(volunteer.page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })

    // Edit and save an unrelated project field.
    const newDescription = 'Updated description that should not touch the task list'
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}/edit`)
    await expect(volunteer.page.getByRole('heading', { name: 'Edit Project' })).toBeVisible({
      timeout: 10_000,
    })
    const descriptionField = volunteer.page.getByLabel('Description')
    await descriptionField.fill(newDescription)
    await Promise.all([
      volunteer.page.waitForResponse((resp) => resp.url().includes('/api/rpc/projects/update')),
      descriptionField.blur(),
    ])
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)

    // Task must still be there, both immediately and after a reload.
    await expect(volunteer.page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })
    await volunteer.page.reload()
    await expect(volunteer.page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })
  })
})
