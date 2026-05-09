import { Page, expect } from '@playwright/test';

export async function goToDashboardNotifications(baseUrl: string, page: Page): Promise<void> {
  await page.goto(`${baseUrl}/static/dashboard.html`);
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /^Notifications/ }).click();
}
