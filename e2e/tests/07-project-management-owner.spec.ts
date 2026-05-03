import { test, expect } from '../fixtures';
import { proposeProject, adminApproveProject, transferProjectOwnership } from '../actions/projects';
import { Page } from '@playwright/test';

async function setupOwnedProject(baseUrl: string, adminPage: Page, volunteer: { page: Page; name: string }): Promise<number> {
  const title = `E2E Owner ${Date.now()}`;
  const projectId = await proposeProject(baseUrl, volunteer.page, title, 'Setup description for owner management');
  await adminApproveProject(baseUrl, adminPage, title);
  await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name);
  return projectId;
}

test.describe('Project Management (Owner)', () => {
  test('Project owner edits project details', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupOwnedProject(baseUrl, adminPage, volunteer);

    const newTitle = `E2E Owner Edited ${Date.now()}`;
    const newDescription = 'Updated project description set by the owner';
    const collaborationLink = 'https://docs.example.com/e2e-project';

    await volunteer.page.goto(`${baseUrl}/static/edit-project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { name: 'Edit Project' })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByLabel('Project Title').fill(newTitle);
    await volunteer.page.getByLabel('Description').fill(newDescription);
    await volunteer.page.getByLabel('Collaboration Doc / Link').fill(collaborationLink);
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();

    await volunteer.page.waitForURL(`${baseUrl}/static/project.html?id=${projectId}`, { timeout: 15_000 });
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toContainText(newTitle, { timeout: 10_000 });
    await expect(volunteer.page.getByText(newDescription)).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByRole('link', { name: 'Open Project Doc' })).toBeVisible({ timeout: 10_000 });
  });

  test('Project owner adds a required skill to the project', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupOwnedProject(baseUrl, adminPage, volunteer);

    await volunteer.page.goto(`${baseUrl}/static/edit-project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { name: 'Edit Project' })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.locator('label.skill-option').filter({ hasText: /^\s*Web Development\s*$/ }).click();
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();

    await volunteer.page.waitForURL(`${baseUrl}/static/project.html?id=${projectId}`, { timeout: 15_000 });
    await expect(volunteer.page.getByText('Web Development')).toBeVisible({ timeout: 10_000 });
  });

  test('Project owner posts a progress update', async ({ adminPage, volunteer, baseUrl }) => {
    const projectId = await setupOwnedProject(baseUrl, adminPage, volunteer);
    const updateText = `Owner progress update ${Date.now()}: Making great progress!`;

    await volunteer.page.goto(`${baseUrl}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByLabel('Add Update').fill(updateText);
    await volunteer.page.getByRole('button', { name: 'Post Update' }).click();

    await expect(volunteer.page.getByText(updateText)).toBeVisible({ timeout: 10_000 });
  });
});
