import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import { proposeProject, adminCreateProject, adminApproveProject } from '../actions/projects';

test.describe('Access Control', () => {
  test('Unauthenticated user cannot access the dashboard', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/static/dashboard.html`);
      await page.waitForURL(/\/static\/login\.html/, { timeout: 10_000 });
      expect(page.url()).toContain('/static/login.html');
    } finally {
      await context.close();
    }
  });

  test('Non-admin cannot access admin triage', async ({ volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/admin/triage.html`);
    // Non-admins are redirected to the home page by the triage page's auth check
    await volunteer.page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
  });

  test('Non-owner cannot update another volunteer\'s project', async ({ adminPage, volunteer }) => {
    const projectId = await adminCreateProject(adminPage, `Access Control Update Test ${Date.now()}`, 'Test project for access control');

    await volunteer.page.goto(`${BASE_URL}/static/edit-project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('alert')).toContainText('You do not have permission to edit this project.', { timeout: 10_000 });
    await expect(volunteer.page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  test('Non-owner cannot delete another volunteer\'s project', async ({ adminPage, volunteer }) => {
    const projectId = await adminCreateProject(adminPage, `Access Control Delete Test ${Date.now()}`, 'Test project for delete access control');

    await volunteer.page.goto(`${BASE_URL}/static/edit-project.html?id=${projectId}`);
    // Wait for page to fully load and permissions to be checked
    await expect(volunteer.page.getByRole('alert')).toContainText('You do not have permission to edit this project.', { timeout: 10_000 });
    // Delete Project button is inside the admin-only section — not visible to non-admins
    await expect(volunteer.page.getByRole('button', { name: 'Delete Project' })).not.toBeVisible();
  });

  test('Admin can update any project', async ({ adminPage, volunteer }) => {
    const originalTitle = `Admin Update Test ${Date.now()}`;
    const projectId = await proposeProject(volunteer.page, originalTitle, 'Project for admin update access control test');
    await adminApproveProject(adminPage, originalTitle);

    const newTitle = `Admin Updated ${Date.now()}`;
    await adminPage.goto(`${BASE_URL}/static/edit-project.html?id=${projectId}`);
    await expect(adminPage.getByRole('heading', { name: 'Edit Project' })).toBeVisible({ timeout: 10_000 });

    await adminPage.getByLabel('Project Title').fill(newTitle);
    await adminPage.getByRole('button', { name: 'Save Changes' }).click();

    await adminPage.waitForURL(`${BASE_URL}/static/project.html?id=${projectId}`, { timeout: 15_000 });
    await expect(adminPage.getByRole('heading', { level: 1 })).toContainText(newTitle, { timeout: 10_000 });
  });
});
