import { type Page } from '@playwright/test'
import { selectFilterDropdown } from './ui'

export async function submitLocalGroupSuggestion(
  baseUrl: string,
  page: Page,
  country: string,
  name: string,
): Promise<void> {
  await page.goto(`${baseUrl}/suggest-local-group`)
  await page.getByRole('heading', { name: 'Suggest a Local Group', level: 1 }).waitFor({
    timeout: 10_000,
  })
  await selectFilterDropdown(page, 'Select country', country)
  await page.getByLabel('Local Group Name').fill(name)
  await page.getByRole('button', { name: 'Submit Suggestion' }).click()
  await page.getByText('Suggestion submitted!').waitFor({ timeout: 10_000 })
}

export async function navigateToAdminLocalGroups(baseUrl: string, adminPage: Page): Promise<void> {
  await adminPage.goto(`${baseUrl}/admin/local-groups`)
  await adminPage
    .getByRole('heading', { name: 'Local Groups', level: 1 })
    .waitFor({ timeout: 10_000 })
  await adminPage.getByText('Loading…').waitFor({ state: 'hidden', timeout: 10_000 })
}

export async function adminAddGroup(
  adminPage: Page,
  country: string,
  name: string,
): Promise<void> {
  await adminPage.getByRole('button', { name: 'Add Local Group' }).click()
  await adminPage
    .getByRole('heading', { name: 'Add Local Group', level: 2 })
    .waitFor({ timeout: 10_000 })
  await selectFilterDropdown(adminPage, 'Select country', country)
  await adminPage.getByLabel('Group Name').fill(name)
  await adminPage.getByRole('button', { name: 'Add Group' }).click()
  await adminPage
    .getByRole('heading', { name: 'Add Local Group', level: 2 })
    .waitFor({ state: 'hidden', timeout: 10_000 })
}

export async function adminEditGroup(
  adminPage: Page,
  groupName: string,
  opts: { newName?: string; newCountry?: string } = {},
): Promise<void> {
  const card = adminPage.getByRole('article').filter({ hasText: groupName })
  await card.getByRole('button', { name: 'Edit' }).click()
  await adminPage
    .getByRole('heading', { name: 'Edit Local Group', level: 2 })
    .waitFor({ timeout: 10_000 })
  if (opts.newCountry !== undefined) {
    await selectFilterDropdown(adminPage, 'Select country', opts.newCountry)
  }
  if (opts.newName !== undefined) {
    await adminPage.getByLabel('Group Name').fill(opts.newName)
  }
  await adminPage.getByRole('button', { name: 'Save Changes' }).click()
  await adminPage
    .getByRole('heading', { name: 'Edit Local Group', level: 2 })
    .waitFor({ state: 'hidden', timeout: 10_000 })
}

export async function adminDeleteItem(adminPage: Page, itemName: string): Promise<void> {
  const card = adminPage.getByRole('article').filter({ hasText: itemName })
  await card.getByRole('button', { name: 'Delete' }).click()
  await adminPage
    .getByRole('heading', { name: 'Confirm Delete', level: 2 })
    .waitFor({ timeout: 10_000 })
  // Modal Delete button is last in DOM (rendered after all article buttons)
  await adminPage.getByRole('button', { name: 'Delete' }).last().click()
  await adminPage
    .getByRole('heading', { name: 'Confirm Delete', level: 2 })
    .waitFor({ state: 'hidden', timeout: 10_000 })
}

export async function adminReviewSuggestion(
  adminPage: Page,
  groupName: string,
  action: 'accept' | 'merge' | 'on_hold' | 'decline',
  opts: {
    editName?: string
    editCountry?: string
    mergeTarget?: string
    adminNotes?: string
  } = {},
): Promise<void> {
  const card = adminPage.getByRole('article').filter({ hasText: groupName })
  await card.getByRole('button', { name: /Review/i }).click()

  await adminPage.getByRole('heading', { name: 'Review Suggestion', level: 2 }).waitFor({
    timeout: 10_000,
  })

  const actionLabel = { accept: 'Accept', merge: 'Merge', on_hold: 'On Hold', decline: 'Decline' }[
    action
  ]
  await adminPage.getByRole('radio', { name: new RegExp(actionLabel) }).click({ force: true })

  if (action === 'accept') {
    if (opts.editName !== undefined) {
      await adminPage.getByLabel('Group Name').fill(opts.editName)
    }
    if (opts.editCountry !== undefined) {
      await adminPage.getByLabel('Country').fill(opts.editCountry)
    }
  }

  if (action === 'merge' && opts.mergeTarget) {
    await selectFilterDropdown(adminPage, 'Select existing group to merge into', opts.mergeTarget)
  }

  if ((action === 'on_hold' || action === 'decline') && opts.adminNotes) {
    await adminPage.getByLabel('Note for volunteer').fill(opts.adminNotes)
  }

  await adminPage.getByRole('button', { name: 'Confirm' }).click()
  await adminPage.getByRole('heading', { name: 'Review Suggestion', level: 2 }).waitFor({
    state: 'hidden',
    timeout: 10_000,
  })
}
