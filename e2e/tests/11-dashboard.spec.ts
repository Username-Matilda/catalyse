import { test, expect, createApprovedVolunteerNamed } from '../fixtures'
import { adminCreateProjectViaApi, transferProjectOwnership } from '../actions/projects'
import { homeHeading } from '../actions/dashboard'
import { createApiClient } from '../client'
import { fake } from '../fake'

test.describe('Home', () => {
  test('A new volunteer sees what to do first, with Find open', async ({ volunteer, baseUrl }) => {
    const page = volunteer.page
    await page.goto(`${baseUrl}/dashboard`)
    await expect(homeHeading(page)).toBeVisible({ timeout: 10_000 })

    await expect(page.getByRole('region', { name: 'Getting started' })).toBeVisible()
    await expect(page.getByText('Nothing is waiting on you right now.')).toBeVisible()
    // Nothing of their own yet, so discovery is open.
    await expect(page.getByRole('button', { name: /Find something to do/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    const work = page.getByRole('region', { name: 'My work' })
    await work.getByRole('button', { name: 'Projects' }).click()
    await expect(work.getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('An applicant waiting on my project needs my attention until I answer', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const projectId = await adminCreateProjectViaApi(baseUrl, title, 'Attention e2e project')
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)

    const applicant = await createApprovedVolunteerNamed(baseUrl, fake.person().name)
    const applicantApi = createApiClient(baseUrl, applicant.token)
    const applied = await applicantApi.projects.expressInterest({
      body: { projectId, interestType: 'want_to_contribute' },
    })
    expect(applied.status).toBe(200)

    const page = volunteer.page
    await page.goto(`${baseUrl}/dashboard`)
    const attention = page.getByRole('region', { name: /Needs your attention/ })
    const item = attention.getByRole('listitem').filter({ hasText: title })
    await expect(item).toContainText(`${applicant.name} wants to help`, { timeout: 10_000 })
    // Find is folded: the owner has work of their own.
    await expect(page.getByRole('button', { name: /Find something to do/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(
      page.getByRole('region', { name: 'My work' }).getByRole('link', { name: title }),
    ).toBeVisible()

    await item.getByRole('link', { name: /^Review:/ }).click()
    await expect(page).toHaveURL(`${baseUrl}/projects/${projectId}`)

    // Once answered, it leaves Home.
    const ownerApi = createApiClient(
      baseUrl,
      await page.evaluate(() => localStorage.getItem('authToken')),
    )
    const project = await ownerApi.projects.getById({ body: { id: projectId } })
    const interestId = (project.body as { interests: { id: number }[] }).interests[0].id
    const answered = await ownerApi.projects.respondToInterest({
      body: { projectId, interestId, status: 'accepted' },
    })
    expect(answered.status).toBe(200)
    await page.goto(`${baseUrl}/dashboard`)
    await expect(homeHeading(page)).toBeVisible({ timeout: 10_000 })
    await expect(attention.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)
  })
})
