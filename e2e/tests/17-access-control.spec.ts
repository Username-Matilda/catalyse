import { test, expect, getAlert } from '../fixtures';
import { proposeProject, adminCreateProject, adminApproveProject } from '../actions/projects';

test.describe('Access Control', () => {
  test('Unauthenticated user cannot access the dashboard', async ({ browser, baseUrl }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/dashboard`);
      await page.waitForURL(/\/login/, { timeout: 10_000 });
      expect(page.url()).toContain('/login');
    } finally {
      await context.close();
    }
  });

  test('Non-admin cannot access admin triage', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/admin/triage`);
    await volunteer.page.waitForURL(`${baseUrl}/`, { timeout: 10_000 });
  });

  test('Non-owner cannot update another volunteer\'s project', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await adminCreateProject(baseUrl, adminPage, `Access Control Update Test ${Date.now()}`, 'Test project for access control');

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}/edit`);
    await expect(getAlert(volunteer.page)).toContainText('You do not have permission to edit this project.', { timeout: 10_000 });
    await expect(volunteer.page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  test('Non-owner cannot delete another volunteer\'s project', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await adminCreateProject(baseUrl, adminPage, `Access Control Delete Test ${Date.now()}`, 'Test project for delete access control');

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}/edit`);
    await expect(getAlert(volunteer.page)).toContainText('You do not have permission to edit this project.', { timeout: 10_000 });
    await expect(volunteer.page.getByRole('button', { name: 'Delete Project' })).not.toBeVisible();
  });

  test('Admin can update any project', async ({ adminPage, volunteer, baseUrl }) => {
    const originalTitle = `Admin Update Test ${Date.now()}`;
    const projectId = await proposeProject(baseUrl, volunteer.page, originalTitle, 'Project for admin update access control test');
    await adminApproveProject(baseUrl, adminPage, originalTitle);

    const newTitle = `Admin Updated ${Date.now()}`;
    await adminPage.goto(`${baseUrl}/projects/${projectId}/edit`);
    await expect(adminPage.getByRole('heading', { name: 'Edit Project' })).toBeVisible({ timeout: 10_000 });

    await adminPage.getByLabel('Project Title').fill(newTitle);
    await adminPage.getByRole('button', { name: 'Save Changes' }).click();

    await adminPage.waitForURL(`${baseUrl}/projects/${projectId}`, { timeout: 15_000 });
    await expect(adminPage.getByRole('heading', { level: 1 })).toContainText(newTitle, { timeout: 10_000 });
  });
});
