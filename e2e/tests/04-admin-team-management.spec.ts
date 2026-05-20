import { test, expect, getAlert } from '../fixtures'
import { fake } from '../fake'
import { ADMIN_EMAIL } from '../config'
import { signup } from '../actions/auth'
import { Page } from '@playwright/test'
import { createApiClient } from '../client'

async function createAdminInvite(adminPage: Page, baseUrl: string, email: string): Promise<string> {
  const token = await adminPage.evaluate(() => localStorage.getItem('authToken'))
  const api = createApiClient(baseUrl, token)
  const result = await api.admin.admins.invite({ body: { email } })
  if (result.status !== 200) throw new Error(`Invite failed: ${JSON.stringify(result.body)}`)
  const data = result.body as { message: string; _dev_invite_token?: string }
  if (!data._dev_invite_token) throw new Error('No dev invite token in response')
  return data._dev_invite_token
}

async function getMe(page: Page, baseUrl: string): Promise<{ id: number; isAdmin: boolean }> {
  const token = await page.evaluate(() => localStorage.getItem('authToken'))
  const api = createApiClient(baseUrl, token)
  const result = await api.auth.me()
  return result.body as { id: number; isAdmin: boolean }
}

test.describe('Admin: Admin Team Management', () => {
  test('Admin views the list of current admins', async ({ adminPage, baseUrl }) => {
    await adminPage.goto(`${baseUrl}/admin/team`)
    const adminList = adminPage.locator('#adminList')
    await expect(adminList).toContainText(ADMIN_EMAIL, { timeout: 10_000 })
  })

  test('Admin invites a new admin by email', async ({ adminPage, baseUrl }) => {
    const inviteEmail = fake.uniqueEmail()

    await adminPage.goto(`${baseUrl}/admin/team`)
    await expect(adminPage.getByRole('button', { name: 'Invite Admin' })).toBeVisible({
      timeout: 10_000,
    })

    await adminPage.getByRole('button', { name: 'Invite Admin' }).click()
    const inviteDialog = adminPage.getByRole('dialog', { name: 'Invite Admin' })
    await expect(inviteDialog).toBeVisible({ timeout: 5_000 })
    await adminPage.getByLabel('Email Address').fill(inviteEmail)
    await adminPage.getByRole('button', { name: 'Send Invite' }).click()

    await expect(inviteDialog.getByRole('status')).toBeVisible({ timeout: 10_000 })
  })

  test('Admin views pending invites', async ({ adminPage, baseUrl }) => {
    const inviteEmail = fake.uniqueEmail()

    await adminPage.goto(`${baseUrl}/admin/team`)
    await expect(adminPage.getByRole('button', { name: 'Invite Admin' })).toBeVisible({
      timeout: 10_000,
    })
    await createAdminInvite(adminPage, baseUrl, inviteEmail)

    await adminPage.goto(`${baseUrl}/admin/team`)
    await adminPage.getByRole('tab', { name: 'Pending Invites' }).click()

    await expect(adminPage.locator('#inviteList')).toContainText(inviteEmail, { timeout: 10_000 })
  })

  test('Admin revokes a pending invite', async ({ adminPage, baseUrl }) => {
    const inviteEmail = fake.uniqueEmail()

    await adminPage.goto(`${baseUrl}/admin/team`)
    await expect(adminPage.getByRole('button', { name: 'Invite Admin' })).toBeVisible({
      timeout: 10_000,
    })
    await createAdminInvite(adminPage, baseUrl, inviteEmail)

    await adminPage.goto(`${baseUrl}/admin/team`)
    await adminPage.getByRole('tab', { name: 'Pending Invites' }).click()

    const inviteCard = adminPage.locator('#inviteList .card').filter({ hasText: inviteEmail })
    await expect(inviteCard).toBeVisible({ timeout: 10_000 })
    await inviteCard.getByRole('button', { name: 'Cancel' }).click()

    await expect(getAlert(adminPage)).toContainText('Invite cancelled', { timeout: 10_000 })
    await expect(inviteCard).not.toBeVisible({ timeout: 10_000 })
  })

  test('New user accepts an admin invite link', async ({ adminPage, browser, baseUrl }) => {
    const person = fake.person()

    await adminPage.goto(`${baseUrl}/admin/team`)
    const token = await createAdminInvite(adminPage, baseUrl, person.email)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto(`${baseUrl}/accept-invite?token=${token}`)
      await expect(page.getByRole('heading', { name: 'Admin Invite' })).toBeVisible({
        timeout: 10_000,
      })

      // Clear the pending invite token stored by accept-invite.html so signup
      // redirects to dashboard instead of back to accept-invite
      await page.evaluate(() => localStorage.removeItem('pendingAdminInvite'))

      // Signing up with the invited email auto-accepts the invite server-side
      await signup(baseUrl, page, person.name, person.email, 'testpassword1')
      await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 15_000 })

      const me = await getMe(page, baseUrl)
      expect(me.isAdmin).toBeTruthy()
    } finally {
      await ctx.close()
    }
  })

  test('Existing user accepts an admin invite', async ({ adminPage, volunteer, baseUrl }) => {
    await adminPage.goto(`${baseUrl}/admin/team`)
    const token = await createAdminInvite(adminPage, baseUrl, volunteer.email)

    await volunteer.page.goto(`${baseUrl}/accept-invite?token=${token}`)
    await expect(volunteer.page.getByRole('heading', { name: 'Welcome to the Team!' })).toBeVisible(
      { timeout: 10_000 },
    )

    const me = await getMe(volunteer.page, baseUrl)
    expect(me.isAdmin).toBeTruthy()
  })

  test("Admin revokes another admin's access", async ({ adminPage, volunteer, baseUrl }) => {
    await adminPage.goto(`${baseUrl}/admin/team`)
    const token = await createAdminInvite(adminPage, baseUrl, volunteer.email)

    // Navigate to a real page first so the volunteer's localStorage is accessible
    await volunteer.page.goto(`${baseUrl}/dashboard`)

    // Accept invite as the volunteer directly via API
    const volunteerToken = await volunteer.page.evaluate(() => localStorage.getItem('authToken'))
    const volunteerApi = createApiClient(baseUrl, volunteerToken)
    const acceptResult = await volunteerApi.admin.admins.acceptInvite({
      body: { inviteToken: token },
    })
    if (acceptResult.status !== 200)
      throw new Error(`Accept invite failed: ${JSON.stringify(acceptResult.body)}`)

    // Reload team page to see updated admin list
    await adminPage.goto(`${baseUrl}/admin/team`)
    const adminCard = adminPage.locator('#adminList .card').filter({ hasText: volunteer.email })
    await expect(adminCard).toBeVisible({ timeout: 10_000 })

    adminPage.once('dialog', (dialog) => dialog.accept())
    await adminCard.getByRole('button', { name: 'Revoke Access' }).click()

    await expect(getAlert(adminPage)).toContainText('Admin access revoked', { timeout: 10_000 })
    await expect(adminCard).not.toBeVisible({ timeout: 10_000 })

    // Volunteer should no longer have admin access
    const triageResult = await volunteerApi.admin.triage.list()
    expect(triageResult.status).toBe(403)
  })
})
