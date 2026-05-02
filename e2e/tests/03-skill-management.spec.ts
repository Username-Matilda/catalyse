import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';

test.describe('Admin: Skill Management', () => {
  test('Admin creates a skill category', async ({ adminPage }) => {
    const categoryName = `E2E Category ${Date.now()}`;

    await adminPage.goto(`${BASE_URL}/static/admin/skills.html`);
    await expect(adminPage.getByRole('button', { name: '+ Add Category' })).toBeVisible({ timeout: 10_000 });

    await adminPage.getByRole('button', { name: '+ Add Category' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Add Category', level: 2 })).toBeVisible({ timeout: 5_000 });

    await adminPage.getByLabel('Category Name').fill(categoryName);
    await adminPage.getByRole('button', { name: 'Save Category' }).click();

    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Category created!');
    await expect(adminPage.getByRole('heading', { name: categoryName, level: 3 })).toBeVisible({ timeout: 10_000 });
  });

  test('Admin creates a skill within a category', async ({ adminPage }) => {
    const ts = Date.now();
    const categoryName = `E2E Category ${ts}`;
    const skillName = `E2E Skill ${ts}`;

    await adminPage.goto(`${BASE_URL}/static/admin/skills.html`);
    await expect(adminPage.getByRole('button', { name: '+ Add Category' })).toBeVisible({ timeout: 10_000 });

    // Create a fresh category to add the skill into
    await adminPage.getByRole('button', { name: '+ Add Category' }).click();
    await adminPage.getByLabel('Category Name').fill(categoryName);
    await adminPage.getByRole('button', { name: 'Save Category' }).click();
    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Category created!');

    // Add a skill under that category
    const categoryCard = adminPage.locator('.category-card').filter({ hasText: categoryName });
    await categoryCard.getByRole('button', { name: '+ Add Skill' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Add Skill', level: 2 })).toBeVisible({ timeout: 5_000 });

    await adminPage.getByLabel('Skill Name').fill(skillName);
    await adminPage.getByRole('button', { name: 'Save Skill' }).click();

    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Skill created!');
    await expect(categoryCard.getByRole('heading', { name: skillName, level: 4 })).toBeVisible({ timeout: 10_000 });

    // Skill appears in profile skill picker
    await adminPage.goto(`${BASE_URL}/static/profile.html`);
    await expect(adminPage.locator('.skill-option').first()).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.locator('.skill-option').filter({ hasText: skillName })).toBeVisible();
  });

  test('Admin edits a skill name', async ({ adminPage }) => {
    const ts = Date.now();
    const categoryName = `E2E Category ${ts}`;
    const skillName = `E2E Skill A ${ts}`;
    const updatedSkillName = `E2E Skill B ${ts}`;

    await adminPage.goto(`${BASE_URL}/static/admin/skills.html`);
    await expect(adminPage.getByRole('button', { name: '+ Add Category' })).toBeVisible({ timeout: 10_000 });

    // Create category and skill
    await adminPage.getByRole('button', { name: '+ Add Category' }).click();
    await adminPage.getByLabel('Category Name').fill(categoryName);
    await adminPage.getByRole('button', { name: 'Save Category' }).click();
    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    const categoryCard = adminPage.locator('.category-card').filter({ hasText: categoryName });
    await categoryCard.getByRole('button', { name: '+ Add Skill' }).click();
    await adminPage.getByLabel('Skill Name').fill(skillName);
    await adminPage.getByRole('button', { name: 'Save Skill' }).click();
    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Skill created!');

    // Edit the skill name
    const skillItem = categoryCard.locator('.skill-item').filter({ hasText: skillName });
    await skillItem.getByRole('button', { name: 'Edit' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Edit Skill', level: 2 })).toBeVisible({ timeout: 5_000 });

    await adminPage.getByLabel('Skill Name').fill(updatedSkillName);
    await adminPage.getByRole('button', { name: 'Save Skill' }).click();

    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Skill updated!');

    // Updated name appears in skill picker; old name is gone
    await adminPage.goto(`${BASE_URL}/static/profile.html`);
    await expect(adminPage.locator('.skill-option').first()).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.locator('.skill-option').filter({ hasText: updatedSkillName })).toBeVisible();
    await expect(adminPage.locator('.skill-option').filter({ hasText: skillName })).not.toBeVisible();
  });

  test('Admin deletes an unused skill', async ({ adminPage }) => {
    const ts = Date.now();
    const categoryName = `E2E Category ${ts}`;
    const skillName = `E2E Skill ${ts}`;

    await adminPage.goto(`${BASE_URL}/static/admin/skills.html`);
    await expect(adminPage.getByRole('button', { name: '+ Add Category' })).toBeVisible({ timeout: 10_000 });

    // Create category and skill
    await adminPage.getByRole('button', { name: '+ Add Category' }).click();
    await adminPage.getByLabel('Category Name').fill(categoryName);
    await adminPage.getByRole('button', { name: 'Save Category' }).click();
    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    const categoryCard = adminPage.locator('.category-card').filter({ hasText: categoryName });
    await categoryCard.getByRole('button', { name: '+ Add Skill' }).click();
    await adminPage.getByLabel('Skill Name').fill(skillName);
    await adminPage.getByRole('button', { name: 'Save Skill' }).click();
    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Skill created!');

    // Delete the skill and confirm
    const skillItem = categoryCard.locator('.skill-item').filter({ hasText: skillName });
    await skillItem.getByRole('button', { name: 'Del' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Confirm Delete', level: 2 })).toBeVisible({ timeout: 5_000 });
    await adminPage.locator('#deleteModal').getByRole('button', { name: 'Delete' }).click();

    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Skill deleted!');

    // Skill no longer appears in profile skill picker
    await adminPage.goto(`${BASE_URL}/static/profile.html`);
    await expect(adminPage.locator('.skill-option').first()).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.locator('.skill-option').filter({ hasText: skillName })).not.toBeVisible();
  });

  test('Admin deletes a skill category', async ({ adminPage }) => {
    const categoryName = `E2E Category ${Date.now()}`;

    await adminPage.goto(`${BASE_URL}/static/admin/skills.html`);
    await expect(adminPage.getByRole('button', { name: '+ Add Category' })).toBeVisible({ timeout: 10_000 });

    // Create an empty category
    await adminPage.getByRole('button', { name: '+ Add Category' }).click();
    await adminPage.getByLabel('Category Name').fill(categoryName);
    await adminPage.getByRole('button', { name: 'Save Category' }).click();
    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByRole('alert')).toContainText('Category created!');
    await expect(adminPage.getByRole('heading', { name: categoryName, level: 3 })).toBeVisible({ timeout: 10_000 });

    // Delete the category and confirm
    const categoryCard = adminPage.locator('.category-card').filter({ hasText: categoryName });
    await categoryCard.getByRole('button', { name: 'Delete' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Confirm Delete', level: 2 })).toBeVisible({ timeout: 5_000 });
    await adminPage.locator('#deleteModal').getByRole('button', { name: 'Delete' }).click();

    // Category no longer appears in the skills tree
    await expect(adminPage.getByRole('heading', { name: categoryName, level: 3 })).not.toBeVisible({ timeout: 10_000 });
  });
});
