import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { test, expect } from '../fixtures'
import { createApiClient } from '../client'
import { fake } from '../fake'
import { IS_LOCAL, parallelIndexFromBaseUrl, workerDbDir } from '../config'

// API-level coverage (01-auth-signup-login.spec.ts) confirms invalid/reused tokens return a
// 400. This file covers what the /verify-email page actually renders for each error state,
// since the UI distinguishes "invalid", "already used" and "expired" with different copy and
// different follow-up actions (resend form vs. login link).

test.describe('Verify Email page (edge cases)', () => {
  test('An invalid confirmation token shows an error with a resend form', async ({
    browser,
    baseUrl,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/verify-email?token=not-a-real-token`)
      await expect(page.getByRole('heading', { name: 'Confirmation failed' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('Invalid or expired confirmation link')).toBeVisible()
      await expect(page.getByPlaceholder('Your email address')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('An already-used confirmation token shows an error with no resend form, only a login link', async ({
    browser,
    baseUrl,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      const person = fake.person()
      const api = createApiClient(baseUrl)
      const signup = await api.auth.signup({
        body: {
          name: person.name,
          email: person.email,
          password: 'testpassword1',
          bio: 'e2e test bio, at least twenty characters long',
          country: 'UK',
          availabilityHoursPerWeek: 5,
          applicationMessage: 'e2e test application message',
          consentMakeProfileVisibleInDirectory: true,
          consentContactableByProjectOwners: true,
        },
      })
      expect(signup.status).toBe(200)
      const { emailVerificationToken: token } = signup.body
      expect(token).toBeTruthy()

      const first = await api.auth.verifyEmail({ body: { token: token! } })
      expect(first.status).toBe(200)

      await page.goto(`${baseUrl}/verify-email?token=${token}`)
      await expect(page.getByRole('heading', { name: 'Confirmation failed' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('This confirmation link has already been used')).toBeVisible()
      await expect(page.getByPlaceholder('Your email address')).not.toBeVisible()
      await expect(page.getByRole('link', { name: 'Go to login' })).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('An expired confirmation token shows an expiry-specific error', async ({
    browser,
    baseUrl,
  }) => {
    test.skip(!IS_LOCAL, 'backdates the token directly in the worker SQLite DB')

    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      const person = fake.person()
      const api = createApiClient(baseUrl)
      const signup = await api.auth.signup({
        body: {
          name: person.name,
          email: person.email,
          password: 'testpassword1',
          bio: 'e2e test bio, at least twenty characters long',
          country: 'UK',
          availabilityHoursPerWeek: 5,
          applicationMessage: 'e2e test application message',
          consentMakeProfileVisibleInDirectory: true,
          consentContactableByProjectOwners: true,
        },
      })
      expect(signup.status).toBe(200)
      const { emailVerificationToken: token } = signup.body
      expect(token).toBeTruthy()

      // Backdate the token straight in the worker's SQLite file (node:sqlite, same tool
      // scripts/seed-migration-test-state.ts uses) — this path is only exercised when
      // IS_LOCAL, and the generated Prisma client can't be imported from Playwright's own
      // module loader (CJS/ESM interop mismatch with Next's build pipeline).
      const dbPath = path.join(workerDbDir(parallelIndexFromBaseUrl(baseUrl)), 'catalyse.db')
      const db = new DatabaseSync(dbPath)
      try {
        // The app server (via Prisma) holds this same file open, and other tests are
        // writing to it concurrently under fullyParallel — without a busy timeout a
        // momentary lock throws immediately instead of waiting it out.
        db.exec('PRAGMA busy_timeout = 5000')
        db.prepare('UPDATE email_verification_tokens SET expires_at = ? WHERE token = ?').run(
          new Date(Date.now() - 60_000).toISOString(),
          token!,
        )
      } finally {
        db.close()
      }

      await page.goto(`${baseUrl}/verify-email?token=${token}`)
      await expect(page.getByRole('heading', { name: 'Confirmation failed' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('This confirmation link has expired')).toBeVisible()
      await expect(page.getByPlaceholder('Your email address')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('Resending from the plain /verify-email page (no token) sends a new link', async ({
    browser,
    baseUrl,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      const person = fake.person()
      const api = createApiClient(baseUrl)
      const signup = await api.auth.signup({
        body: {
          name: person.name,
          email: person.email,
          password: 'testpassword1',
          bio: 'e2e test bio, at least twenty characters long',
          country: 'UK',
          availabilityHoursPerWeek: 5,
          applicationMessage: 'e2e test application message',
          consentMakeProfileVisibleInDirectory: true,
          consentContactableByProjectOwners: true,
        },
      })
      expect(signup.status).toBe(200)

      await page.goto(`${baseUrl}/verify-email`)
      await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible({
        timeout: 10_000,
      })
      await page.getByPlaceholder('Your email address').fill(person.email)
      await page.getByRole('button', { name: 'Send' }).click()
      // Immediately after sending, the 60s cooldown is active, so the copy is
      // "Email sent! You can request another in <n>s." rather than the post-cooldown text.
      // The form (including the Send button) is swapped out entirely once sent.
      await expect(page.getByText(/Email sent!/)).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Send' })).toBeHidden()
    } finally {
      await context.close()
    }
  })
})
