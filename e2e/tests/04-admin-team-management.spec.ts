import crypto from 'crypto';
import { test, expect } from '../fixtures';
import { BASE_URL, ADMIN_EMAIL } from '../config';
import { signup } from '../actions/auth';
import { Page } from '@playwright/test';

async function createAdminInvite(adminPage: Page, email: string): Promise<string> {
  const data: { _dev_invite_token?: string } = await adminPage.evaluate(async (inviteEmail: string) => {
    const token = localStorage.getItem('authToken');
    const resp = await fetch('/api/admin/admins/invite', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: inviteEmail }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }, email);
  if (!data._dev_invite_token) throw new Error('No dev invite token in response');
  return data._dev_invite_token;
}

async function getMe(page: Page): Promise<{ id: number; is_admin: boolean }> {
  return page.evaluate(async () => {
    const token = localStorage.getItem('authToken');
    const resp = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return resp.json();
  });
}

test.describe('Admin: Admin Team Management', () => {
  test('Admin views the list of current admins', async ({ adminPage }) => {
    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    const adminList = adminPage.locator('#adminList');
    await expect(adminList).toContainText(ADMIN_EMAIL, { timeout: 10_000 });
  });

  test('Admin invites a new admin by email', async ({ adminPage }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const inviteEmail = `invite_${id}@test.com`;

    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    await expect(adminPage.getByRole('button', { name: 'Invite Admin' })).toBeVisible({ timeout: 10_000 });

    await adminPage.getByRole('button', { name: 'Invite Admin' }).click();
    const inviteDialog = adminPage.getByRole('dialog', { name: 'Invite Admin' });
    await expect(inviteDialog).toBeVisible({ timeout: 5_000 });
    await adminPage.getByLabel('Email Address').fill(inviteEmail);
    await adminPage.getByRole('button', { name: 'Send Invite' }).click();

    await expect(inviteDialog.getByRole('status')).toBeVisible({ timeout: 10_000 });
  });

  test('Admin views pending invites', async ({ adminPage }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const inviteEmail = `invite_${id}@test.com`;

    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    await createAdminInvite(adminPage, inviteEmail);

    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    await adminPage.getByRole('button', { name: 'Pending Invites' }).click();

    await expect(adminPage.locator('#inviteList')).toContainText(inviteEmail, { timeout: 10_000 });
  });

  test('Admin revokes a pending invite', async ({ adminPage }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const inviteEmail = `invite_${id}@test.com`;

    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    await createAdminInvite(adminPage, inviteEmail);

    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    await adminPage.getByRole('button', { name: 'Pending Invites' }).click();

    const inviteCard = adminPage.locator('#inviteList .card').filter({ hasText: inviteEmail });
    await expect(inviteCard).toBeVisible({ timeout: 10_000 });
    await inviteCard.getByRole('button', { name: 'Cancel' }).click();

    await expect(adminPage.getByRole('alert')).toContainText('Invite cancelled', { timeout: 10_000 });
    await expect(inviteCard).not.toBeVisible({ timeout: 10_000 });
  });

  test('New user accepts an admin invite link', async ({ adminPage, browser }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const inviteEmail = `new_admin_${id}@test.com`;

    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    const token = await createAdminInvite(adminPage, inviteEmail);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE_URL}/static/accept-invite.html?token=${token}`);
      await expect(page.getByRole('heading', { name: 'Admin Invite' })).toBeVisible({ timeout: 10_000 });

      // Clear the pending invite token stored by accept-invite.html so signup
      // redirects to dashboard instead of back to accept-invite
      await page.evaluate(() => localStorage.removeItem('pendingAdminInvite'));

      // Signing up with the invited email auto-accepts the invite server-side
      await signup(page, `New Admin ${id}`, inviteEmail, 'testpassword1');

      const me = await getMe(page);
      expect(me.is_admin).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test('Existing user accepts an admin invite', async ({ adminPage, volunteer }) => {
    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    const token = await createAdminInvite(adminPage, volunteer.email);

    await volunteer.page.goto(`${BASE_URL}/static/accept-invite.html?token=${token}`);
    await expect(volunteer.page.getByRole('heading', { name: 'Welcome to the Team!' })).toBeVisible({ timeout: 10_000 });

    const me = await getMe(volunteer.page);
    expect(me.is_admin).toBeTruthy();
  });

  test("Admin revokes another admin's access", async ({ adminPage, volunteer }) => {
    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    const token = await createAdminInvite(adminPage, volunteer.email);

    // Accept invite as the volunteer directly via API
    await volunteer.page.evaluate(async (inviteToken: string) => {
      const authToken = localStorage.getItem('authToken');
      const resp = await fetch(`/api/admin/admins/accept-invite?invite_token=${inviteToken}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
    }, token);

    // Reload team page to see updated admin list
    await adminPage.goto(`${BASE_URL}/static/admin/team.html`);
    const adminCard = adminPage.locator('#adminList .card').filter({ hasText: volunteer.email });
    await expect(adminCard).toBeVisible({ timeout: 10_000 });

    adminPage.once('dialog', dialog => dialog.accept());
    await adminCard.getByRole('button', { name: 'Revoke Access' }).click();

    await expect(adminPage.getByRole('alert')).toContainText('Admin access revoked', { timeout: 10_000 });
    await expect(adminCard).not.toBeVisible({ timeout: 10_000 });

    // Volunteer should no longer have admin access
    const status = await volunteer.page.evaluate(async () => {
      const authToken = localStorage.getItem('authToken');
      const resp = await fetch('/api/admin/triage', {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return resp.status;
    });
    expect(status).toBe(403);
  });
});
