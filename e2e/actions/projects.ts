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

  await page.getByRole('button', { name: 'Submit Project Proposal' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });

  await page.waitForURL(`${baseUrl}/static/dashboard.html`, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Proposed' }).click();
  const link = page.getByRole('link', { name: title, exact: true });
  await expect(link).toBeVisible({ timeout: 10_000 });
  const href = await link.getAttribute('href');
  const match = href?.match(/\?id=(\d+)/);
  if (!match) throw new Error(`Could not extract project ID from href: ${href}`);
  return parseInt(match[1]);
}

export async function adminCreateProject(baseUrl: string, adminPage: Page, title: string, description: string): Promise<number> {
  await adminPage.goto(`${baseUrl}/static/admin/create-project.html`);
  await expect(adminPage.getByRole('heading', { name: 'Create Organisation Project' })).toBeVisible({ timeout: 10_000 });

  await adminPage.getByLabel('Project Title').fill(title);
  await adminPage.getByLabel('Description').fill(description);
  await adminPage.getByRole('button', { name: 'Create Project' }).click();

  await adminPage.waitForURL(/\/static\/project\.html\?id=/, { timeout: 15_000 });
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
  await adminPage.goto(`${baseUrl}/static/project.html?id=${projectId}`);
  await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
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
