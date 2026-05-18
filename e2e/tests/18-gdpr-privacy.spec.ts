import { readFileSync } from 'fs'
import { test, expect, getAlert, approveVolunteer } from '../fixtures'
import { fake } from '../fake'
import { createSkill } from '../actions/skills'
import { adminCreateProject, transferProjectOwnership } from '../actions/projects'

test.describe('GDPR & Privacy', () => {
  test('Volunteer exports their personal data', async ({
    adminPage,
    volunteer,
    browser,
    baseUrl,
  }) => {
    test.setTimeout(120_000)
    // Add a skill to the volunteer's profile
    const skill = await createSkill(baseUrl, adminPage)
    await volunteer.page.goto(`${baseUrl}/profile`)
    await expect(
      volunteer.page.locator('.skill-option').filter({ hasText: skill.name }),
    ).toBeVisible({ timeout: 10_000 })
    await volunteer.page
      .locator('label.skill-option')
      .filter({ hasText: new RegExp(`^\\s*${skill.name}\\s*$`) })
      .click()
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Profile updated!', { timeout: 10_000 })

    // Admin creates a project and transfers ownership to the volunteer so they have a project in the
    // export and a contactable owner page for the inbound message step
    const volunteerProjectId = await adminCreateProject(
      baseUrl,
      adminPage,
      fake.projectTitle(),
      'GDPR export test project',
    )
    await transferProjectOwnership(baseUrl, adminPage, volunteerProjectId, volunteer.name)

    // Admin creates a seeking-help project (no owner); volunteer expresses interest
    const seekingProjectId = await adminCreateProject(
      baseUrl,
      adminPage,
      fake.projectTitle(),
      'GDPR test seeking-help project',
    )
    await volunteer.page.goto(`${baseUrl}/projects/${seekingProjectId}`)
    await expect(
      volunteer.page.getByRole('button', { name: 'Express Interest' }),
    ).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByRole('button', { name: 'Express Interest' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Interest expressed!', { timeout: 10_000 })

    // Sign up a second volunteer (vol2) — used as owner for the contact project and as the inbound sender
    const vol2 = fake.person()
    const vol2SignupResp = await fetch(`${baseUrl}/api/auth/signup`, {
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
    if (!vol2SignupResp.ok) throw new Error(`vol2 signup failed: ${await vol2SignupResp.text()}`)
    const { id: vol2Id, auth_token: vol2Token } = await vol2SignupResp.json()
    await approveVolunteer(baseUrl, vol2Id)

    // Admin creates a project and transfers ownership to vol2 so it has a contactable owner
    const contactProjectId = await adminCreateProject(
      baseUrl,
      adminPage,
      fake.projectTitle(),
      'GDPR test contact project',
    )
    await transferProjectOwnership(baseUrl, adminPage, contactProjectId, vol2.name)

    // Volunteer contacts vol2 on that project — creates a messagesSent record
    await volunteer.page.goto(`${baseUrl}/projects/${contactProjectId}`)
    await expect(
      volunteer.page.getByRole('button', { name: 'Contact Owner' }),
    ).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByRole('button', { name: 'Contact Owner' }).click()
    const outboundDialog = volunteer.page.getByRole('dialog')
    await expect(outboundDialog.getByLabel('Subject')).toBeVisible({ timeout: 10_000 })
    await outboundDialog.getByLabel('Subject').fill(fake.messageSubject())
    await outboundDialog.getByLabel('Message').fill(fake.messageBody())
    await outboundDialog.getByRole('button', { name: 'Send Message' }).click()
    await expect(getAlert(volunteer.page)).toContainText('Message sent', { timeout: 10_000 })

    // vol2 contacts the volunteer on their approved project — creates a messagesReceived record
    const vol2Ctx = await browser.newContext()
    await vol2Ctx.addInitScript((token: string) => {
      localStorage.setItem('authToken', token)
    }, vol2Token)
    const vol2Page = await vol2Ctx.newPage()
    try {
      await vol2Page.goto(`${baseUrl}/projects/${volunteerProjectId}`)
      await expect(vol2Page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
      await vol2Page.getByRole('button', { name: 'Contact Owner' }).click()
      const inboundDialog = vol2Page.getByRole('dialog')
      await expect(inboundDialog.getByLabel('Subject')).toBeVisible({ timeout: 10_000 })
      await inboundDialog.getByLabel('Subject').fill(fake.messageSubject())
      await inboundDialog.getByLabel('Message').fill(fake.messageBody())
      await inboundDialog.getByRole('button', { name: 'Send Message' }).click()
      await expect(getAlert(vol2Page)).toContainText('Message sent', { timeout: 10_000 })
    } finally {
      await vol2Ctx.close()
    }

    // Export and verify every section has at least one record
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
    expect(data.skills.length).toBeGreaterThan(0)
    expect(data.projects.length).toBeGreaterThan(0)
    expect(data.interests.length).toBeGreaterThan(0)
    expect(data.messagesSent.length).toBeGreaterThan(0)
    expect(data.messagesReceived.length).toBeGreaterThan(0)
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
