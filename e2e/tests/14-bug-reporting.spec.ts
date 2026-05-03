import { test, expect } from '../fixtures';
import { openBugReportForm, fillAndSubmitBugReport } from '../actions/bugs';
import { goToDashboardNotifications } from '../actions/dashboard';

test.describe('Bug Reporting', () => {
  test('Logged-in volunteer submits a bug report; admin receives a notification', async ({ adminPage, volunteer, baseUrl }) => {
    test.setTimeout(60_000);
    const title = `E2E Bug Report ${Date.now()}`;

    await volunteer.page.goto(`${baseUrl}/static/dashboard.html`);
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

    await goToDashboardNotifications(baseUrl, adminPage);
    await expect(
      adminPage.locator('strong').filter({ hasText: `New bug: ${title}` })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Anonymous visitor submits a bug report with a contact email', async ({ browser, baseUrl }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/static/index.html`);

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

  test('Anonymous visitor submits a bug report without an email', async ({ browser, baseUrl }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/static/index.html`);

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

  test('Bug report submission fails with a too-short description', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });

    await openBugReportForm(volunteer.page);
    await fillAndSubmitBugReport(volunteer.page, {
      title: 'Validation test',
      description: 'too short', // 9 characters — below the API minimum of 10
    });

    await expect(volunteer.page.locator('.toast-error')).toBeVisible({ timeout: 10_000 });
  });
});
