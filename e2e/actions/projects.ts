import { Page, expect } from '@playwright/test';

export async function proposeProject(baseUrl: string, page: Page, title: string, description: string, skillName?: string): Promise<number> {
  await page.goto(`${baseUrl}/static/suggest.html`);
  await expect(page.getByRole('button', { name: 'Submit Project Proposal' })).toBeVisible({ timeout: 10_000 });

  await page.getByLabel('Project Title').fill(title);
  await page.getByLabel('Description').fill(description);
  if (skillName) {
    await page.locator('label.skill-option').filter({ hasText: new RegExp(`^\\s*${skillName}\\s*$`) }).click();
  }
  await page.getByLabel('Task title').first().fill('Initial task');

  // Ideally we'd extract the project ID from the dashboard UI after redirect, but that
  // races against the async render. Intercepting the API response is more reliable for now.
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/projects') && resp.request().method() === 'POST'),
    page.getByRole('button', { name: 'Submit Project Proposal' }).click(),
  ]);
  if (!response.ok()) throw new Error(`Project creation failed: ${await response.text()}`);
  const { id } = await response.json();
  await page.waitForURL(`${baseUrl}/static/dashboard.html`, { timeout: 15_000 });
  return id;
}

export async function adminCreateProject(baseUrl: string, adminPage: Page, title: string, description: string): Promise<number> {
  await adminPage.goto(`${baseUrl}/static/admin/create-project.html`);
  await expect(adminPage.getByRole('heading', { name: 'Create Organisation Project' })).toBeVisible({ timeout: 10_000 });

  await adminPage.getByLabel('Project Title').fill(title);
  await adminPage.getByLabel('Description').fill(description);
  await adminPage.getByRole('button', { name: 'Create Project' }).click();

  await adminPage.waitForURL(/\/static\/project\.html\?id=/, { timeout: 15_000 });
  // Wait for project content to render — this ensures auth has completed before we return,
  // so callers don't interrupt the in-flight /api/auth/me fetch and accidentally clear the token.
  await expect(adminPage.locator('#projectContent')).toBeVisible({ timeout: 10_000 });
  const match = adminPage.url().match(/\?id=(\d+)/);
  if (!match) throw new Error(`Could not extract project ID from URL: ${adminPage.url()}`);
  return parseInt(match[1]);
}

export async function adminApproveProject(baseUrl: string, adminPage: Page, projectTitle: string): Promise<void> {
  await adminPage.goto(`${baseUrl}/static/admin/triage.html`);

  const projectCard = adminPage.locator('.card').filter({ hasText: projectTitle });
  await expect(projectCard).toBeVisible({ timeout: 10_000 });
  await projectCard.getByRole('button', { name: 'Review' }).click();

  await expect(adminPage.getByRole('heading', { name: 'Review Project' })).toBeVisible({ timeout: 10_000 });
  await adminPage.getByRole('button', { name: 'Submit Review' }).click();

  await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  await expect(adminPage.getByRole('heading', { name: 'Review Project' })).not.toBeVisible({ timeout: 10_000 });
}

export async function adminRecordOutcome(baseUrl: string, adminPage: Page, projectId: number, outcome: string, notes: string): Promise<void> {
  await adminPage.goto(`${baseUrl}/static/project.html?id=${projectId}`);
  await expect(adminPage.getByRole('heading', { level: 2, name: 'Record Project Outcome' })).toBeVisible({ timeout: 10_000 });

  await adminPage.getByLabel('Outcome', { exact: true }).selectOption(outcome);
  await adminPage.getByLabel('Outcome Notes').fill(notes);
  await adminPage.getByRole('button', { name: 'Record Outcome' }).click();
  await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
}

export async function transferProjectOwnership(baseUrl: string, adminPage: Page, projectId: number, volunteerName: string): Promise<void> {
  // Avoid reloading if already on the project page — a reload re-triggers auth
  // checks that can flakily redirect to login under parallel test load.
  if (!adminPage.url().includes(`/static/project.html?id=${projectId}`)) {
    await adminPage.goto(`${baseUrl}/static/project.html?id=${projectId}`);
  }
  await expect(adminPage.getByRole('heading', { level: 3, name: 'Transfer Ownership' })).toBeVisible({ timeout: 10_000 });
  await expect(adminPage.getByLabel('Transfer to').locator(`option:has-text("${volunteerName}")`)).toBeAttached({ timeout: 10_000 });
  await adminPage.getByLabel('Transfer to').selectOption({ label: volunteerName });
  adminPage.once('dialog', dialog => dialog.accept());
  await adminPage.getByRole('button', { name: 'Transfer' }).click();
  await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
}

export async function setProjectStatus(baseUrl: string, page: Page, projectId: number, status: string): Promise<void> {
  await page.goto(`${baseUrl}/static/project.html?id=${projectId}`);
  await expect(page.getByRole('heading', { name: 'Manage Project Status' })).toBeVisible({ timeout: 10_000 });

  await page.getByLabel('Change Status').selectOption(status);
  await page.getByRole('button', { name: 'Update Status' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
}
