import { test, expect, getAlert } from '../fixtures'
import { Page } from '@playwright/test'
import { fake } from '../fake'
import { selectFilterDropdown } from '../actions/ui'

async function getVolunteerId(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const token = localStorage.getItem('authToken')
    const resp = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return (await resp.json()).id
  })
}

test.describe('Volunteer Profile', () => {
  test('Volunteer updates their profile', async ({ volunteer, baseUrl }) => {
    const uniqueName = fake.personName()

    await volunteer.page.goto(`${baseUrl}/profile`)
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 })

    await volunteer.page.getByLabel('Your Name').fill(uniqueName)
    await volunteer.page.getByLabel('About You').fill('Bio text for e2e test')
    await volunteer.page.getByLabel('Location').fill('Test City')
    await volunteer.page.getByLabel('Hours per Week').fill('10')
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()

    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })
    await expect(getAlert(volunteer.page)).toContainText('Profile updated!')

    const volunteerId = await getVolunteerId(volunteer.page)
    await volunteer.page.goto(`${baseUrl}/volunteers/${volunteerId}`)
    await expect(volunteer.page.locator('#profileContent')).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.locator('#volunteerName')).toContainText(uniqueName)
    await expect(volunteer.page.locator('#volunteerBio')).toContainText('Bio text for e2e test')
    await expect(volunteer.page.locator('#availabilityText')).toContainText('10 hours/week')
  })

  test('Volunteer adds skills to their profile', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/profile`)
    const skillOption = volunteer.page.locator('.skill-option').filter({ hasText: 'Fundraising' })
    await expect(skillOption).toBeVisible({ timeout: 10_000 })
    await skillOption.click()

    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })
    await expect(getAlert(volunteer.page)).toContainText('Profile updated!')

    const volunteerId = await getVolunteerId(volunteer.page)
    await volunteer.page.goto(`${baseUrl}/volunteers/${volunteerId}`)
    await expect(volunteer.page.locator('#profileContent')).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.locator('#volunteerSkills')).toContainText('Fundraising')
  })

  test('Volunteer sets profile visibility to hidden', async ({ volunteer, baseUrl }) => {
    const uniqueName = fake.personName()

    // First make the volunteer visible so we can confirm the transition
    await volunteer.page.goto(`${baseUrl}/profile`)
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByLabel('Your Name').fill(uniqueName)
    await volunteer.page
      .locator('#consent_make_profile_visible_in_directory')
      .check({ force: true })
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/volunteers`)
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByLabel('Search').fill(uniqueName)
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName }),
    ).toBeVisible({ timeout: 10_000 })

    // Now hide the profile
    await volunteer.page.goto(`${baseUrl}/profile`)
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 })
    await volunteer.page
      .locator('#consent_make_profile_visible_in_directory')
      .uncheck({ force: true })
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/volunteers`)
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByLabel('Search').fill(uniqueName)
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName }),
    ).not.toBeVisible({ timeout: 10_000 })
  })

  test('Volunteer sets profile visibility to visible', async ({ volunteer, baseUrl }) => {
    const uniqueName = fake.personName()

    // First hide the volunteer so we can confirm the transition
    await volunteer.page.goto(`${baseUrl}/profile`)
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByLabel('Your Name').fill(uniqueName)
    await volunteer.page
      .locator('#consent_make_profile_visible_in_directory')
      .uncheck({ force: true })
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/volunteers`)
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByLabel('Search').fill(uniqueName)
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName }),
    ).not.toBeVisible({ timeout: 10_000 })

    // Now make the profile visible
    await volunteer.page.goto(`${baseUrl}/profile`)
    await expect(volunteer.page.getByLabel('Your Name')).toBeVisible({ timeout: 10_000 })
    await volunteer.page
      .locator('#consent_make_profile_visible_in_directory')
      .check({ force: true })
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/volunteers`)
    await expect(volunteer.page.locator('#volunteersList .loading')).not.toBeVisible({
      timeout: 10_000,
    })
    await volunteer.page.getByLabel('Search').fill(uniqueName)
    await expect(
      volunteer.page.locator('#volunteersList .card').filter({ hasText: uniqueName }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Volunteer updates email digest preference', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/profile`)
    await expect(volunteer.page.getByLabel('Keep me in the loop about new projects')).toBeVisible({
      timeout: 10_000,
    })

    await selectFilterDropdown(
      volunteer.page,
      'Keep me in the loop about new projects',
      'Send me a fortnightly digest',
    )
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })
    await expect(getAlert(volunteer.page)).toContainText('Profile updated!')

    await volunteer.page.reload()
    await expect(volunteer.page.getByLabel('Keep me in the loop about new projects')).toBeVisible({
      timeout: 10_000,
    })
    await expect(volunteer.page.getByLabel('Keep me in the loop about new projects')).toContainText(
      'Send me a fortnightly digest',
    )
  })

  test("Volunteer views another volunteer's public profile", async ({
    browser,
    volunteer,
    baseUrl,
  }) => {
    const vol2 = fake.person()

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
    if (!signupResp.ok)
      throw new Error(`Second volunteer signup failed: ${await signupResp.text()}`)
    const { auth_token: vol2Token } = await signupResp.json()

    const ctx2 = await browser.newContext()
    await ctx2.addInitScript((token: string) => {
      localStorage.setItem('authToken', token)
    }, vol2Token)
    const page2 = await ctx2.newPage()

    try {
      // Set up profile with a skill and consent_make_profile_visible_in_directory=true
      await page2.goto(`${baseUrl}/profile`)
      const skillOption = page2.locator('.skill-option').filter({ hasText: 'Fundraising' })
      await expect(skillOption).toBeVisible({ timeout: 10_000 })
      await skillOption.click()
      await page2.locator('#consent_make_profile_visible_in_directory').check({ force: true })
      await page2.getByRole('button', { name: 'Save Changes' }).click()
      await expect(getAlert(page2)).toBeVisible({ timeout: 10_000 })

      const vol2Id = await getVolunteerId(page2)

      // View the second volunteer's profile as the first volunteer
      await volunteer.page.goto(`${baseUrl}/volunteers/${vol2Id}`)
      await expect(volunteer.page.locator('#profileContent')).toBeVisible({ timeout: 10_000 })

      await expect(volunteer.page.locator('#volunteerName')).toContainText(vol2.name)
      await expect(volunteer.page.locator('#volunteerSkills')).toContainText('Fundraising')
      // Endorsements section only appears if there are endorsements; not present for fresh volunteer
      await expect(volunteer.page.locator('#endorsementsSection')).not.toBeVisible()
      // Contact info not shown because consent_share_contact_info_with_project_owner defaults to false
      await expect(volunteer.page.locator('#contactInfo')).not.toBeVisible()
    } finally {
      await ctx2.close()
    }
  })
})
