import { Page, expect } from '@playwright/test';
import { getAlert } from '../fixtures';
import { fake } from '../fake';

export interface SkillInfo {
  name: string;
  optionLabel: string;
}

export async function createSkill(baseUrl: string, adminPage: Page): Promise<SkillInfo> {
  const categoryName = fake.skillCategory();
  const skillName = fake.skillName();

  await adminPage.goto(`${baseUrl}/admin/skills`);
  await expect(adminPage.getByRole('button', { name: '+ Add Category' })).toBeVisible({ timeout: 10_000 });

  await adminPage.getByRole('button', { name: '+ Add Category' }).click();
  await adminPage.getByLabel('Category Name').fill(categoryName);
  await adminPage.getByRole('button', { name: 'Save Category' }).click();
  await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 });

  const categoryCard = adminPage.locator('.category-card').filter({ hasText: categoryName });
  await categoryCard.getByRole('button', { name: '+ Add Skill' }).click();
  await adminPage.getByLabel('Skill Name').fill(skillName);
  await adminPage.getByRole('button', { name: 'Save Skill' }).click();
  await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 });

  return { name: skillName, optionLabel: `${skillName} (${categoryName})` };
}
