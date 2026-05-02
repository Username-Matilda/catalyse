import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import type { Page } from '@playwright/test';

async function openBugReportForm(page: Page): Promise<void> {
  const cookieBanner = page.locator('.cookie-banner');
  if (await cookieBanner.isVisible()) {
    await cookieBanner.getByRole('button', { name: 'Accept' }).click();
    await expect(cookieBanner).not.toBeVisible({ timeout: 5_000 });
  }
  await page.getByRole('button', { name: 'Report a bug or give feedback' }).click();
  await expect(page.getByRole('dialog', { name: 'Report an Issue' })).toBeVisible({ timeout: 10_000 });
}

async function fillAndSubmitBugReport(
  page: Page,
  opts: {
    title: string;
    description: string;
    category?: string;
    severity?: string;
    email?: string;
  }
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Report an Issue' });
  if (opts.category) {
    await dialog.getByRole('radio', { name: opts.category }).click();
  }
  await dialog.getByLabel('Title').fill(opts.title);
  await dialog.getByLabel('Details').fill(opts.description);
  if (opts.email !== undefined) {
    await dialog.getByLabel('Your Email (optional)').fill(opts.email);
  }
  if (opts.severity) {
    await dialog.getByLabel('How urgent is this?').selectOption(opts.severity);
  }
  await dialog.getByRole('button', { name: 'Submit Report' }).click();
}

test.describe('Bug Reporting', () => {
  test('Logged-in volunteer submits a bug report; admin receives a notification', async ({ adminPage, volunteer }) => {
    const title = `E2E Bug Report ${Date.now()}`;

    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });

    await openBugReportForm(volunteer.page);
    await fillAndSubmitBugReport(volunteer.page, {
      title,
      description: 'This is a test bug report submitted via the e2e test suite',
      category: 'Bug',
      severity: 'high',
    });

    const dialog = volunteer.page.getByRole('dialog', { name: 'Report an Issue' });
    await expect(dialog.getByRole('heading', { name: 'Thank you!' })).toBeVisible({ timeout: 10_000 });

    await adminPage.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(adminPage.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await adminPage.getByRole('button', { name: /^Notifications/ }).click();
    await expect(
      adminPage.locator('strong').filter({ hasText: `New bug: ${title}` })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Anonymous visitor submits a bug report with a contact email', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/static/index.html`);

      await openBugReportForm(page);
      await fillAndSubmitBugReport(page, {
        title: `E2E Anon Bug ${Date.now()}`,
        description: 'Anonymous bug report with an email address provided',
        email: 'anon-reporter@example.com',
      });

      const dialog = page.getByRole('dialog', { name: 'Report an Issue' });
      await expect(dialog.getByRole('heading', { name: 'Thank you!' })).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('Anonymous visitor submits a bug report without an email', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/static/index.html`);

      await openBugReportForm(page);
      await fillAndSubmitBugReport(page, {
        title: `E2E Anon No Email ${Date.now()}`,
        description: 'Anonymous bug report without an email address',
      });

      const dialog = page.getByRole('dialog', { name: 'Report an Issue' });
      await expect(dialog.getByRole('heading', { name: 'Thank you!' })).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('Bug report submission fails with a too-short description', async ({ volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });

    await openBugReportForm(volunteer.page);
    await fillAndSubmitBugReport(volunteer.page, {
      title: 'Validation test',
      description: 'too short', // 9 characters — below the API minimum of 10
    });

    await expect(volunteer.page.locator('.toast-error')).toBeVisible({ timeout: 10_000 });
  });
});
