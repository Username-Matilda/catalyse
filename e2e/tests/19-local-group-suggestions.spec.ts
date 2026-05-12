import { test, expect, getAlert } from '../fixtures'
import {
  submitLocalGroupSuggestion,
  navigateToAdminLocalGroups,
  adminReviewSuggestion,
} from '../actions/local-groups'
import { selectFilterDropdown } from '../actions/ui'
import { fake } from '../fake'

test.describe('Local Group Suggestions', () => {
  test('Volunteer submits a suggestion and sees it in their list', async ({
    volunteer,
    baseUrl,
  }) => {
    const country = 'UK'
    const groupName = fake.localGroupName()

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, country, groupName)

    const item = volunteer.page.getByRole('article').filter({ hasText: groupName })
    await expect(item).toBeVisible({ timeout: 10_000 })
    await expect(item).toContainText('UK')
    await expect(item).toContainText('Pending Review')
  })

  test('Submit button is disabled until both country and name are filled', async ({
    volunteer,
    baseUrl,
  }) => {
    await volunteer.page.goto(`${baseUrl}/suggest-local-group`)
    await volunteer.page
      .getByRole('heading', { name: 'Suggest a Local Group', level: 1 })
      .waitFor({ timeout: 10_000 })

    await expect(volunteer.page.getByRole('button', { name: 'Submit Suggestion' })).toBeDisabled()

    await volunteer.page.getByLabel('Local Group Name').fill('TestCity')
    await expect(volunteer.page.getByRole('button', { name: 'Submit Suggestion' })).toBeDisabled()

    await selectFilterDropdown(volunteer.page, 'Select country', 'UK')
    await expect(volunteer.page.getByRole('button', { name: 'Submit Suggestion' })).toBeEnabled()
  })

  test('Admin sees pending suggestion', async ({ volunteer, adminPage, baseUrl }) => {
    const groupName = fake.localGroupName()

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)

    await expect(adminPage.getByRole('article').filter({ hasText: groupName })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Admin accepts a suggestion and it appears in the projects filter', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'accept')

    await expect(getAlert(adminPage)).toContainText('accepted', { timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/`)
    await volunteer.page.waitForLoadState('networkidle', { timeout: 15_000 })
    await selectFilterDropdown(volunteer.page, 'Country filter', `UK - ${groupName}`)
    await expect(volunteer.page.getByLabel('Country filter', { exact: true })).toContainText(
      `UK - ${groupName}`,
    )
  })

  test('Admin accepts a suggestion with adjusted name', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const original = fake.localGroupName()
    const adjusted = `${original} (Adjusted)`

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', original)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, original, 'accept', { editName: adjusted })

    await expect(getAlert(adminPage)).toContainText('accepted', { timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/`)
    await volunteer.page.waitForLoadState('networkidle', { timeout: 15_000 })
    await selectFilterDropdown(volunteer.page, 'Country filter', `UK - ${adjusted}`)
    await expect(volunteer.page.getByLabel('Country filter', { exact: true })).toContainText(
      `UK - ${adjusted}`,
    )
  })

  test('Accepted group appears in the propose-project country/local-group form', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'accept')
    await expect(getAlert(adminPage)).toContainText('accepted', { timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/suggest`)
    await volunteer.page
      .getByRole('button', { name: 'Submit Project Proposal' })
      .waitFor({ timeout: 10_000 })
    await volunteer.page.waitForLoadState('networkidle', { timeout: 15_000 })

    await selectFilterDropdown(volunteer.page, 'Select country', 'UK')
    await expect(volunteer.page.getByLabel('Select local group', { exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await selectFilterDropdown(volunteer.page, 'Select local group', `UK - ${groupName}`)
    await expect(volunteer.page.getByLabel('Select local group', { exact: true })).toContainText(
      groupName,
    )
  })

  test('Admin merges a suggestion into an existing group', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'merge', {
      mergeTarget: 'UK — London',
    })

    await expect(getAlert(adminPage)).toContainText('merged', { timeout: 10_000 })

    await adminPage.getByRole('tab', { name: 'Accepted' }).click()
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })
    const accepted = adminPage.getByRole('article').filter({ hasText: groupName })
    await expect(accepted).toBeVisible({ timeout: 10_000 })
    await expect(accepted).toContainText('Merged into')
    await expect(accepted).toContainText('London')
  })

  test('Admin puts a suggestion on hold', async ({ volunteer, adminPage, baseUrl }) => {
    const groupName = fake.localGroupName()
    const note = 'Reviewing similar groups in this area first'

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'on_hold', { adminNotes: note })

    await expect(getAlert(adminPage)).toContainText('on hold', { timeout: 10_000 })

    await adminPage.getByRole('tab', { name: 'On Hold' }).click()
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })
    await expect(adminPage.getByRole('article').filter({ hasText: groupName })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Admin declines a suggestion', async ({ volunteer, adminPage, baseUrl }) => {
    const groupName = fake.localGroupName()
    const note = 'This area is covered by an existing group'

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'decline', { adminNotes: note })

    await expect(getAlert(adminPage)).toContainText('declined', { timeout: 10_000 })

    await adminPage.getByRole('tab', { name: 'Declined' }).click()
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })
    const card = adminPage.getByRole('article').filter({ hasText: groupName })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText(note)
  })

  test('Volunteer sees updated status after admin review', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'decline')

    await volunteer.page.goto(`${baseUrl}/suggest-local-group`)
    await volunteer.page
      .getByRole('heading', { name: 'Suggest a Local Group', level: 1 })
      .waitFor({ timeout: 10_000 })

    await expect(
      volunteer.page.getByRole('article').filter({ hasText: groupName }),
    ).toContainText('Declined', { timeout: 10_000 })
  })
})
