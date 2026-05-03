import { test, expect } from '../fixtures';
import crypto from 'crypto';
import { signup } from '../actions/auth';
import { adminCreateProject, transferProjectOwnership } from '../actions/projects';

test.describe('Messaging', () => {
  test('Volunteer sends a contact message to another volunteer', async ({ adminPage, volunteer, browser, baseUrl }) => {
    const ts = Date.now();
    const subject = `E2E Subject ${ts}`;
    const body = `E2E message body ${ts}`;

    const projectId = await adminCreateProject(baseUrl, adminPage, `E2E Contact ${ts}`, 'Project for contact test');
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name);

    const sid = crypto.randomBytes(4).toString('hex');
    const senderSignupResp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Msg Sender ${sid}`, email: `msgsender_${sid}@test.com`, password: 'testpassword1', consent_profile_visible: true, consent_contact_by_owners: true }),
    });
    if (!senderSignupResp.ok) throw new Error(`Sender signup failed: ${await senderSignupResp.text()}`);
    const { auth_token: senderToken } = await senderSignupResp.json();
    const senderCtx = await browser.newContext();
    await senderCtx.addInitScript((token: string) => { localStorage.setItem('authToken', token); }, senderToken);
    const senderPage = await senderCtx.newPage();

    try {
      await senderPage.goto(`${baseUrl}/static/project.html?id=${projectId}`);
      await expect(senderPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

      await senderPage.getByRole('button', { name: 'Contact Owner' }).click();

      // The recipient uses the default share_contact_directly = false, so the relay
      // form appears instead of direct contact details.
      const dialog = senderPage.getByRole('dialog');
      await expect(dialog.getByLabel('Subject')).toBeVisible({ timeout: 10_000 });

      await dialog.getByLabel('Subject').fill(subject);
      await dialog.getByLabel('Message').fill(body);
      await dialog.getByRole('button', { name: 'Send Message' }).click();

      await expect(senderPage.getByRole('alert')).toContainText('Message sent', { timeout: 10_000 });
    } finally {
      await senderCtx.close();
    }
  });

  test('Recipient sees a message notification', async ({ adminPage, volunteer, browser, baseUrl }) => {
    test.setTimeout(60_000);
    const ts = Date.now();
    const subject = `E2E Notify Subject ${ts}`;

    const projectId = await adminCreateProject(baseUrl, adminPage, `E2E Notify ${ts}`, 'Project for notification test');
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name);

    // Confirm the recipient starts with no unread notifications.
    await volunteer.page.goto(`${baseUrl}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    const notifTab = volunteer.page.getByRole('button', { name: /^Notifications/ });
    await expect(notifTab.locator('.notification-badge')).not.toBeVisible();

    // Sender sends the message.
    const senderCtx = await browser.newContext();
    const senderPage = await senderCtx.newPage();
    const sid = crypto.randomBytes(4).toString('hex');
    await signup(baseUrl, senderPage, `Notif Sender ${sid}`, `notifsender_${sid}@test.com`, 'testpassword1');

    try {
      await senderPage.goto(`${baseUrl}/static/project.html?id=${projectId}`);
      await expect(senderPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
      await senderPage.getByRole('button', { name: 'Contact Owner' }).click();
      const dialog = senderPage.getByRole('dialog');
      await expect(dialog.getByLabel('Subject')).toBeVisible({ timeout: 10_000 });
      await dialog.getByLabel('Subject').fill(subject);
      await dialog.getByLabel('Message').fill('Notification test body');
      await dialog.getByRole('button', { name: 'Send Message' }).click();
      await expect(senderPage.getByRole('alert')).toContainText('Message sent', { timeout: 10_000 });
    } finally {
      await senderCtx.close();
    }

    // Recipient refreshes the dashboard — the notification badge now shows 1.
    await volunteer.page.goto(`${baseUrl}/static/dashboard.html`);
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 10_000 });
    const notifTabAfter = volunteer.page.getByRole('button', { name: /^Notifications/ });
    await expect(notifTabAfter.locator('.notification-badge')).toBeVisible({ timeout: 10_000 });
    await expect(notifTabAfter.locator('.notification-badge')).toContainText('1');

    await notifTabAfter.click();
    await expect(volunteer.page.getByText(/Message from /)).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByText(subject)).toBeVisible({ timeout: 10_000 });
    const viewLink = volunteer.page.getByRole('link', { name: 'View' }).first();
    await expect(viewLink).toHaveAttribute('href', '/static/dashboard.html');
  });

  test.skip('Both parties see the message in their history', async () => {
    // Not possible: the /api/messages endpoint exists, but no messages inbox,
    // history view, or tab has been built in the frontend. A real user has no
    // way to browse sent or received messages through the UI.
  });

  test.skip('Volunteer marks a message as read', async () => {
    // Not possible: the /api/messages/{id}/read endpoint exists, but there is no
    // per-message read/unread UI in the frontend. The dashboard "Mark all as read"
    // button marks notifications as read (notifications table), not contact messages
    // (contact_messages.read_at), so there is no user-visible action that fulfils
    // this scenario.
  });
});
