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
  await card.getByRole('button', { name: 'Review' }).click()

  await adminPage.getByRole('heading', { name: 'Review Suggestion', level: 2 }).waitFor({
    timeout: 10_000,
  })

  const actionLabel = { accept: 'Accept', merge: 'Merge', on_hold: 'On Hold', decline: 'Decline' }[
    action
  ]
  await adminPage.getByRole('radio', { name: new RegExp(actionLabel) }).click()

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
