import crypto from 'crypto';
import { readFileSync } from 'fs';
import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import { signup } from '../actions/auth';

test.describe('GDPR & Privacy', () => {
  test('Volunteer exports their personal data', async ({ volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/privacy.html`);
    await expect(
      volunteer.page.getByRole('heading', { name: 'Export Your Data' })
    ).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      volunteer.page.waitForEvent('download'),
      volunteer.page.getByRole('button', { name: 'Download My Data' }).click(),
    ]);

    await expect(volunteer.page.getByRole('alert')).toContainText(
      'Data exported successfully!',
      { timeout: 10_000 }
    );

    const filePath = await download.path();
    expect(filePath).not.toBeNull();

    const data = JSON.parse(readFileSync(filePath!, 'utf8'));
    expect(data).toHaveProperty('profile');
    expect(data).toHaveProperty('skills');
    expect(data).toHaveProperty('interests');
    expect(data).toHaveProperty('messages_sent');
    expect(data).toHaveProperty('messages_received');
  });

  test('Volunteer with contact sharing disabled does not expose contact handles', async ({ volunteer, browser }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const vol2Name = `Private Vol ${id}`;
    const discordHandle = `privdiscord_${id}`;
    const signalNumber = `+4400${id.slice(0, 6)}`;
    const whatsappNumber = `+4500${id.slice(0, 6)}`;

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();

    try {
      await signup(page2, vol2Name, `privvol_${id}@test.com`, 'testpassword1');

      await page2.goto(`${BASE_URL}/static/profile.html`);
      await expect(page2.getByLabel('Discord Handle')).toBeVisible({ timeout: 10_000 });

      await page2.getByLabel('Discord Handle').fill(discordHandle);
      await page2.getByLabel('Signal').fill(signalNumber);
      await page2.getByLabel('WhatsApp').fill(whatsappNumber);

      // Ensure profile is publicly visible
      await page2.getByLabel(/Make my profile visible/).check();
      // Keep share_contact_directly unchecked (contact sharing disabled — this is the default)
      await expect(page2.getByLabel(/Share my contact info directly/)).not.toBeChecked();

      await page2.getByRole('button', { name: 'Save Changes' }).click();
      await expect(page2.getByRole('alert')).toContainText('Profile updated!', { timeout: 10_000 });

      // Navigate to vol2's public profile via the volunteers directory
      await volunteer.page.goto(`${BASE_URL}/static/volunteers.html`);
      await volunteer.page.getByLabel('Search').fill(vol2Name);
      await volunteer.page.getByRole('link', { name: vol2Name }).click();

      await expect(
        volunteer.page.getByRole('heading', { name: vol2Name, level: 1 })
      ).toBeVisible({ timeout: 10_000 });

      // None of vol2's contact handles should be visible on the page
      await expect(volunteer.page.getByText(discordHandle)).not.toBeVisible();
      await expect(volunteer.page.getByText(signalNumber)).not.toBeVisible();
      await expect(volunteer.page.getByText(whatsappNumber)).not.toBeVisible();
    } finally {
      await ctx2.close();
    }
  });
});
