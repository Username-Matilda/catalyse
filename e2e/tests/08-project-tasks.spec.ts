import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import {
  proposeProject,
  adminCreateProject,
  adminApproveProject,
  transferProjectOwnership,
} from '../actions/projects';
import { Page } from '@playwright/test';

// Produces an in_progress project with one open task ("Initial task") proposed by the volunteer
async function setupInProgressProject(
  adminPage: Page,
  volunteer: { page: Page; name: string }
): Promise<number> {
  const title = `E2E Tasks ${Date.now()}`;
  const id = await proposeProject(volunteer.page, title, 'Setup for task scenarios');
  await adminApproveProject(adminPage, title);
  return id;
}

test.describe('Project Tasks', () => {
  test('Adding a task to a needs_tasks project auto-promotes it to In Progress', async ({ adminPage }) => {
    await adminCreateProject(
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

  test('A volunteer can claim an open task', async ({ adminPage, volunteer }) => {
    const projectId = await setupInProgressProject(adminPage, volunteer);

    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await expect(volunteer.page.getByRole('button', { name: 'Claim' })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: 'Claim' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Task claimed!', { timeout: 10_000 });

    // Done button appears only for the assignee — confirms task is now assigned to this volunteer
    await expect(volunteer.page.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 10_000 });
  });

  test('A volunteer can mark their claimed task as done', async ({ adminPage, volunteer }) => {
    const projectId = await setupInProgressProject(adminPage, volunteer);

    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByRole('button', { name: 'Claim' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Task claimed!', { timeout: 10_000 });

    await volunteer.page.getByRole('button', { name: 'Done' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Task completed!', { timeout: 10_000 });

    await expect(volunteer.page.getByRole('button', { name: 'Done' })).not.toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByText('done', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('Project owner deletes a task', async ({ adminPage, volunteer }) => {
    const projectId = await setupInProgressProject(adminPage, volunteer);
    await transferProjectOwnership(adminPage, projectId, volunteer.name);

    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByText('Initial task')).toBeVisible({ timeout: 10_000 });

    const dialogPromise = volunteer.page.waitForEvent('dialog');
    await volunteer.page.getByRole('button', { name: 'Delete task' }).click();
    const dialog = await dialogPromise;
    await dialog.accept();

    await expect(volunteer.page.getByRole('alert')).toContainText('Task deleted!', { timeout: 10_000 });
    await expect(volunteer.page.getByText('Initial task')).not.toBeVisible({ timeout: 10_000 });
  });
});
