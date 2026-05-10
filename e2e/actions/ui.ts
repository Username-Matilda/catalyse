import { Page } from '@playwright/test';

export async function selectFilterDropdown(page: Page, ariaLabel: string, optionLabel: string): Promise<void> {
  await page.getByLabel(ariaLabel).click();
  await page.getByRole('option', { name: optionLabel }).click();
}
