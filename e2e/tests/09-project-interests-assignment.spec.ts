import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import {
  proposeProject,
  adminApproveProject,
  adminCreateProject,
  transferProjectOwnership,
} from '../actions/projects';
import { Page } from '@playwright/test';

// Creates an org project that immediately accepts interest (is_seeking_help = true by default)
async function setupSeekingProject(adminPage: Page): Promise<number> {
  return adminCreateProject(adminPage, `E2E Interests ${Date.now()}`, 'Project seeking volunteers');
}

test.describe('Project Interests and Assignment', () => {
  test('Volunteer expresses interest to contribute', async ({ adminPage, volunteer }) => {
    const projectId = await setupSeekingProject(adminPage);

    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    // want_to_contribute is selected by default; submit directly
    await expect(volunteer.page.getByRole('radio', { name: /I want to help out/ })).toBeChecked({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click();

    await expect(volunteer.page.getByRole('alert')).toContainText('Interest expressed!', { timeout: 10_000 });
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).not.toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByLabel('interest status')).toContainText('pending', { timeout: 10_000 });
  });

  test('Volunteer expresses interest to own / lead', async ({ adminPage, volunteer }) => {
    const projectId = await setupSeekingProject(adminPage);

    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByRole('radio', { name: /I want to own/ }).click();
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click();

    await expect(volunteer.page.getByRole('alert')).toContainText('Interest expressed!', { timeout: 10_000 });
    await expect(volunteer.page.getByLabel('interest status')).toContainText('pending', { timeout: 10_000 });
  });

  test('Project owner accepts a pending interest; volunteer receives a notification', async ({ adminPage, volunteer }) => {
    const projectId = await setupSeekingProject(adminPage);

    // Volunteer expresses interest
    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Interest expressed!', { timeout: 10_000 });

    // Admin (managing the project) accepts the interest
    await adminPage.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    const interestCard = adminPage.locator('.interest-card').filter({ hasText: volunteer.name });
    await expect(interestCard).toBeVisible({ timeout: 10_000 });
    await interestCard.getByRole('button', { name: 'Accept' }).click();
    await expect(adminPage.getByRole('alert')).toContainText('Interest accepted', { timeout: 10_000 });

    // Interest status updates to accepted
    await expect(adminPage.locator('.interest-card').filter({ hasText: volunteer.name })).toContainText('accepted', { timeout: 10_000 });

    // Volunteer receives a notification
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(volunteer.page.locator('strong').filter({ hasText: 'was accepted' })).toBeVisible({ timeout: 10_000 });
  });

  test('Project owner declines a pending interest', async ({ adminPage, volunteer }) => {
    const projectId = await setupSeekingProject(adminPage);
    const declineMessage = `Not the right fit ${Date.now()}`;

    // Volunteer expresses interest
    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Interest expressed!', { timeout: 10_000 });

    // Admin declines with a response message via browser prompt
    await adminPage.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    const interestCard = adminPage.locator('.interest-card').filter({ hasText: volunteer.name });
    await expect(interestCard).toBeVisible({ timeout: 10_000 });
    adminPage.once('dialog', dialog => dialog.accept(declineMessage));
    await interestCard.getByRole('button', { name: 'Decline' }).click();
    await expect(adminPage.getByRole('alert')).toContainText('Interest declined', { timeout: 10_000 });

    // Interest status updates to declined
    await expect(adminPage.locator('.interest-card').filter({ hasText: volunteer.name })).toContainText('declined', { timeout: 10_000 });
  });

  test('Volunteer withdraws their pending interest', async ({ adminPage, volunteer }) => {
    const projectId = await setupSeekingProject(adminPage);

    // Express interest first
    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Interest expressed!', { timeout: 10_000 });
    await expect(volunteer.page.getByRole('button', { name: 'Withdraw Interest' })).toBeVisible({ timeout: 10_000 });

    // Volunteer withdraws via confirm dialog
    volunteer.page.once('dialog', dialog => dialog.accept());
    await volunteer.page.getByRole('button', { name: 'Withdraw Interest' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Interest withdrawn', { timeout: 10_000 });

    // Interest form reappears
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).toBeVisible({ timeout: 10_000 });
  });

  test('Admin directly assigns a volunteer to a project', async ({ adminPage, volunteer }) => {
    const projectId = await setupSeekingProject(adminPage);

    await adminPage.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByLabel('Volunteer to assign').locator(`option:has-text("${volunteer.name}")`)).toBeAttached({ timeout: 10_000 });
    await adminPage.getByLabel('Volunteer to assign').selectOption({ label: volunteer.name });
    await adminPage.getByRole('button', { name: 'Assign' }).click();
    await expect(adminPage.getByRole('alert')).toContainText('Volunteer assigned!', { timeout: 10_000 });

    // Volunteer's interest record appears as accepted
    await expect(adminPage.locator('.interest-card').filter({ hasText: volunteer.name })).toContainText('accepted', { timeout: 10_000 });

    // Volunteer receives an assignment notification
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(volunteer.page.locator('strong').filter({ hasText: "You've been assigned to" })).toBeVisible({ timeout: 10_000 });
  });

  test('Volunteer cannot express interest in their own project', async ({ adminPage, volunteer }) => {
    const title = `E2E Own Project ${Date.now()}`;
    const projectId = await proposeProject(volunteer.page, title, 'Project owned by the volunteer');
    await adminApproveProject(adminPage, title);
    await transferProjectOwnership(adminPage, projectId, volunteer.name);

    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    // Interest form is hidden for the project owner
    await expect(volunteer.page.getByRole('button', { name: 'Express Interest' })).not.toBeVisible({ timeout: 5_000 });
    await expect(volunteer.page.getByRole('heading', { name: 'Interested in this project?' })).not.toBeVisible({ timeout: 5_000 });
  });
});
