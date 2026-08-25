import { Page, expect } from '@playwright/test'
import { getAlert } from '../fixtures'
import { selectFilterDropdown } from './ui'

import { PROJECT_STATUS_LABELS } from '../../lib/project-status'

const OUTCOME_LABELS: Record<string, string> = {
  successful: 'Successful',
  partial: 'Partial',
  not_completed: 'Not Completed',
  ongoing: 'Ongoing',
}

// The new-project form is tucked behind a "New Project" button once the volunteer/admin
// already has drafts — click through it if present, otherwise the form is already showing
// (either shown directly, or reached via an automatic redirect for a volunteer with no
// drafts yet). The drafts query is still loading when the page first renders, so neither
// is visible yet — wait for whichever one lands rather than checking immediately.
export async function openNewProjectForm(page: Page): Promise<void> {
  // The Button component renders as a link (not a button element) when given an href, so
  // match either role rather than assuming which one it picked.
  const newProjectButton = page
    .getByRole('link', { name: 'New Project' })
    .or(page.getByRole('button', { name: 'New Project' }))
  const titleField = page.getByLabel('Project Title')
  await Promise.race([
    newProjectButton.first().waitFor({ state: 'visible', timeout: 10_000 }),
    titleField.waitFor({ state: 'visible', timeout: 10_000 }),
  ]).catch(() => {})

  if (
    await newProjectButton
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await newProjectButton.first().click()
  }
  await expect(titleField).toBeVisible({ timeout: 10_000 })
}

export async function proposeProject(
  baseUrl: string,
  page: Page,
  title: string,
  description: string,
  skillName?: string,
): Promise<number> {
  await page.goto(`${baseUrl}/suggest`)
  await openNewProjectForm(page)

  await page.getByLabel('Project Title').fill(title)
  await page.getByLabel('Description').fill(description)
  if (skillName) {
    await page
      .locator('label.skill-option')
      .filter({ hasText: new RegExp(`^\\s*${skillName}\\s*$`) })
      .click()
  }
  // A project has no tasks yet, so the add-task form is the only task input on the page.
  await page.locator('#new-task-title').fill('Initial task')

  // Adding the first task lazily creates the draft project it needs a parent id for.
  const [response] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/rpc/projects/create')),
    page.getByRole('button', { name: 'Add Task' }).click(),
  ])
  if (!response.ok()) throw new Error(`Project creation failed: ${await response.text()}`)
  const { id } = (await response.json()).json as { id: number }

  await page.waitForURL(`${baseUrl}/projects/${id}/edit`, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Submit draft for review?' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Submit for Review' }).click()
  await page.waitForURL(`${baseUrl}/dashboard**`, { timeout: 15_000 })
  return id
}

export async function adminCreateProject(
  baseUrl: string,
  adminPage: Page,
  title: string,
  description: string,
): Promise<number> {
  await adminPage.goto(`${baseUrl}/admin/projects/new`)
  await openNewProjectForm(adminPage)

  await adminPage.getByLabel('Project Title').fill(title)
  await adminPage.getByLabel('Description').fill(description)
  await adminPage.locator('#new-task-title').fill('Initial task')

  const [response] = await Promise.all([
    adminPage.waitForResponse((resp) => resp.url().includes('/api/rpc/admin/projects/create')),
    adminPage.getByRole('button', { name: 'Add Task' }).click(),
  ])
  if (!response.ok()) throw new Error(`Project creation failed: ${await response.text()}`)
  const { id } = (await response.json()).json as { id: number }

  await adminPage.waitForURL(`${baseUrl}/projects/${id}/edit`, { timeout: 15_000 })
  await adminPage.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(adminPage.getByRole('heading', { name: 'Publish this project?' })).toBeVisible({
    timeout: 10_000,
  })
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click()

  await adminPage.waitForURL(`${baseUrl}/projects/${id}`, { timeout: 15_000 })
  // Wait for project content to render — this ensures auth has completed before we return,
  // so callers don't interrupt the in-flight /api/auth/me fetch and accidentally clear the token.
  await expect(adminPage.locator('#projectContent')).toBeVisible({ timeout: 10_000 })
  return id
}

export async function adminSaveProjectDraft(
  baseUrl: string,
  adminPage: Page,
  title: string,
): Promise<number> {
  await adminPage.goto(`${baseUrl}/admin/projects/new`)
  await openNewProjectForm(adminPage)

  await adminPage.getByLabel('Project Title').fill(title)

  const [response] = await Promise.all([
    adminPage.waitForResponse((resp) => resp.url().includes('/api/rpc/admin/projects/create')),
    adminPage.getByRole('button', { name: 'Save draft' }).click(),
  ])
  if (!response.ok()) throw new Error(`Draft save failed: ${await response.text()}`)
  const { id } = (await response.json()).json as { id: number }
  await adminPage.waitForURL(`${baseUrl}/projects/${id}/edit`, { timeout: 15_000 })
  return id
}

export async function volunteerSaveProjectDraft(
  baseUrl: string,
  page: Page,
  title: string,
): Promise<number> {
  await page.goto(`${baseUrl}/suggest`)
  await openNewProjectForm(page)

  await page.getByLabel('Project Title').fill(title)

  const [response] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/rpc/projects/create')),
    page.getByRole('button', { name: 'Save draft' }).click(),
  ])
  if (!response.ok()) throw new Error(`Draft save failed: ${await response.text()}`)
  const { id } = (await response.json()).json as { id: number }
  await page.waitForURL(`${baseUrl}/projects/${id}/edit`, { timeout: 15_000 })
  return id
}

export async function addTaskFromEditPage(
  baseUrl: string,
  page: Page,
  projectId: number,
  taskTitle: string,
): Promise<void> {
  if (!page.url().includes(`/projects/${projectId}/edit`)) {
    await page.goto(`${baseUrl}/projects/${projectId}/edit`)
  }
  await expect(page.getByRole('heading', { name: 'Edit Project' })).toBeVisible({
    timeout: 10_000,
  })
  // Existing tasks are also labeled "Task title" — target the add-task form's stable id.
  await page.locator('#new-task-title').fill(taskTitle)
  await page.getByRole('button', { name: 'Add Task' }).click()
  // Existing tasks render as editable inputs, so the title is a value, not a text node.
  await expect(page.locator(`input[value="${taskTitle}"]`)).toBeVisible({ timeout: 10_000 })
}

// For a volunteer's own draft: submits it into the review queue.
export async function publishDraftFromEditPage(
  baseUrl: string,
  page: Page,
  projectId: number,
): Promise<void> {
  if (!page.url().includes(`/projects/${projectId}/edit`)) {
    await page.goto(`${baseUrl}/projects/${projectId}/edit`)
  }
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Submit draft for review?' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Submit for Review' }).click()
}

// For an org-proposed draft: publishes it live, skipping review entirely.
export async function publishOrgDraftFromEditPage(
  baseUrl: string,
  page: Page,
  projectId: number,
): Promise<void> {
  if (!page.url().includes(`/projects/${projectId}/edit`)) {
    await page.goto(`${baseUrl}/projects/${projectId}/edit`)
  }
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Publish this project?' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click()
}

export async function deleteDraftFromEditPage(
  baseUrl: string,
  page: Page,
  projectId: number,
): Promise<void> {
  if (!page.url().includes(`/projects/${projectId}/edit`)) {
    await page.goto(`${baseUrl}/projects/${projectId}/edit`)
  }
  await page.getByRole('button', { name: 'Delete Draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Delete this draft?' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Draft' }).click()
}

export async function adminApproveProject(
  baseUrl: string,
  adminPage: Page,
  projectTitle: string,
): Promise<void> {
  await adminPage.goto(`${baseUrl}/admin/triage`)

  const projectCard = adminPage.locator('.card').filter({ hasText: projectTitle })
  await expect(projectCard).toBeVisible({ timeout: 10_000 })
  await projectCard.getByRole('link', { name: 'Review' }).click()

  await expect(adminPage.getByRole('heading', { level: 2, name: 'Review Project' })).toBeVisible({
    timeout: 10_000,
  })
  await adminPage.getByRole('button', { name: 'Submit Review' }).click()

  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Review Project' }),
  ).not.toBeVisible({ timeout: 10_000 })
}

export async function adminRecordOutcome(
  baseUrl: string,
  adminPage: Page,
  projectId: number,
  outcome: string,
  notes: string,
): Promise<void> {
  await adminPage.goto(`${baseUrl}/projects/${projectId}`)
  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Record Project Outcome' }),
  ).toBeVisible({ timeout: 10_000 })

  await selectFilterDropdown(adminPage, 'Outcome', OUTCOME_LABELS[outcome] ?? outcome)
  await adminPage.getByLabel('Outcome Notes').fill(notes)
  await adminPage.getByRole('button', { name: 'Record Outcome' }).click()
  await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 })
}

export async function transferProjectOwnership(
  baseUrl: string,
  adminPage: Page,
  projectId: number,
  volunteerName: string,
): Promise<void> {
  // Avoid reloading if already on the project page — a reload re-triggers auth
  // checks that can flakily redirect to login under parallel test load.
  if (!adminPage.url().includes(`/projects/${projectId}`)) {
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
  }
  await adminPage.getByRole('button', { name: 'Ownership actions' }).click()
  await expect(
    adminPage.getByRole('heading', { level: 3, name: 'Transfer Ownership' }),
  ).toBeVisible({ timeout: 10_000 })
  await selectFilterDropdown(adminPage, 'Transfer to', volunteerName)
  adminPage.once('dialog', (dialog) => dialog.accept())
  await adminPage.getByRole('menu').getByRole('button', { name: 'Transfer', exact: true }).click()
  await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 })
}

export async function removeProjectOwner(
  baseUrl: string,
  adminPage: Page,
  projectId: number,
): Promise<void> {
  if (!adminPage.url().includes(`/projects/${projectId}`)) {
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
  }
  await adminPage.getByRole('button', { name: 'Ownership actions' }).click()
  adminPage.once('dialog', (dialog) => dialog.accept())
  await adminPage.getByRole('menuitem', { name: 'Remove ownership' }).click()
  await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 })
}

export async function setProjectStatus(
  baseUrl: string,
  page: Page,
  projectId: number,
  status: string,
): Promise<void> {
  await page.goto(`${baseUrl}/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Status', exact: true })).toBeVisible({
    timeout: 10_000,
  })

  await selectFilterDropdown(page, 'project status', PROJECT_STATUS_LABELS[status] ?? status)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(getAlert(page)).toBeVisible({ timeout: 10_000 })
}
