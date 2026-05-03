import { test, expect } from '../fixtures';
import {
  proposeProject,
  adminCreateProject,
  adminApproveProject,
} from '../actions/projects';
import { Page } from '@playwright/test';

// Produces an in_progress project with one open task ("Initial task") proposed by the volunteer
async function setupInProgressProject(
  baseUrl: string,
  adminPage: Page,
  volunteer: { page: Page; name: string }
): Promise<number> {
  const title = `E2E Tasks ${Date.now()}`;
  const id = await proposeProject(baseUrl, volunteer.page, title, 'Setup for task scenarios');
  await adminApproveProject(baseUrl, adminPage, title);
  return id;
}

test.describe('Project Tasks', () => {
  test('Adding a task to a needs_tasks project auto-promotes it to In Progress', async ({ adminPage, baseUrl }) => {
    await adminCreateProject(
      baseUrl,
      adminPage,
      `E2E Task Promote ${Date.now()}`,
      'Project for auto-promotion test'
    );

    await expect(adminPage.getByLabel('project status')).toContainText('Needs Tasks', { timeout: 10_000 });

    await adminPage.getByRole('button', { name: 'Add Task' }).click();
    await adminPage.getByLabel('Task title').fill('First task');
    await adminPage.getByRole('button', { name: 'Create Task' }).click();
    await expect(adminPage.getByRole('alert')).toContainText('Task added!', { timeout: 10_000 });

    await expect(adminPage.getByLabel('project status')).toContainText('In Progress', { timeout: 10_000 });
  });

  test('A volunteer can claim an open task', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupInProgressProject(baseUrl, adminPage, volunteer);

    await volunteer.page.goto(`${baseUrl}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await expect(volunteer.page.getByRole('button', { name: 'Claim' })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: 'Claim' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Task claimed!', { timeout: 10_000 });

    // Done button appears only for the assignee — confirms task is now assigned to this volunteer
    await expect(volunteer.page.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 10_000 });
  });

  test('A volunteer can mark their claimed task as done', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupInProgressProject(baseUrl, adminPage, volunteer);

    await volunteer.page.goto(`${baseUrl}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByRole('button', { name: 'Claim' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Task claimed!', { timeout: 10_000 });

    await volunteer.page.getByRole('button', { name: 'Done' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Task completed!', { timeout: 10_000 });

    await expect(volunteer.page.getByRole('button', { name: 'Done' })).not.toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByText('done', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('Admin deletes a task', async ({ adminPage, baseUrl }) => {
    test.setTimeout(60_000);
    await adminCreateProject(
      baseUrl,
      adminPage,
      `E2E Delete Task ${Date.now()}`,
      'Project for task deletion test'
    );

    await adminPage.getByRole('button', { name: 'Add Task' }).click();
    await adminPage.getByLabel('Task title').fill('Task to delete');
    await adminPage.getByRole('button', { name: 'Create Task' }).click();
    await expect(adminPage.getByRole('alert')).toContainText('Task added!', { timeout: 10_000 });

    adminPage.once('dialog', dialog => dialog.accept());
    await adminPage.getByRole('button', { name: 'Delete task' }).click();

    await expect(adminPage.getByRole('alert')).toContainText('Task deleted!', { timeout: 10_000 });
    await expect(adminPage.getByText('Task to delete')).not.toBeVisible({ timeout: 10_000 });
  });
});
