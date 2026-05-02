import { test, expect } from '../fixtures';
import { adminCreateProject } from '../actions/projects';

// Both the project list (index.html) and individual project pages redirect unauthenticated
// visitors to /static/login.html via `if (!currentUser) { window.location.href = ... }`.
// There is no public / unauthenticated view of projects.
test.skip('Visitor browses the project list unauthenticated', async () => {});
test.skip('Visitor views a project detail page unauthenticated', async () => {});

test.describe('Project Discovery', () => {
  test('Volunteer searches projects by keyword', async ({ adminPage, volunteer, baseUrl }) => {
    const keyword = `E2ESearch${Date.now()}`;
    const title = `${keyword} Project`;
    await adminCreateProject(baseUrl, adminPage, title, 'A searchable project for discovery tests');

    await volunteer.page.goto(`${baseUrl}/static/index.html`);
    await expect(volunteer.page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByLabel('Search').fill(keyword);
    // Debounce is 300 ms; wait for the result to arrive
    await expect(volunteer.page.getByRole('link', { name: title })).toBeVisible({ timeout: 5_000 });
  });

  test('Volunteer filters projects by "Seeking Help" status', async ({ adminPage, volunteer, baseUrl }) => {
    const title = `E2E Discovery Seeking ${Date.now()}`;
    // Admin-created projects have is_seeking_help = true by default
    await adminCreateProject(baseUrl, adminPage, title, 'Project for seeking-filter discovery test');

    await volunteer.page.goto(`${baseUrl}/static/index.html`);
    await expect(volunteer.page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible({ timeout: 10_000 });

    await volunteer.page.getByRole('button', { name: 'Needs filter' }).click();
    await volunteer.page.getByRole('option', { name: 'Seeking Help' }).click();

    await expect(volunteer.page.getByRole('link', { name: title })).toBeVisible({ timeout: 5_000 });
  });
});
