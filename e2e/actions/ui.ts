import { type Page, type Locator } from '@playwright/test'

export async function selectFilterDropdown(
  page: Page,
  ariaLabel: string,
  optionLabel: string,
  scope?: Locator | Page,
): Promise<void> {
  await (scope ?? page).getByLabel(ariaLabel, { exact: true }).click()
  // Searchable dropdowns replace the trigger with a search input — type to filter
  const searchInput = page.locator(`input[type="search"][aria-label="${ariaLabel}"]`)
  if (await searchInput.isVisible({ timeout: 300 }).catch(() => false)) {
    await searchInput.fill(optionLabel)
  }
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
}
