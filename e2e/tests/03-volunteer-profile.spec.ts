import crypto from 'crypto';
import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import { signup } from '../actions/auth';
import { Page } from '@playwright/test';

async function getVolunteerId(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const token = localStorage.getItem('authToken');
    const resp = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return (await resp.json()).id;
  });
}

test.describe('Volunteer Profile', () => {
  test('Volunteer updates their profile', async ({ volunteer }) => {
    const uniqueName = `Profile Test ${Date.now()}`;

    await volunteer.page.goto(`${BASE_URL}/static/profile.html`);
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByLabel('Your Name').fill(uniqueName);
    await volunteer.page.getByLabel('About You').fill('Bio text for e2e test');
    await volunteer.page.getByLabel('Location').fill('Test City');
    await volunteer.page.getByLabel('Hours per Week').fill('10');
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByRole('alert')).toContainText('Profile updated!');

    const volunteerId = await getVolunteerId(volunteer.page);
    await volunteer.page.goto(`${BASE_URL}/static/volunteer.html?id=${volunteerId}`);
    await expect(volunteer.page.locator('#profileContent')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.locator('#volunteerName')).toContainText(uniqueName);
    await expect(volunteer.page.locator('#volunteerBio')).toContainText('Bio text for e2e test');
    await expect(volunteer.page.locator('#availabilityText')).toContainText('10 hours/week');
  });

  test('Volunteer adds skills to their profile', async ({ volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/profile.html`);
    await expect(volunteer.page.locator('.skill-option').first()).toBeVisible({ timeout: 10_000 });

    const firstSkill = volunteer.page.locator('.skill-option').first();
    await firstSkill.click();
    const skillName = (await firstSkill.innerText()).trim();

    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByRole('alert')).toContainText('Profile updated!');

    const volunteerId = await getVolunteerId(volunteer.page);
    await volunteer.page.goto(`${BASE_URL}/static/volunteer.html?id=${volunteerId}`);
    await expect(volunteer.page.locator('#profileContent')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.locator('#volunteerSkills')).toContainText(skillName);
  });

  test('Volunteer sets profile visibility to hidden', async ({ volunteer }) => {
    const uniqueName = `Hidden Vol ${Date.now()}`;

    // First make the volunteer visible so we can confirm the transition
    await volunteer.page.goto(`${BASE_URL}/static/profile.html`);
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByLabel('Your Name').fill(uniqueName);
    await volunteer.page.locator('#profile_visible').check();
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    await volunteer.page.goto(`${BASE_URL}/static/volunteers.html`);
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByLabel('Search').fill(uniqueName);
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName })
    ).toBeVisible({ timeout: 10_000 });

    // Now hide the profile
    await volunteer.page.goto(`${BASE_URL}/static/profile.html`);
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 });
    await volunteer.page.locator('#profile_visible').uncheck();
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    await volunteer.page.goto(`${BASE_URL}/static/volunteers.html`);
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByLabel('Search').fill(uniqueName);
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName })
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test('Volunteer sets profile visibility to visible', async ({ volunteer }) => {
    const uniqueName = `Visible Vol ${Date.now()}`;

    // First hide the volunteer so we can confirm the transition
    await volunteer.page.goto(`${BASE_URL}/static/profile.html`);
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByLabel('Your Name').fill(uniqueName);
    await volunteer.page.locator('#profile_visible').uncheck();
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    await volunteer.page.goto(`${BASE_URL}/static/volunteers.html`);
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByLabel('Search').fill(uniqueName);
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName })
    ).not.toBeVisible({ timeout: 10_000 });

    // Now make the profile visible
    await volunteer.page.goto(`${BASE_URL}/static/profile.html`);
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 });
    await volunteer.page.locator('#profile_visible').check();
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    await volunteer.page.goto(`${BASE_URL}/static/volunteers.html`);
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({ timeout: 10_000 });
    await volunteer.page.getByLabel('Search').fill(uniqueName);
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Volunteer updates email digest preference', async ({ volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/profile.html`);
    await expect(volunteer.page.locator('#email_digest')).toBeVisible({ timeout: 10_000 });

    await volunteer.page.selectOption('#email_digest', 'fortnightly');
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(volunteer.page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.getByRole('alert')).toContainText('Profile updated!');

    await volunteer.page.reload();
    await expect(volunteer.page.locator('#email_digest')).toBeVisible({ timeout: 10_000 });
    await expect(volunteer.page.locator('#email_digest')).toHaveValue('fortnightly');
  });

  test("Volunteer views another volunteer's public profile", async ({ browser, volunteer }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const vol2Name = `Second Vol ${id}`;
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();

    try {
      await signup(page2, vol2Name, `vol2_${id}@test.com`, 'testpassword1');

      // Set up profile with a skill and profile_visible=true
      await page2.goto(`${BASE_URL}/static/profile.html`);
      await expect(page2.locator('.skill-option').first()).toBeVisible({ timeout: 10_000 });
      await page2.locator('.skill-option').first().click();
      const skillName = (await page2.locator('.skill-option').first().innerText()).trim();
      await page2.locator('#profile_visible').check();
      await page2.getByRole('button', { name: 'Save Changes' }).click();
      await expect(page2.getByRole('alert')).toBeVisible({ timeout: 10_000 });

      const vol2Id = await getVolunteerId(page2);

      // View the second volunteer's profile as the first volunteer
      await volunteer.page.goto(`${BASE_URL}/static/volunteer.html?id=${vol2Id}`);
      await expect(volunteer.page.locator('#profileContent')).toBeVisible({ timeout: 10_000 });

      await expect(volunteer.page.locator('#volunteerName')).toContainText(vol2Name);
      await expect(volunteer.page.locator('#volunteerSkills')).toContainText(skillName);
      // Endorsements section only appears if there are endorsements; not present for fresh volunteer
      await expect(volunteer.page.locator('#endorsementsSection')).not.toBeVisible();
      // Contact info not shown because share_contact_directly defaults to false
      await expect(volunteer.page.locator('#contactInfo')).not.toBeVisible();
    } finally {
      await ctx2.close();
    }
  });
});
