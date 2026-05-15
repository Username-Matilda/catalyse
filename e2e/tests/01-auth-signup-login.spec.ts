import { test, expect, getAlert, confirmVolunteerEmail, approveVolunteer, rejectVolunteer } from '../fixtures'
import { signup, login } from '../actions/auth'
import { fake } from '../fake'

test.describe('Authentication: Signup & Login', () => {
  test('Visitor signs up successfully', async ({ browser, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      const person = fake.person()
      await signup(baseUrl, page, person.name, person.email, 'testpassword1')
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await context.close()
    }
  })

  test('Visitor logs in successfully', async ({ browser, volunteer, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await login(baseUrl, page, volunteer.email, volunteer.password)
      await expect(page).toHaveURL(`${baseUrl}/dashboard`)
    } finally {
      await context.close()
    }
  })

  test('Login fails with wrong password', async ({ browser, volunteer, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/login`)
      await page.getByLabel('Email', { exact: true }).fill(volunteer.email)
      await page.getByLabel('Password').fill('wrongpassword')
      await page.getByRole('button', { name: 'Login' }).click()
      await expect(getAlert(page)).toBeVisible({ timeout: 10_000 })
      await expect(page).toHaveURL(`${baseUrl}/login`)
    } finally {
      await context.close()
    }
  })

  test('Login fails with unknown email', async ({ browser, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/login`)
      await page.getByLabel('Email', { exact: true }).fill(fake.uniqueEmail())
      await page.getByLabel('Password').fill('testpassword1')
      await page.getByRole('button', { name: 'Login' }).click()
      await expect(getAlert(page)).toBeVisible({ timeout: 10_000 })
    } finally {
      await context.close()
    }
  })

  test('Signup fails when email is already registered', async ({ browser, volunteer, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/signup`)
      await page.getByLabel('Your Name').fill('Duplicate User')
      await page.getByLabel('Email', { exact: true }).fill(volunteer.email)
      await page.getByLabel('Password', { exact: true }).fill('testpassword1')
      await page.getByLabel('Confirm Password').fill('testpassword1')
      await page.getByLabel('Your Application').fill('e2e test application message')
      await page.getByRole('button', { name: 'Create Account' }).click()
      await expect(getAlert(page)).toBeVisible({ timeout: 10_000 })
    } finally {
      await context.close()
    }
  })

  test('Signup fails with a short password', async ({ browser, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/signup`)
      const person = fake.person()
      await page.getByLabel('Your Name').fill(person.name)
      await page.getByLabel('Email', { exact: true }).fill(person.email)
      // Remove HTML minlength so the browser doesn't intercept before the JS handler runs
      await page.evaluate(() => {
        document.querySelector('#password')?.removeAttribute('minlength')
        document.querySelector('#password_confirm')?.removeAttribute('minlength')
      })
      await page.getByLabel('Password', { exact: true }).fill('abc')
      await page.getByLabel('Confirm Password').fill('abc')
      await page.getByLabel('Your Application').fill('e2e test application message')
      await page.getByRole('button', { name: 'Create Account' }).click()
      await expect(getAlert(page)).toBeVisible({ timeout: 10_000 })
    } finally {
      await context.close()
    }
  })

  test('Admin approves a pending application; volunteer can then access the platform', async ({
    adminPage,
    browser,
    baseUrl,
  }) => {
    const person = fake.person()

    const signupResp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        application_message: 'I want to contribute to AI safety',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })
    expect(signupResp.ok).toBeTruthy()
    const { pending, email_verification_token } = await signupResp.json()
    expect(pending).toBe(true)

    if (email_verification_token) {
      await confirmVolunteerEmail(baseUrl, email_verification_token)
    }

    await adminPage.goto(`${baseUrl}/admin/applications`)
    await expect(adminPage.getByRole('heading', { name: 'Applications' })).toBeVisible({
      timeout: 10_000,
    })

    const card = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('button', { name: 'Start Review' }).click()
    await expect(adminPage).toHaveURL(/\/admin\/applications\/\d+/, { timeout: 10_000 })
    await adminPage.getByRole('button', { name: 'Approve' }).click()
    await expect(adminPage.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Approve' }).click()
    await expect(getAlert(adminPage)).toContainText('Application approved', { timeout: 10_000 })
    await expect(adminPage).toHaveURL(/\/admin\/applications$/, { timeout: 10_000 })

    // Approved volunteer can log in and reach dashboard without pending banner
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await login(baseUrl, page, person.email, 'testpassword1')
      await expect(page).toHaveURL(`${baseUrl}/dashboard`)
      await expect(page.getByText('Your account is pending approval')).not.toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('Logged-in user visiting login page is redirected to dashboard', async ({
    volunteer,
    baseUrl,
  }) => {
    await volunteer.page.goto(`${baseUrl}/login`)
    await expect(volunteer.page).toHaveURL(`${baseUrl}/dashboard`, { timeout: 10_000 })
  })

  test('Resend confirmation email button appears on pending screen and sends email', async ({
    browser,
    baseUrl,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      const person = fake.person()
      await signup(baseUrl, page, person.name, person.email, 'testpassword1')
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
        timeout: 10_000,
      })
      await page.getByRole('button', { name: 'Resend confirmation email' }).click()
      await expect(page.getByText(/Email sent!/)).toBeVisible({ timeout: 5_000 })
    } finally {
      await context.close()
    }
  })

  test('Resend invalidates old confirmation token', async ({ baseUrl }) => {
    const person = fake.person()
    const signupResp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })
    expect(signupResp.ok).toBeTruthy()
    const { email_verification_token: oldToken } = await signupResp.json()
    expect(oldToken).toBeTruthy()

    await fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: person.email }),
    })

    const verifyResp = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: oldToken }),
    })
    expect(verifyResp.status).toBe(400)
  })

  test('New token from resend confirms email successfully', async ({ baseUrl }) => {
    const person = fake.person()
    await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })

    const resendResp = await fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: person.email }),
    })
    expect(resendResp.ok).toBeTruthy()
    const { email_verification_token: newToken } = await resendResp.json()
    expect(newToken).toBeTruthy()

    const verifyResp = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: newToken }),
    })
    expect(verifyResp.ok).toBeTruthy()
  })

  test('Admin can start review; application moves to Under Review tab', async ({
    adminPage,
    baseUrl,
  }) => {
    const person = fake.person()
    await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })

    await adminPage.goto(`${baseUrl}/admin/applications`)
    await expect(adminPage.getByRole('heading', { name: 'Applications' })).toBeVisible({
      timeout: 10_000,
    })

    const card = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('button', { name: 'Start Review' }).click()
    await expect(adminPage).toHaveURL(/\/admin\/applications\/\d+/, { timeout: 10_000 })
    await adminPage.goto(`${baseUrl}/admin/applications`)
    await expect(adminPage.getByRole('heading', { name: 'Applications' })).toBeVisible({
      timeout: 10_000,
    })

    // Card stays visible in "mine" filter (UNDER_REVIEW by me is still "mine")
    const mineCard = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(mineCard.getByRole('button', { name: 'Continue Review' })).toBeVisible({
      timeout: 5_000,
    })
    await expect(mineCard.getByText(/Reviewer:/)).toBeVisible()

    // Card also appears in "others" tab when viewed by a different reviewer (not tested here),
    // and in the dedicated Under Review by Others filter — switch to confirm it's gone from others
    await adminPage.getByRole('button', { name: 'Filter applications' }).click()
    await adminPage.getByRole('option', { name: 'Under Review by Others' }).click()
    const othersCard = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(othersCard).not.toBeVisible({ timeout: 5_000 })
  })

  test('Admin can reject application with notes; notes visible on Rejected tab card', async ({
    adminPage,
    baseUrl,
  }) => {
    const person = fake.person()
    await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })

    await adminPage.goto(`${baseUrl}/admin/applications`)
    await expect(adminPage.getByRole('heading', { name: 'Applications' })).toBeVisible({
      timeout: 10_000,
    })

    const card = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('button', { name: 'Start Review' }).click()
    await expect(adminPage).toHaveURL(/\/admin\/applications\/\d+/, { timeout: 10_000 })

    await adminPage.getByPlaceholder('Notes visible only to admins…').fill('Spam account')
    await adminPage.getByPlaceholder('Optional message to applicant…').fill('Your application did not meet our requirements.')
    await adminPage.getByRole('button', { name: 'Reject' }).click()

    const modal = adminPage.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await modal.getByRole('button', { name: 'Reject' }).click()

    await expect(getAlert(adminPage)).toContainText('Application rejected', { timeout: 10_000 })
    await expect(adminPage).toHaveURL(/\/admin\/applications$/, { timeout: 10_000 })

    // Notes visible on Rejected filter
    await adminPage.getByRole('button', { name: 'Filter applications' }).click()
    await adminPage.getByRole('option', { name: 'Rejected', exact: true }).click()
    const rejectedCard = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(rejectedCard).toBeVisible({ timeout: 5_000 })
    await expect(rejectedCard.getByText('Spam account')).toBeVisible()
    await expect(rejectedCard.getByText('Your application did not meet our requirements.')).toBeVisible()
  })

  test('Rejected application shows anonymisation countdown', async ({
    adminPage,
    baseUrl,
  }) => {
    const person = fake.person()
    const signupResp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })
    const { id: volunteerId } = await signupResp.json()

    // Reject via API using the same helper pattern as approveVolunteer
    await rejectVolunteer(baseUrl, volunteerId, 'Test rejection')

    await adminPage.goto(`${baseUrl}/admin/applications`)
    await expect(adminPage.getByRole('heading', { name: 'Applications' })).toBeVisible({ timeout: 10_000 })
    await adminPage.getByRole('button', { name: 'Filter applications' }).click()
    await adminPage.getByRole('option', { name: 'Rejected', exact: true }).click()
    const card = adminPage.getByRole('article').filter({ hasText: person.name })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText(/will be anonymised on/i)).toBeVisible()
    await expect(card.getByText('Test rejection')).toBeVisible()
  })

  test('Admin approved before email confirmation; verify-email succeeds', async ({ baseUrl }) => {
    const person = fake.person()
    const signupResp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        password: 'testpassword1',
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })
    expect(signupResp.ok).toBeTruthy()
    const { id: volunteerId, email_verification_token } = await signupResp.json()
    expect(email_verification_token).toBeTruthy()

    // Admin approves before user confirms email
    await approveVolunteer(baseUrl, volunteerId)

    // User then confirms email — should still succeed
    const verifyResp = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: email_verification_token }),
    })
    expect(verifyResp.ok).toBeTruthy()
  })

  test.skip('Re-applicant shows full prior rejection history on admin card', async ({
    adminPage,
    baseUrl,
  }) => {
    // Scenario:
    // 1. Person signs up with email A, admin rejects them with notes + applicant message.
    // 2. After 7 days the anonymisation job runs: creates AnonymisedEmail + RejectedApplication
    //    rows for the email hash, then nulls out PII on the volunteer record.
    // 3. Person signs up again with the same email A.
    // 4. Admin opens the new application — the amber "Previously rejected" box should list
    //    every prior rejection event (date, admin notes, message sent to applicant), not just
    //    the most recent one. If rejected and re-applied multiple times, all events appear.
    //
    // Skipped: triggering anonymisation requires backdating rejected_at by 7 days,
    // which needs a test-only seed endpoint that doesn't yet exist.
    void adminPage, baseUrl
  })
})
