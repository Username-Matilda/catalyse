import { readFileSync } from 'fs'
import { test, expect, getAlert, approveVolunteer } from '../fixtures'
import { fake } from '../fake'

test.describe('GDPR & Privacy', () => {
  test('Volunteer exports their personal data', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/privacy`)
    await expect(volunteer.page.getByRole('heading', { name: 'Export Your Data' })).toBeVisible({
      timeout: 10_000,
    })

    const [download] = await Promise.all([
      volunteer.page.waitForEvent('download'),
      volunteer.page.getByRole('button', { name: 'Download My Data' }).click(),
    ])

    await expect(getAlert(volunteer.page)).toContainText('Data exported successfully!', {
      timeout: 10_000,
    })

    const filePath = await download.path()
    expect(filePath).not.toBeNull()

    const data = JSON.parse(readFileSync(filePath!, 'utf8'))
    expect(data).toHaveProperty('profile')
    expect(data).toHaveProperty('skills')
    expect(data).toHaveProperty('interests')
    expect(data).toHaveProperty('messagesSent')
    expect(data).toHaveProperty('messagesReceived')
  })

  test('Volunteer with contact sharing disabled does not expose contact handles', async ({
    volunteer,
    browser,
    baseUrl,
  }) => {
    const vol2 = fake.person()
    const discordHandle = fake.username()
    const signalNumber = fake.phoneNumber()
    const whatsappNumber = fake.phoneNumber()

    const signupResp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: vol2.name,
        email: vol2.email,
        password: 'testpassword1',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })
    if (!signupResp.ok) throw new Error(`vol2 signup failed: ${await signupResp.text()}`)
    const { id: vol2Id, auth_token: vol2Token } = await signupResp.json()
    await approveVolunteer(baseUrl, vol2Id)
    const ctx2 = await browser.newContext()
    await ctx2.addInitScript((token: string) => {
      localStorage.setItem('authToken', token)
    }, vol2Token)
    const page2 = await ctx2.newPage()

    try {
      await page2.goto(`${baseUrl}/profile`)
      await expect(page2.getByLabel('Discord Handle')).toBeVisible({ timeout: 10_000 })

      await page2.getByLabel('Discord Handle').fill(discordHandle)
      await page2.getByLabel('Signal').fill(signalNumber)
      await page2.getByLabel('WhatsApp').fill(whatsappNumber)

      // Ensure profile is publicly visible
      await page2.getByLabel(/Make my profile visible/).check()
      // Keep consent_share_contact_info_with_project_owner unchecked (contact sharing disabled — this is the default)
      await expect(page2.getByLabel(/Share my contact info directly/)).not.toBeChecked()

      await page2.getByRole('button', { name: 'Save Changes' }).click()
      await expect(getAlert(page2)).toContainText('Profile updated!', { timeout: 10_000 })

      await volunteer.page.goto(`${baseUrl}/volunteers`)
      await volunteer.page.getByLabel('Search').fill(vol2.name)
      await volunteer.page.getByRole('link', { name: vol2.name }).click()

      await expect(volunteer.page.getByRole('heading', { name: vol2.name, level: 1 })).toBeVisible({
        timeout: 10_000,
      })

      await expect(volunteer.page.getByText(discordHandle)).not.toBeVisible()
      await expect(volunteer.page.getByText(signalNumber)).not.toBeVisible()
      await expect(volunteer.page.getByText(whatsappNumber)).not.toBeVisible()
    } finally {
      await ctx2.close()
    }
  })
})
