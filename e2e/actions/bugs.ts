import { Page, expect } from '@playwright/test';

export async function openBugReportForm(page: Page): Promise<void> {
  const cookieBanner = page.locator('.cookie-banner');
  if (await cookieBanner.isVisible()) {
    await cookieBanner.getByRole('button', { name: 'Accept' }).click();
    await expect(cookieBanner).not.toBeVisible({ timeout: 5_000 });
  }
  await page.getByRole('button', { name: 'Report a bug or give feedback' }).click();
  await expect(page.getByRole('dialog', { name: 'Report an Issue' })).toBeVisible({ timeout: 10_000 });
}

export async function fillAndSubmitBugReport(
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

export async function submitBugReport(baseUrl: string, page: Page, title: string, description: string): Promise<void> {
  await page.goto(`${baseUrl}/static/dashboard.html`);
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
  await openBugReportForm(page);
  await fillAndSubmitBugReport(page, { title, description });
  await expect(
    page.getByRole('dialog', { name: 'Report an Issue' }).getByRole('heading', { name: 'Thank you!' })
  ).toBeVisible({ timeout: 10_000 });
}
