import { test, expect, getAlert } from '../fixtures'
import { signup, login } from '../actions/auth'
import { fake } from '../fake'

test.describe('Authentication: Signup & Login', () => {
  test('Visitor signs up successfully', async ({ browser, baseUrl }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      const person = fake.person()
      await signup(baseUrl, page, person.name, person.email, 'testpassword1')
      await expect(page.getByRole('heading', { name: 'Application Received!' })).toBeVisible({
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
    const { pending } = await signupResp.json()
    expect(pending).toBe(true)

    await adminPage.goto(`${baseUrl}/admin/applications`)
    await expect(adminPage.getByRole('heading', { name: 'Applications' })).toBeVisible({
      timeout: 10_000,
    })

    const card = adminPage.locator('.bg-surface').filter({ hasText: person.name })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('button', { name: 'Approve' }).click()
    await expect(getAlert(adminPage)).toContainText('Application approved', { timeout: 10_000 })

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
})
