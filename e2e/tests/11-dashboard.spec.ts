import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'
import { proposeProject, adminApproveProject } from '../actions/projects'
import { fake } from '../fake'

async function createNotificationForVolunteer(
  baseUrl: string,
  volunteerPage: Page,
  adminPage: Page,
  title: string,
): Promise<void> {
  await proposeProject(
    baseUrl,
    volunteerPage,
    title,
    'Project created for notification e2e testing',
  )
  await adminApproveProject(baseUrl, adminPage, title)
}

const notificationBadge = (page: Page) =>
  page.locator('[data-tab="notifications"] .notification-badge')

test.describe('Dashboard', () => {
  test('Volunteer views their dashboard', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/dashboard`)
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({
      timeout: 10_000,
    })

    // A new volunteer has no projects, applications or unread notifications, so the
    // dashboard opens on suggestions.
    await expect(volunteer.page.getByRole('tab', { name: 'Suggested for You' })).toHaveClass(
      /\bactive\b/,
    )

    await volunteer.page.getByRole('tab', { name: 'My projects' }).click()
    await expect(volunteer.page.getByRole('tab', { name: 'My projects' })).toHaveClass(/\bactive\b/)

    await volunteer.page.getByRole('tab', { name: 'Applications' }).click()
    await expect(volunteer.page.getByRole('tab', { name: 'Applications' })).toHaveClass(
      /\bactive\b/,
    )
  })

  test('Dashboard shows unread notification badge', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.projectTitle()
    await createNotificationForVolunteer(baseUrl, volunteer.page, adminPage, title)

    await volunteer.page.goto(`${baseUrl}/dashboard`)
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({
      timeout: 10_000,
    })

    await expect(notificationBadge(volunteer.page)).toBeVisible({ timeout: 10_000 })
  })

  test('Volunteer marks all notifications as read', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.projectTitle()
    await createNotificationForVolunteer(baseUrl, volunteer.page, adminPage, title)

    await volunteer.page.goto(`${baseUrl}/dashboard`)
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({
      timeout: 10_000,
    })
    await expect(notificationBadge(volunteer.page)).toBeVisible({ timeout: 10_000 })

    await volunteer.page.getByRole('tab', { name: /^Notifications/ }).click()
    await expect(volunteer.page.getByRole('tab', { name: /^Notifications/ })).toHaveClass(
      /\bactive\b/,
    )
    await expect(volunteer.page.getByRole('button', { name: 'Mark all as read' })).toBeVisible({
      timeout: 10_000,
    })

    await volunteer.page.getByRole('button', { name: 'Mark all as read' }).click()

    await expect(notificationBadge(volunteer.page)).not.toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.getByRole('button', { name: 'Mark all as read' })).not.toBeVisible({
      timeout: 10_000,
    })
  })
})
