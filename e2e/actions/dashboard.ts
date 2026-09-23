import { Page, expect } from '@playwright/test'

/** The Home page's greeting, which shows once the page has loaded. */
export const homeHeading = (page: Page) => page.getByRole('heading', { level: 1, name: /^Hi / })

/** The Notifications heading on Home, which carries the unread badge. */
export const notificationsHeading = (page: Page) => page.locator('[data-tab="notifications"]')

export async function goToDashboardNotifications(baseUrl: string, page: Page): Promise<void> {
  // From another /dashboard address this would only change the hash, keeping the list
  // loaded before; leave the page first so Home loads afresh.
  await page.goto('about:blank')
  await page.goto(`${baseUrl}/dashboard#tab-notifications`)
  await expect(homeHeading(page)).toBeVisible({ timeout: 10_000 })
  await expect(notificationsHeading(page)).toBeVisible()
}
