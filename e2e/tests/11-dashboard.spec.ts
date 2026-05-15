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

const unreadNotificationCount = (page: Page) =>
  page
    .locator('.card')
    .filter({ has: page.getByText('Unread Notifications', { exact: true }) })
    .locator('.stat-number')

test.describe('Dashboard', () => {
  test('Volunteer views their dashboard', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/dashboard`)
    await expect(volunteer.page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({
      timeout: 10_000,
    })

    // Owned Projects tab is active by default
    await expect(volunteer.page.getByRole('tab', { name: 'Owned Projects' })).toHaveClass(/\bactive\b/)

    // Interested Projects tab
    await volunteer.page.getByRole('tab', { name: 'Interested Projects' }).click()
    await expect(volunteer.page.getByRole('tab', { name: 'Interested Projects' })).toHaveClass(
      /\bactive\b/,
    )

    // Suggested for You tab
    await volunteer.page.getByRole('tab', { name: 'Suggested for You' }).click()
    await expect(volunteer.page.getByRole('tab', { name: 'Suggested for You' })).toHaveClass(
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
    await expect(unreadNotificationCount(volunteer.page)).not.toHaveText('0')
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
    await expect(unreadNotificationCount(volunteer.page)).toHaveText('0', { timeout: 10_000 })
    await expect(volunteer.page.getByRole('button', { name: 'Mark all as read' })).not.toBeVisible({
      timeout: 10_000,
    })
  })
})
