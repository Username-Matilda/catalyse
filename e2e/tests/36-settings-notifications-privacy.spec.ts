import { test, expect, getAlert } from '../fixtures'
import { selectFilterDropdown } from '../actions/ui'

// 27-remote-eligibility.spec.ts covers the notify_remote_projects checkbox and its effect on
// match alerts. 18-gdpr-privacy.spec.ts covers directory visibility and contact-sharing consent
// end-to-end via another volunteer's search. This file covers what neither exercises: the email
// digest dropdown itself, and the share-contact-info checkbox's disabled/enabled gating.

test.describe('Settings: Notifications tab', () => {
  test('Email digest preference persists after save and reload', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/settings?tab=notifications`)
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

    await volunteer.page.reload()
    await expect(volunteer.page.getByLabel('Keep me in the loop about new projects')).toContainText(
      'Send me a fortnightly digest',
      { timeout: 10_000 },
    )
  })
})

test.describe('Settings: Privacy & Data tab', () => {
  test('Share-contact-info checkbox is disabled until contactable-by-owners is checked', async ({
    volunteer,
    baseUrl,
  }) => {
    await volunteer.page.goto(`${baseUrl}/settings?tab=privacy`)
    const contactable = volunteer.page.getByLabel(
      'Allow project owners to contact me about opportunities',
    )
    const shareContact = volunteer.page.getByLabel(/Share my contact info directly/)
    await expect(contactable).toBeVisible({ timeout: 10_000 })

    if (await contactable.isChecked()) {
      await volunteer.page.locator('label:has(#consent_contactable_by_project_owners)').click()
    }
    await expect(contactable).not.toBeChecked()
    await expect(shareContact).toBeDisabled()

    await volunteer.page.locator('label:has(#consent_contactable_by_project_owners)').click()
    await expect(contactable).toBeChecked()
    await expect(shareContact).toBeEnabled()

    await volunteer.page
      .locator('label:has(#consent_share_contact_info_with_project_owner)')
      .click()
    await expect(shareContact).toBeChecked()
    await volunteer.page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(getAlert(volunteer.page)).toBeVisible({ timeout: 10_000 })

    await volunteer.page.reload()
    await expect(volunteer.page.getByLabel(/Share my contact info directly/)).toBeChecked({
      timeout: 10_000,
    })
  })
})
