import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import type { Page } from '@playwright/test';

interface SkillInfo {
  name: string;
  optionLabel: string;
}

async function createSkill(adminPage: Page): Promise<SkillInfo> {
  const ts = Date.now();
  const categoryName = `E2E Cat ${ts}`;
  const skillName = `E2E Skill ${ts}`;

  await adminPage.goto(`${BASE_URL}/static/admin/skills.html`);
  await expect(adminPage.getByRole('button', { name: '+ Add Category' })).toBeVisible({ timeout: 10_000 });

  await adminPage.getByRole('button', { name: '+ Add Category' }).click();
  await adminPage.getByLabel('Category Name').fill(categoryName);
  await adminPage.getByRole('button', { name: 'Save Category' }).click();
  await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });

  const categoryCard = adminPage.locator('.category-card').filter({ hasText: categoryName });
  await categoryCard.getByRole('button', { name: '+ Add Skill' }).click();
  await adminPage.getByLabel('Skill Name').fill(skillName);
  await adminPage.getByRole('button', { name: 'Save Skill' }).click();
  await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });

  return { name: skillName, optionLabel: `${skillName} (${categoryName})` };
}

async function createOpenStarterTask(adminPage: Page, skill: SkillInfo): Promise<string> {
  const taskTitle = `E2E Task ${Date.now()}`;

  await adminPage.goto(`${BASE_URL}/static/admin/starter-tasks.html`);
  await expect(adminPage.getByRole('heading', { name: 'Starter Tasks', level: 1 })).toBeVisible({ timeout: 10_000 });

  await adminPage.getByRole('button', { name: 'Create Task' }).click();
  const createDialog = adminPage.getByRole('dialog', { name: 'Create Starter Task' });
  await expect(createDialog).toBeVisible({ timeout: 10_000 });

  await createDialog.getByLabel('Title').fill(taskTitle);
  await createDialog.getByLabel('Description').fill('E2E test task description');
  await createDialog.getByLabel('Skill Being Tested').selectOption({ label: skill.optionLabel });
  await createDialog.getByLabel('Estimated Hours').fill('2');
  await createDialog.getByRole('button', { name: 'Create Task' }).click();
  await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });

  return taskTitle;
}

async function assignStarterTask(adminPage: Page, taskTitle: string, volunteerName: string): Promise<void> {
  await adminPage.goto(`${BASE_URL}/static/admin/starter-tasks.html`);
  await expect(adminPage.getByRole('heading', { name: 'Starter Tasks', level: 1 })).toBeVisible({ timeout: 10_000 });

  const taskCard = adminPage.locator('.card').filter({ hasText: taskTitle });
  await expect(taskCard).toBeVisible({ timeout: 10_000 });
  await taskCard.locator('.card-header').click();
  await expect(taskCard.getByRole('button', { name: 'Assign' })).toBeVisible({ timeout: 10_000 });
  await taskCard.getByRole('button', { name: 'Assign' }).click();

  const assignDialog = adminPage.getByRole('dialog', { name: 'Assign Task' });
  await expect(assignDialog).toBeVisible({ timeout: 10_000 });
  await assignDialog.getByLabel('Volunteer').selectOption({ label: volunteerName });
  await assignDialog.getByRole('button', { name: 'Assign' }).click();
  await expect(adminPage.getByRole('alert')).toBeVisible({ timeout: 10_000 });
}

async function submitStarterTask(volunteerPage: Page, taskTitle: string): Promise<void> {
  await volunteerPage.goto(`${BASE_URL}/static/dashboard.html`);
  await expect(volunteerPage.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });

  const banner = volunteerPage.getByRole('region', { name: 'Starter Tasks' });
  const taskCard = banner.locator('.card').filter({ hasText: taskTitle });
  await expect(taskCard).toBeVisible({ timeout: 10_000 });
  await taskCard.locator('.card-header').click();
  await expect(taskCard.getByRole('button', { name: 'Mark as Complete' })).toBeVisible({ timeout: 10_000 });
  await taskCard.getByRole('button', { name: 'Mark as Complete' }).click();
  await expect(volunteerPage.getByRole('alert')).toContainText('Task submitted for review!', { timeout: 10_000 });
}

test.describe('Starter Tasks', () => {
  test('Admin creates a starter task', async ({ adminPage }) => {
    const skill = await createSkill(adminPage);
    const taskTitle = `E2E Task ${Date.now()}`;

    await adminPage.goto(`${BASE_URL}/static/admin/starter-tasks.html`);
    await expect(adminPage.getByRole('heading', { name: 'Starter Tasks', level: 1 })).toBeVisible({ timeout: 10_000 });

    await adminPage.getByRole('button', { name: 'Create Task' }).click();
    const createDialog = adminPage.getByRole('dialog', { name: 'Create Starter Task' });
    await expect(createDialog).toBeVisible({ timeout: 10_000 });

    await createDialog.getByLabel('Title').fill(taskTitle);
    await createDialog.getByLabel('Description').fill('E2E test task description');
    await createDialog.getByLabel('Skill Being Tested').selectOption({ label: skill.optionLabel });
    await createDialog.getByLabel('Estimated Hours').fill('2');
    await createDialog.getByRole('button', { name: 'Create Task' }).click();

    await expect(adminPage.getByRole('alert')).toContainText('Task created!', { timeout: 10_000 });

    // Task appears in the list with status 'open'
    const taskCard = adminPage.locator('.card').filter({ hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 10_000 });
    await expect(taskCard.locator('.status-badge')).toContainText('open');
  });

  test('Admin assigns a starter task to a volunteer; task status becomes assigned and volunteer receives a notification', async ({ adminPage, volunteer }) => {
    const skill = await createSkill(adminPage);
    const taskTitle = await createOpenStarterTask(adminPage, skill);

    // Expand the card to reveal the Assign button
    const taskCard = adminPage.locator('.card').filter({ hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 10_000 });
    await taskCard.locator('.card-header').click();
    await expect(taskCard.getByRole('button', { name: 'Assign' })).toBeVisible({ timeout: 10_000 });
    await taskCard.getByRole('button', { name: 'Assign' }).click();

    const assignDialog = adminPage.getByRole('dialog', { name: 'Assign Task' });
    await expect(assignDialog).toBeVisible({ timeout: 10_000 });
    await assignDialog.getByLabel('Volunteer').selectOption({ label: volunteer.name });
    await assignDialog.getByRole('button', { name: 'Assign' }).click();

    await expect(adminPage.getByRole('alert')).toContainText('Task assigned!', { timeout: 10_000 });
    await expect(taskCard.locator('.status-badge')).toContainText('assigned', { timeout: 10_000 });

    // Volunteer receives an assignment notification
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(
      volunteer.page.locator('strong').filter({ hasText: "You've been assigned a starter task" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Volunteer views their assigned starter task on the dashboard', async ({ adminPage, volunteer }) => {
    const skill = await createSkill(adminPage);
    const taskTitle = await createOpenStarterTask(adminPage, skill);
    await assignStarterTask(adminPage, taskTitle, volunteer.name);

    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });

    // Starter task banner shows the assigned task with its details
    const banner = volunteer.page.getByRole('region', { name: 'Starter Tasks' });
    const taskCard = banner.locator('.card').filter({ hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 10_000 });
    await expect(taskCard.locator('.status-badge')).toContainText('assigned');
  });

  test('Volunteer submits a completed starter task; task status becomes submitted and admin receives a notification', async ({ adminPage, volunteer }) => {
    const skill = await createSkill(adminPage);
    const taskTitle = await createOpenStarterTask(adminPage, skill);
    await assignStarterTask(adminPage, taskTitle, volunteer.name);

    // Volunteer expands the task card and submits it
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });

    const banner = volunteer.page.getByRole('region', { name: 'Starter Tasks' });
    const taskCard = banner.locator('.card').filter({ hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 10_000 });
    await taskCard.locator('.card-header').click();
    await expect(taskCard.getByRole('button', { name: 'Mark as Complete' })).toBeVisible({ timeout: 10_000 });
    await taskCard.getByRole('button', { name: 'Mark as Complete' }).click();
    await expect(volunteer.page.getByRole('alert')).toContainText('Task submitted for review!', { timeout: 10_000 });

    // Task status changes to 'submitted' on the admin page
    await adminPage.goto(`${BASE_URL}/static/admin/starter-tasks.html`);
    await expect(adminPage.getByRole('heading', { name: 'Starter Tasks', level: 1 })).toBeVisible({ timeout: 10_000 });
    const adminTaskCard = adminPage.locator('.card').filter({ hasText: taskTitle });
    await expect(adminTaskCard.locator('.status-badge')).toContainText('submitted', { timeout: 10_000 });

    // Admin receives a notification (admins are also volunteers and can view their dashboard)
    await adminPage.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(adminPage.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await adminPage.getByRole('button', { name: /^Notifications/ }).click();
    await expect(
      adminPage.locator('strong').filter({ hasText: `${volunteer.name} submitted:` })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Admin reviews a starter task as excellent; task becomes completed and a skill endorsement is auto-created for the volunteer', async ({ adminPage, volunteer }) => {
    const skill = await createSkill(adminPage);
    const taskTitle = await createOpenStarterTask(adminPage, skill);
    await assignStarterTask(adminPage, taskTitle, volunteer.name);
    await submitStarterTask(volunteer.page, taskTitle);

    // Admin opens the review modal
    await adminPage.goto(`${BASE_URL}/static/admin/starter-tasks.html`);
    await expect(adminPage.getByRole('heading', { name: 'Starter Tasks', level: 1 })).toBeVisible({ timeout: 10_000 });

    const taskCard = adminPage.locator('.card').filter({ hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 10_000 });
    await taskCard.locator('.card-header').click();
    await expect(taskCard.getByRole('button', { name: 'Review' })).toBeVisible({ timeout: 10_000 });
    await taskCard.getByRole('button', { name: 'Review' }).click();

    const reviewDialog = adminPage.getByRole('dialog', { name: 'Review Task' });
    await expect(reviewDialog).toBeVisible({ timeout: 10_000 });
    await reviewDialog.getByRole('radio', { name: /Excellent/ }).click();
    await reviewDialog.getByLabel("Feedback to Volunteer (they'll see this)").fill('Great work!');
    await reviewDialog.getByRole('button', { name: 'Submit Review' }).click();

    await expect(adminPage.getByRole('alert')).toContainText('Task reviewed!', { timeout: 10_000 });

    // Task status becomes 'completed'
    await expect(taskCard.locator('.status-badge')).toContainText('completed', { timeout: 10_000 });

    // Volunteer receives a feedback notification
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(
      volunteer.page.locator('strong').filter({ hasText: 'Your starter task was reviewed' })
    ).toBeVisible({ timeout: 10_000 });

    // Skill endorsement is auto-created; navigate to admin volunteer detail via the task card link
    await taskCard.getByRole('link', { name: volunteer.name }).click();
    await expect(adminPage.getByRole('heading', { name: 'Verified Skills (Endorsed)', level: 3 })).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.locator('#endorsements')).toContainText(skill.name, { timeout: 10_000 });
  });

  test('Admin reviews a starter task as needs_improvement; task becomes reviewed and no skill endorsement is created', async ({ adminPage, volunteer }) => {
    const skill = await createSkill(adminPage);
    const taskTitle = await createOpenStarterTask(adminPage, skill);
    await assignStarterTask(adminPage, taskTitle, volunteer.name);
    await submitStarterTask(volunteer.page, taskTitle);

    // Admin opens the review modal
    await adminPage.goto(`${BASE_URL}/static/admin/starter-tasks.html`);
    await expect(adminPage.getByRole('heading', { name: 'Starter Tasks', level: 1 })).toBeVisible({ timeout: 10_000 });

    const taskCard = adminPage.locator('.card').filter({ hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 10_000 });
    await taskCard.locator('.card-header').click();
    await expect(taskCard.getByRole('button', { name: 'Review' })).toBeVisible({ timeout: 10_000 });
    await taskCard.getByRole('button', { name: 'Review' }).click();

    const reviewDialog = adminPage.getByRole('dialog', { name: 'Review Task' });
    await expect(reviewDialog).toBeVisible({ timeout: 10_000 });
    await reviewDialog.getByRole('radio', { name: /Needs improvement/ }).click();
    await reviewDialog.getByLabel("Feedback to Volunteer (they'll see this)").fill('Please try again.');
    await reviewDialog.getByRole('button', { name: 'Submit Review' }).click();

    await expect(adminPage.getByRole('alert')).toContainText('Task reviewed!', { timeout: 10_000 });

    // Task status becomes 'reviewed'
    await expect(taskCard.locator('.status-badge')).toContainText('reviewed', { timeout: 10_000 });

    // Volunteer receives a feedback notification
    await volunteer.page.goto(`${BASE_URL}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(
      volunteer.page.locator('strong').filter({ hasText: 'Your starter task was reviewed' })
    ).toBeVisible({ timeout: 10_000 });

    // No skill endorsement created; navigate to admin volunteer detail to confirm
    await taskCard.getByRole('link', { name: volunteer.name }).click();
    await expect(adminPage.getByRole('heading', { name: 'Verified Skills (Endorsed)', level: 3 })).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.locator('#endorsements')).not.toContainText(skill.name, { timeout: 10_000 });
  });
});
