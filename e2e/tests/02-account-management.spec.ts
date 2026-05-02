import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import { login } from '../actions/auth';

test.describe('Account Management', () => {
  test('Volunteer changes their password', async ({ browser, volunteer }) => {
    const newPassword = 'newpassword1';

    await volunteer.page.goto(`${BASE_URL}/static/settings.html`);
    await expect(volunteer.page.getByRole('heading', { name: 'Change Password' })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByLabel('Current Password').fill(volunteer.password);
    await volunteer.page.getByLabel('New Password', { exact: true }).fill(newPassword);
    await volunteer.page.getByLabel('Confirm New Password').fill(newPassword);
    await volunteer.page.getByRole('button', { name: 'Change Password' }).click();

    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByRole('alert')).toContainText('successfully');

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    try {
      await login(page2, volunteer.email, newPassword);
      await expect(page2).toHaveURL(`${BASE_URL}/static/dashboard.html`);
    } finally {
      await ctx2.close();
    }
  });

  test('Change password fails with wrong current password', async ({ volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/settings.html`);
    await expect(volunteer.page.getByRole('heading', { name: 'Change Password' })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByLabel('Current Password').fill('wrongpassword123');
    await volunteer.page.getByLabel('New Password', { exact: true }).fill('newpassword1');
    await volunteer.page.getByLabel('Confirm New Password').fill('newpassword1');
    await volunteer.page.getByRole('button', { name: 'Change Password' }).click();

    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByRole('alert')).not.toContainText('successfully');
  });

  test('Volunteer deletes their account', async ({ browser, volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/settings.html`);
    await expect(volunteer.page.getByRole('button', { name: 'Delete My Account' })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByRole('button', { name: 'Delete My Account' }).click();
    await expect(volunteer.page.locator('#deleteModal')).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByLabel('Enter your password').fill(volunteer.password);
    await volunteer.page.getByLabel('Confirm your password').fill(volunteer.password);
    await volunteer.page.getByRole('button', { name: 'Permanently Delete Account' }).click();

    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    try {
      await page2.goto(`${BASE_URL}/static/login.html`);
      await page2.getByLabel('Email', { exact: true }).fill(volunteer.email);
      await page2.getByLabel('Password').fill(volunteer.password);
      await page2.getByRole('button', { name: 'Login' }).click();
      await expect(page2.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx2.close();
    }
  });
});
