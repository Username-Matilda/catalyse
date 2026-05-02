import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import {
  proposeProject,
  adminCreateProject,
  adminApproveProject,
  setProjectStatus,
  adminRecordOutcome,
  transferProjectOwnership,
} from '../actions/projects';

test.describe('Project Lifecycle', () => {
  test('Volunteer proposes a project with tasks; admin approves; project moves to In Progress', async ({ adminPage, volunteer }) => {
    const title = `E2E Propose Approve ${Date.now()}`;
    const projectId = await proposeProject(volunteer.page, title, 'Test proposal description');
    await adminApproveProject(adminPage, title);

    await volunteer.page.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByLabel('project status')).toContainText('In Progress', { timeout: 10_000 });
  });

  test('Admin sends a proposed project back for discussion', async ({ adminPage, volunteer }) => {
    const title = `E2E Discussion ${Date.now()}`;
    const feedbackText = `Please clarify the scope of this project ${Date.now()}`;
    await proposeProject(volunteer.page, title, 'Test proposal for discussion');

    await adminPage.goto(`${BASE_URL}/static/admin/triage.html`);
    const projectCard = adminPage.locator('.card').filter({ hasText: title });
    await expect(projectCard).toBeVisible({ timeout: 10_000 });
    await projectCard.getByRole('button', { name: 'Review' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Review Project' })).toBeVisible({ timeout: 10_000 });

    await adminPage.getByRole('radio', { name: /Needs Discussion/ }).click();
    await adminPage.getByLabel('Message to Proposer').fill(feedbackText);
    await adminPage.getByRole('button', { name: 'Submit Review' }).click();
    await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    // Project status becomes needs_discussion — visible in the triage "Needs Discussion" tab
    await adminPage.goto(`${BASE_URL}/static/admin/triage.html`);
    await adminPage.getByRole('button', { name: 'Needs Discussion' }).click();
    await expect(adminPage.locator('.card').filter({ hasText: title })).toBeVisible({ timeout: 10_000 });

    // Proposer receives a notification containing the feedback message
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(volunteer.page.locator('p').filter({ hasText: feedbackText })).toBeVisible({ timeout: 10_000 });
  });

  test('Admin creates an org-proposed project', async ({ adminPage }) => {
    const title = `E2E Org Project ${Date.now()}`;
    await adminCreateProject(adminPage, title, 'Admin-created project description');

    // Project starts in needs_tasks status
    await expect(adminPage.getByLabel('project status')).toContainText('Needs Tasks', { timeout: 10_000 });

    // Project does not appear in the triage queue
    await adminPage.goto(`${BASE_URL}/static/admin/triage.html`);
    await expect(adminPage.locator('.card').filter({ hasText: title })).not.toBeVisible({ timeout: 5_000 });
  });

  test('Owner moves an `in_progress` project to completed', async ({ adminPage, volunteer }) => {
    const title = `E2E Owner Complete ${Date.now()}`;
    const projectId = await proposeProject(volunteer.page, title, 'Project to be completed by owner');
    await adminApproveProject(adminPage, title);

    // Admin assigns volunteer as owner via the Transfer Ownership UI
    await transferProjectOwnership(adminPage, projectId, volunteer.name);

    // Owner (volunteer) changes status to completed via the dropdown
    await setProjectStatus(volunteer.page, projectId, 'completed');

    // Project appears in the completed tab on the projects index
    await volunteer.page.goto(`${BASE_URL}/static/index.html`);
    await expect(volunteer.page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: 'All Active' }).click();
    await volunteer.page.getByRole('option', { name: 'Completed' }).click();
    await expect(volunteer.page.getByRole('link', { name: title })).toBeVisible({ timeout: 10_000 });
  });

  test('Admin records a successful project outcome', async ({ adminPage, volunteer }) => {
    const title = `E2E Outcome ${Date.now()}`;
    const outcomeNotes = `Great work on this project ${Date.now()}`;

    // Create project with a required skill (Writing, id=1)
    const projectId = await proposeProject(volunteer.page, title, 'Project for outcome recording', 'Writing');
    await adminApproveProject(adminPage, title);

    // Admin assigns volunteer as owner via the Transfer Ownership UI
    await transferProjectOwnership(adminPage, projectId, volunteer.name);

    // Set project to completed
    await setProjectStatus(adminPage, projectId, 'completed');

    // Admin records outcome as successful with notes
    await adminRecordOutcome(adminPage, projectId, 'successful', outcomeNotes);

    // Outcome is visible on the project detail
    await adminPage.goto(`${BASE_URL}/static/project.html?id=${projectId}`);
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    const outcomeDisplay = adminPage.getByRole('status');
    await expect(outcomeDisplay).toBeVisible({ timeout: 10_000 });
    await expect(outcomeDisplay).toContainText('Successful');
    await expect(outcomeDisplay).toContainText(outcomeNotes);
  });

  // SKIPPED: The app has no UI that displays a volunteer's endorsements — there is no profile
  // view, directory card, or project page that shows "endorsed via project_outcome". The only
  // way to verify this is via the admin API endpoint, which requires the volunteer's numeric ID.
  // Skip until endorsements become visible somewhere in the UI.
  test.skip('Required-skill endorsements are created for the project owner on a successful outcome', async () => {});
});
