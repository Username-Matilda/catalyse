import { type Page, type Locator } from '@playwright/test'

export async function selectFilterDropdown(
  page: Page,
  ariaLabel: string,
  optionLabel: string,
  scope?: Locator | Page,
): Promise<void> {
  await (scope ?? page).getByLabel(ariaLabel, { exact: true }).click()
  await page.getByRole('option', { name: optionLabel }).click()
}
