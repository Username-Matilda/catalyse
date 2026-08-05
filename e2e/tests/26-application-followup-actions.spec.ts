import {
  test,
  expect,
  getAlert,
  rejectVolunteer,
  requestMoreInfo,
  reopenApplication,
} from '../fixtures'
import { fake } from '../fake'
import { createApiClient } from '../client'

test.describe('Application follow-up actions', () => {
  test('Admin requests more info; applicant updates and resubmits via emailed link', async ({
    adminPage,
    browser,
    baseUrl,
  }) => {
    const person = fake.person()
    const signupResult = await createApiClient(baseUrl).auth.signup({
      body: {
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        applicationMessage: 'I would like to help with outreach.',
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    expect(signupResult.status).toBe(200)
    const { id: volunteerId } = signupResult.body

    const updateToken = await requestMoreInfo(
      baseUrl,
      volunteerId,
      'Could you tell us more about your availability?',
    )
    expect(updateToken).toBeTruthy()

    // Card now shows under the Needs Info filter
    await adminPage.goto(`${baseUrl}/admin/applications`)
    await expect(adminPage.getByRole('heading', { name: 'Applications' })).toBeVisible({
      timeout: 10_000,
    })
    await adminPage.getByRole('button', { name: 'Filter applications' }).click()
    await adminPage.getByRole('option', { name: 'Needs Info' }).click()
    await expect(adminPage.getByRole('article').filter({ hasText: person.name })).toBeVisible({
      timeout: 10_000,
    })

    // Applicant follows the emailed link to update and resubmit their application
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/update-application?token=${updateToken}`)
      await expect(page.getByRole('heading', { name: 'Update Your Application' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('Could you tell us more about your availability?')).toBeVisible()
      await expect(page.getByLabel('Your Name')).toHaveValue(person.name)
      await page.getByLabel('Hours per Week').fill('10')
      await page.getByRole('button', { name: 'Resubmit Application' }).click()
      await expect(page).toHaveURL(`${baseUrl}/login`, { timeout: 10_000 })
    } finally {
      await context.close()
    }

    // Status is back to under review, with the applicant's update applied
    await adminPage.goto(`${baseUrl}/admin/applications`)
    await adminPage.getByRole('button', { name: 'Filter applications' }).click()
    await adminPage.getByRole('option', { name: 'Pending & Under Review by Me' }).click()
    const card = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText('10 hours/week')).toBeVisible()
  })

  test('Update-application link cannot be reused after submission', async ({
    browser,
    baseUrl,
  }) => {
    const person = fake.person()
    const signupResult = await createApiClient(baseUrl).auth.signup({
      body: {
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        applicationMessage: 'I would like to help with outreach.',
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    const { id: volunteerId } = signupResult.body
    const updateToken = await requestMoreInfo(baseUrl, volunteerId)
    expect(updateToken).toBeTruthy()

    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/update-application?token=${updateToken}`)
      await expect(page.getByRole('button', { name: 'Resubmit Application' })).toBeVisible({
        timeout: 10_000,
      })
      await page.getByRole('button', { name: 'Resubmit Application' }).click()
      await expect(page).toHaveURL(`${baseUrl}/login`, { timeout: 10_000 })

      // Reusing the same link should now be rejected
      await page.goto(`${baseUrl}/update-application?token=${updateToken}`)
      await expect(page.getByRole('heading', { name: 'Invalid Link' })).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await context.close()
    }
  })

  test('Invalid update-application token shows an error', async ({ browser, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/update-application?token=not-a-real-token`)
      await expect(page.getByRole('heading', { name: 'Invalid Link' })).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await context.close()
    }
  })

  test('Admin reopens a rejected application; applicant can resubmit and it leaves the Rejected tab', async ({
    adminPage,
    browser,
    baseUrl,
  }) => {
    const person = fake.person()
    const signupResult = await createApiClient(baseUrl).auth.signup({
      body: {
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        applicationMessage: 'I would like to help with outreach.',
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    const { id: volunteerId } = signupResult.body
    await rejectVolunteer(baseUrl, volunteerId, 'Needs more experience')

    const updateToken = await reopenApplication(
      baseUrl,
      volunteerId,
      'We would love to hear more about your recent experience.',
    )
    expect(updateToken).toBeTruthy()

    // No longer on the Rejected tab
    await adminPage.goto(`${baseUrl}/admin/applications`)
    await adminPage.getByRole('button', { name: 'Filter applications' }).click()
    await adminPage.getByRole('option', { name: 'Rejected', exact: true }).click()
    await expect(adminPage.getByRole('article').filter({ hasText: person.name })).not.toBeVisible({
      timeout: 5_000,
    })

    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/update-application?token=${updateToken}`)
      await expect(
        page.getByText('We would love to hear more about your recent experience.'),
      ).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Resubmit Application' }).click()
      await expect(page).toHaveURL(`${baseUrl}/login`, { timeout: 10_000 })
    } finally {
      await context.close()
    }

    await adminPage.goto(`${baseUrl}/admin/applications`)
    await adminPage.getByRole('button', { name: 'Filter applications' }).click()
    await adminPage.getByRole('option', { name: 'Pending & Under Review by Me' }).click()
    await expect(adminPage.getByRole('article').filter({ hasText: person.name })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Admin UI: Request More Info and Reopen buttons drive the same flow', async ({
    adminPage,
    baseUrl,
  }) => {
    const person = fake.person()
    const signupResult = await createApiClient(baseUrl).auth.signup({
      body: {
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    const { id: volunteerId } = signupResult.body

    await adminPage.goto(`${baseUrl}/admin/applications/${volunteerId}`)
    await expect(adminPage.getByRole('heading', { name: person.name })).toBeVisible({
      timeout: 10_000,
    })

    await adminPage.getByRole('button', { name: 'Request More Info' }).click()
    const requestInfoModal = adminPage.getByRole('dialog')
    await expect(requestInfoModal).toBeVisible({ timeout: 5_000 })
    await requestInfoModal.getByRole('button', { name: 'Request Info' }).click()
    await expect(getAlert(adminPage)).toContainText('More information requested', {
      timeout: 10_000,
    })
    await expect(adminPage).toHaveURL(/\/admin\/applications$/, { timeout: 10_000 })

    // Reject it directly via API to get to a rejected state, then reopen via the UI
    await rejectVolunteer(baseUrl, volunteerId, 'Rejected for this test')
    await adminPage.goto(`${baseUrl}/admin/applications/${volunteerId}`)
    await adminPage.getByRole('button', { name: 'Reopen Application' }).click()
    const reopenModal = adminPage.getByRole('dialog')
    await expect(reopenModal).toBeVisible({ timeout: 5_000 })
    await reopenModal.getByRole('button', { name: 'Reopen' }).click()
    await expect(getAlert(adminPage)).toContainText('Application reopened', { timeout: 10_000 })
    await expect(adminPage).toHaveURL(/\/admin\/applications$/, { timeout: 10_000 })
  })

  test.skip('Anonymised rejection blocks reapplication until an admin allows it', async () => {
    // Scenario:
    // 1. Person signs up, admin rejects them.
    // 2. After 7 days the anonymisation job runs, creating an AnonymisedEmail row for the
    //    email hash and wiping the volunteer's PII.
    // 3. The same email attempting to sign up again is rejected with "previously rejected".
    // 4. Admin opens the Rejected - Anonymised list and clicks "Allow Reapply" on that row.
    // 5. The same email can now sign up successfully.
    //
    // Skipped: triggering anonymisation requires backdating rejected_at by 7 days,
    // which needs a test-only seed endpoint that doesn't yet exist (same limitation as
    // the skipped "Re-applicant shows full prior rejection history" test in
    // 01-auth-signup-login.spec.ts).
  })
})
