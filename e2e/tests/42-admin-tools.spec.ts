import { test, expect, getAlert, readAdminToken } from '../fixtures'
import { fake } from '../fake'
import { createApiClient } from '../client'

test.describe('Cron job runs', () => {
  test('Super admin runs a job by hand and reads its record', async ({
    adminPage,
    baseUrl,
    snap,
  }) => {
    await adminPage.goto(`${baseUrl}/admin/cron-runs`)
    await expect(adminPage.getByRole('heading', { name: 'Cron Job Runs' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(adminPage.getByText('No cron job runs recorded yet.')).toBeVisible()
    await snap(adminPage, 'no runs yet')

    // The digest is idempotent, and with nobody subscribed it has nothing to send.
    const digestCard = adminPage
      .locator('div')
      .filter({ has: adminPage.getByText('digest', { exact: true }) })
      .filter({ has: adminPage.getByRole('button', { name: 'Run now' }) })
      .last()
    await digestCard.getByRole('button', { name: 'Run now' }).click()

    const row = adminPage.locator('tbody tr').filter({ hasText: 'digest' }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText('admin')
    await expect(row).toContainText(/success|failed/)

    await row.click()
    const dialog = adminPage.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Triggered by: admin')
    await snap(adminPage, 'run detail')
  })

  test('A plain volunteer is sent away from the cron page', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/admin/cron-runs`)
    await expect(volunteer.page).toHaveURL(/\/projects$/, { timeout: 10_000 })
  })
})

test.describe('Email previews', () => {
  test('Admin sees every transactional email rendered with sample data', async ({
    adminPage,
    baseUrl,
  }) => {
    await adminPage.goto(`${baseUrl}/admin/email-preview`)
    await expect(adminPage.getByRole('heading', { name: 'Email Previews' })).toBeVisible({
      timeout: 10_000,
    })
    const welcome = adminPage
      .locator('section')
      .filter({ has: adminPage.getByRole('heading', { name: 'Welcome and Confirm Email' }) })
    await expect(welcome.getByText(/^Subject:/)).toBeVisible({ timeout: 15_000 })
    await expect(welcome.locator('iframe')).toBeVisible()
    // Every preview has arrived once no row still says it is loading.
    await expect(adminPage.getByText('Loading…')).toHaveCount(0, { timeout: 20_000 })
  })
})

test.describe('Roadmap', () => {
  test('The roadmap places a dated project and hides it when its status is filtered out', async ({
    adminPage,
    baseUrl,
    snap,
  }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl)!)
    const title = fake.projectTitle()
    const created = await api.admin.projects.create({
      body: {
        title,
        description: 'Roadmap fixture with a start date',
        projectType: null,
        estimatedDuration: null,
        timeCommitmentHoursPerWeek: null,
        urgency: 'medium',
        collaborationLink: null,
        country: null,
        localGroup: null,
        remoteEligibility: 'NONE',
        isSeekingHelp: false,
        skillIds: [],
        skillRequiredMap: {},
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        tasks: [{ title: 'Seed task' }],
      },
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)

    await adminPage.goto(`${baseUrl}/projects/gantt`)
    await expect(adminPage.getByRole('heading', { name: 'Roadmap' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      adminPage.getByRole('button', { name: new RegExp(`^${escapeRegExp(title)}`) }),
    ).toBeVisible({
      timeout: 10_000,
    })
    await snap(adminPage, 'project placed')

    // Nothing selected means the defaults, so narrow to one status the project isn't in.
    await adminPage.getByRole('button', { name: 'Completed', exact: true }).click()
    for (const label of ['Ready', 'In progress', 'On hold']) {
      await adminPage.getByRole('button', { name: label, exact: true }).click()
    }
    await expect(
      adminPage.getByText('No projects with a schedule match these filters'),
    ).toBeVisible({
      timeout: 10_000,
    })
  })
})

test.describe('Template from scratch', () => {
  test('Admin builds a template with two dependent tasks and lands on its instantiation', async ({
    adminPage,
    baseUrl,
    snap,
  }) => {
    await adminPage.goto(`${baseUrl}/templates/new`)
    await expect(adminPage.getByRole('heading', { name: 'New template' })).toBeVisible({
      timeout: 10_000,
    })
    const create = adminPage.getByRole('button', { name: 'Create template' })
    await expect(create).toBeDisabled()

    const title = `${fake.projectTitle()} template`
    await adminPage.getByLabel('Template title').fill(title)
    await adminPage.getByLabel('Description').fill('A reusable structure built in an e2e test.')
    await adminPage.getByPlaceholder('Task title').first().fill('Draft the plan')
    await adminPage.getByPlaceholder('Duration (days)').first().fill('3')
    await adminPage.getByRole('button', { name: 'Add task' }).click()
    await adminPage.getByPlaceholder('Task title').nth(1).fill('Review the plan')
    await adminPage.getByPlaceholder('Days after project start').nth(1).fill('3')
    await adminPage.getByRole('checkbox', { name: 'Draft the plan' }).check()
    await snap(adminPage, 'two tasks, one dependency')

    await expect(create).toBeEnabled()
    await create.click()
    await expect(getAlert(adminPage)).toContainText('Template created', { timeout: 10_000 })
    await expect(adminPage).toHaveURL(/\/templates$/, { timeout: 10_000 })
    await expect(adminPage.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
  })

  test('A volunteer cannot open the template builder', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/templates/new`)
    await expect(volunteer.page).toHaveURL(/\/projects$/, { timeout: 10_000 })
  })
})

test.describe('Local group page', () => {
  test('A volunteer adopts a local group from its page and sees it in settings', async ({
    volunteer,
    baseUrl,
    snap,
  }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl)!)
    const name = `${fake.localGroupName()} ${fake.skillName()}`
    const created = await api.admin.localGroups.create({ body: { name, country: 'UK' } })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    const { id } = created.body as { id: number }

    await volunteer.page.goto(`${baseUrl}/local-groups/${id}`)
    await expect(volunteer.page.getByRole('heading', { name, level: 1 })).toBeVisible({
      timeout: 10_000,
    })
    await snap(volunteer.page, 'offer to adopt')
    await volunteer.page.getByRole('button', { name: 'Set as my local group' }).click()
    await expect(volunteer.page).toHaveURL(/\/settings/, { timeout: 10_000 })
    await expect(volunteer.page.getByRole('button', { name: 'Select local group' })).toContainText(
      name,
      { timeout: 10_000 },
    )
  })

  test('An unknown local group says so', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/local-groups/999999`)
    await expect(volunteer.page.getByText('Local group not found.')).toBeVisible({
      timeout: 10_000,
    })
  })
})

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
