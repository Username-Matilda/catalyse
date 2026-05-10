import { test, expect, getAlert } from '../fixtures';
import type { Page } from '@playwright/test';
import { submitBugReport } from '../actions/bugs';
import { selectFilterDropdown } from '../actions/ui';
import { fake } from '../fake';

async function navigateToBugsPage(baseUrl: string, adminPage: Page): Promise<void> {
  await adminPage.goto(`${baseUrl}/admin/bugs`);
  await expect(adminPage.getByRole('heading', { name: 'Bug Reports & Feedback', level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(adminPage.getByText('Loading...')).not.toBeVisible({ timeout: 10_000 });
}

async function updateReportStatus(
  adminPage: Page,
  reportTitle: string,
  status: string,
  resolutionNotes?: string
): Promise<void> {
  const card = adminPage.locator('.card').filter({ hasText: reportTitle });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
  const modal = adminPage.getByRole('dialog', { name: reportTitle });
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.getByLabel('Status').selectOption(status);
  if (resolutionNotes) {
    await modal.getByLabel('Resolution Notes').fill(resolutionNotes);
  }
  await modal.getByRole('button', { name: 'Update' }).click();
  await expect(getAlert(adminPage)).toContainText('Report updated!', { timeout: 10_000 });
}

test.describe('Bug Report Management', () => {
  test('Admin views the bug reports list', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.bugTitle();

    await submitBugReport(baseUrl, volunteer.page, title, 'A test bug report for admin management e2e tests');

    await navigateToBugsPage(baseUrl, adminPage);
    const card = adminPage.locator('.card').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText(title);
  });

  test('Admin filters bug reports by status', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.bugTitle();

    await submitBugReport(baseUrl, volunteer.page, title, 'A bug report used for filter testing in e2e');

    await navigateToBugsPage(baseUrl, adminPage);
    await selectFilterDropdown(adminPage, 'Filter by status', 'In Progress');
    await expect(adminPage.locator('.card').filter({ hasText: title })).not.toBeVisible({ timeout: 10_000 });

    await selectFilterDropdown(adminPage, 'Filter by status', 'Open');
    await expect(adminPage.locator('.card').filter({ hasText: title })).toBeVisible({ timeout: 10_000 });
  });

  test('Admin moves a bug report to in_progress', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.bugTitle();

    await submitBugReport(baseUrl, volunteer.page, title, 'A bug report that will be moved to in_progress status');

    await navigateToBugsPage(baseUrl, adminPage);
    await updateReportStatus(adminPage, title, 'in_progress');

    await selectFilterDropdown(adminPage, 'Filter by status', 'In Progress');
    const card = adminPage.locator('.card').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('In Progress');
  });

  test('Admin resolves a bug report with resolution notes', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.bugTitle();
    const notes = fake.resolutionNotes();

    await submitBugReport(baseUrl, volunteer.page, title, 'A bug report that will be resolved with resolution notes');

    await navigateToBugsPage(baseUrl, adminPage);
    await updateReportStatus(adminPage, title, 'resolved', notes);

    await selectFilterDropdown(adminPage, 'Filter by status', 'Resolved');
    const card = adminPage.locator('.card').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('resolved');

    await card.click();
    const modal = adminPage.getByRole('dialog', { name: title });
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByLabel('Resolution Notes')).toHaveValue(notes);
  });

  test("Admin marks a bug report as wont_fix", async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.bugTitle();

    await submitBugReport(baseUrl, volunteer.page, title, "A bug report that will be marked as wont_fix by admin");

    await navigateToBugsPage(baseUrl, adminPage);
    await updateReportStatus(adminPage, title, 'wont_fix');

    await selectFilterDropdown(adminPage, 'Filter by status', "Won't Fix");
    const card = adminPage.locator('.card').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText("Won't Fix");
  });
});
