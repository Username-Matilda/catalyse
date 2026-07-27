import type { Browser } from '@playwright/test'
import { test, expect, createPendingVolunteer } from '../fixtures'
import { adminCreateProject } from '../actions/projects'
import { fake } from '../fake'

// Both the project list and individual project pages redirect unauthenticated
// visitors to /login via `useRequireApproved`. There is no public / unauthenticated
// view of projects — the underlying oRPC procedures require an approved, logged-in
// volunteer too.
test.describe('Unauthenticated Project Access', () => {
  test('Visitor browses the project list unauthenticated', async ({ page, baseUrl }) => {
    await page.goto(`${baseUrl}/`)
    await page.waitForURL(`${baseUrl}/login**`, { timeout: 10_000 })
  })

  test('Visitor views a project detail page unauthenticated', async ({
    page,
    adminPage,
    baseUrl,
  }) => {
    const projectId = await adminCreateProject(
      baseUrl,
      adminPage,
      fake.projectTitle(),
      'A project for the unauthenticated access test',
    )

    await page.goto(`${baseUrl}/projects/${projectId}`)
    await page.waitForURL(`${baseUrl}/login**`, { timeout: 10_000 })
  })
})

// Unapproved volunteers can log in and reach their dashboard, but browsing projects
// is gated behind approval — `useRequireApproved` bounces them back to /dashboard.
test.describe('Pending Volunteer Project Access', () => {
  async function pendingVolunteerPage(browser: Browser, baseUrl: string) {
    const pending = await createPendingVolunteer(baseUrl)
    const context = await browser.newContext()
    await context.addInitScript((token: string) => {
      localStorage.setItem('authToken', token)
    }, pending.token)
    const page = await context.newPage()
    return { page, context }
  }

  test('Pending volunteer is redirected away from the project list', async ({
    browser,
    baseUrl,
  }) => {
    const { page, context } = await pendingVolunteerPage(browser, baseUrl)

    await page.goto(`${baseUrl}/`)
    await page.waitForURL(`${baseUrl}/dashboard**`, { timeout: 10_000 })

    await context.close()
  })

  test('Pending volunteer is redirected away from a project detail page', async ({
    browser,
    adminPage,
    baseUrl,
  }) => {
    const projectId = await adminCreateProject(
      baseUrl,
      adminPage,
      fake.projectTitle(),
      'A project for the pending-volunteer access test',
    )
    const { page, context } = await pendingVolunteerPage(browser, baseUrl)

    await page.goto(`${baseUrl}/projects/${projectId}`)
    await page.waitForURL(`${baseUrl}/dashboard**`, { timeout: 10_000 })

    await context.close()
  })
})

test.describe('Project Discovery', () => {
  test('Volunteer searches projects by keyword', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.projectTitle()
    await adminCreateProject(baseUrl, adminPage, title, 'A searchable project for discovery tests')

    await volunteer.page.goto(`${baseUrl}/`)
    await expect(
      volunteer.page.getByRole('heading', { name: 'Projects', exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    await volunteer.page.getByLabel('Search').fill(title)
    // Debounce is 300 ms; wait for the result to arrive
    await expect(volunteer.page.getByRole('link', { name: title })).toBeVisible({ timeout: 5_000 })
  })

  test('Volunteer filters projects by "Seeking Help" status', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    // Admin-created projects have is_seeking_help = true by default
    await adminCreateProject(baseUrl, adminPage, title, 'Project for seeking-filter discovery test')

    await volunteer.page.goto(`${baseUrl}/`)
    await expect(
      volunteer.page.getByRole('heading', { name: 'Projects', exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    await volunteer.page.getByRole('button', { name: 'Needs filter' }).click()
    await volunteer.page.getByRole('option', { name: 'Seeking Help' }).click()

    await expect(volunteer.page.getByRole('link', { name: title })).toBeVisible({ timeout: 5_000 })
  })
})
