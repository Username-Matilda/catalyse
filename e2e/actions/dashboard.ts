import { Page, expect } from '@playwright/test'

export async function goToDashboardNotifications(baseUrl: string, page: Page): Promise<void> {
  await page.goto(`${baseUrl}/dashboard`)
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('tab', { name: /^Notifications/ }).click()
}
