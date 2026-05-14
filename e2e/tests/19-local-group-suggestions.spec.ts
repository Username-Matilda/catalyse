import { test, expect, getAlert } from '../fixtures'
import {
  submitLocalGroupSuggestion,
  navigateToAdminLocalGroups,
  adminReviewSuggestion,
  adminAddGroup,
  adminEditGroup,
  adminDeleteItem,
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

    await selectFilterDropdown(volunteer.page, 'Select country/group', 'UK')
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
    await selectFilterDropdown(volunteer.page, 'Country/Group filter', `UK - ${groupName}`)
    await expect(volunteer.page.getByLabel('Country/Group filter', { exact: true })).toContainText(
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
    await selectFilterDropdown(volunteer.page, 'Country/Group filter', `UK - ${adjusted}`)
    await expect(volunteer.page.getByLabel('Country/Group filter', { exact: true })).toContainText(
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

    await selectFilterDropdown(volunteer.page, 'Select country/group', `UK - ${groupName}`)
    await expect(volunteer.page.getByLabel('Select country/group', { exact: true })).toContainText(
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

    // Suggestion is removed from the pending list after merge
    await expect(adminPage.getByRole('article').filter({ hasText: groupName })).toBeHidden({
      timeout: 10_000,
    })
  })

  test('Admin puts a suggestion on hold', async ({ volunteer, adminPage, baseUrl }) => {
    const groupName = fake.localGroupName()
    const note = 'Reviewing similar groups in this area first'

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'on_hold', { adminNotes: note })

    await expect(getAlert(adminPage)).toContainText('on hold', { timeout: 10_000 })

    await selectFilterDropdown(adminPage, 'Status filter', 'On Hold')
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

    await selectFilterDropdown(adminPage, 'Status filter', 'Declined')
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })
    const card = adminPage.getByRole('article').filter({ hasText: groupName })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText(note)
  })

  test('Admin re-reviews a declined suggestion and accepts it', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await submitLocalGroupSuggestion(baseUrl, volunteer.page, 'UK', groupName)
    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminReviewSuggestion(adminPage, groupName, 'decline')
    await expect(getAlert(adminPage)).toContainText('declined', { timeout: 10_000 })

    await selectFilterDropdown(adminPage, 'Status filter', 'Declined')
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })

    const card = adminPage.getByRole('article').filter({ hasText: groupName })
    await expect(card.getByRole('button', { name: 'Re-review' })).toBeVisible({ timeout: 10_000 })

    await adminReviewSuggestion(adminPage, groupName, 'accept')
    await expect(getAlert(adminPage)).toContainText('accepted', { timeout: 10_000 })
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

test.describe('Admin Local Group Management', () => {
  test('Admin creates a group directly and it appears as Active', async ({
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminAddGroup(adminPage, 'UK', groupName)

    await expect(getAlert(adminPage)).toContainText('added', { timeout: 10_000 })

    await selectFilterDropdown(adminPage, 'Status filter', 'Active')
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })
    const card = adminPage.getByRole('article').filter({ hasText: groupName })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText('Active')
    await expect(card).toContainText('UK')
  })

  test('Admin edits a group name', async ({ adminPage, baseUrl }) => {
    const groupName = fake.localGroupName()
    const updatedName = `${groupName} Updated`

    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminAddGroup(adminPage, 'UK', groupName)
    await expect(getAlert(adminPage)).toContainText('added', { timeout: 10_000 })

    await selectFilterDropdown(adminPage, 'Status filter', 'Active')
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })

    await adminEditGroup(adminPage, groupName, { newName: updatedName })
    await expect(getAlert(adminPage)).toContainText('updated', { timeout: 10_000 })

    await expect(adminPage.getByRole('article').filter({ hasText: updatedName })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Admin deletes a group and it is removed from the list', async ({
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminAddGroup(adminPage, 'UK', groupName)
    await expect(getAlert(adminPage)).toContainText('added', { timeout: 10_000 })

    await selectFilterDropdown(adminPage, 'Status filter', 'Active')
    await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })

    await adminDeleteItem(adminPage, groupName)
    await expect(getAlert(adminPage)).toContainText('Deleted', { timeout: 10_000 })

    await expect(adminPage.getByRole('article').filter({ hasText: groupName })).toBeHidden()
  })

  test('Directly-created group appears in the propose-project location dropdown', async ({
    volunteer,
    adminPage,
    baseUrl,
  }) => {
    const groupName = fake.localGroupName()

    await navigateToAdminLocalGroups(baseUrl, adminPage)
    await adminAddGroup(adminPage, 'UK', groupName)
    await expect(getAlert(adminPage)).toContainText('added', { timeout: 10_000 })

    await volunteer.page.goto(`${baseUrl}/suggest`)
    await volunteer.page
      .getByRole('button', { name: 'Submit Project Proposal' })
      .waitFor({ timeout: 10_000 })
    await volunteer.page.waitForLoadState('networkidle', { timeout: 15_000 })

    await selectFilterDropdown(volunteer.page, 'Select country/group', `UK - ${groupName}`)
    await expect(volunteer.page.getByLabel('Select country/group', { exact: true })).toContainText(
      groupName,
    )
  })
})
