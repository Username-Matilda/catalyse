import { test as base, Browser, Page, WorkerInfo } from '@playwright/test'
import { workerAuthFile, workerBaseUrl, parallelIndexFromBaseUrl } from './config'
import { fake } from './fake'
import fs from 'fs'

interface Volunteer {
  page: Page
  name: string
  email: string
  password: string
}

interface Fixtures {
  adminPage: Page
  volunteer: Volunteer
}

interface WorkerFixtures {
  baseUrl: string
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  baseUrl: [
    async ({}, runFixture, workerInfo: WorkerInfo) => {
      await runFixture(workerBaseUrl(workerInfo.parallelIndex))
    },
    { scope: 'worker' },
  ],

  adminPage: async ({ browser, baseUrl }, runFixture) => {
    const authFile = workerAuthFile(parallelIndexFromBaseUrl(baseUrl))
    const context = await browser.newContext({ storageState: authFile })
    const page = await context.newPage()
    await runFixture(page)
    await context.close()
  },

  volunteer: async (
    { browser, baseUrl }: { browser: Browser; baseUrl: string },
    runFixture: (v: Volunteer) => Promise<void>,
  ) => {
    const person = fake.person()
    const credentials = {
      name: person.name,
      email: person.email,
      password: 'testpassword1',
    }
    const resp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: credentials.name,
        email: credentials.email,
        password: credentials.password,
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })
    if (!resp.ok) throw new Error(`Volunteer signup failed: ${await resp.text()}`)
    const { id: volunteerId, auth_token, email_verification_token } = await resp.json()

    if (email_verification_token) {
      await confirmVolunteerEmail(baseUrl, email_verification_token)
    }
    await approveVolunteer(baseUrl, volunteerId)

    const context = await browser.newContext()
    await context.addInitScript((token: string) => {
      localStorage.setItem('authToken', token)
    }, auth_token)
    const page = await context.newPage()
    await runFixture({ page, ...credentials })
    await context.close()
  },
})

export { expect } from '@playwright/test'

export async function confirmVolunteerEmail(baseUrl: string, token: string): Promise<void> {
  await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function approveVolunteer(baseUrl: string, volunteerId: number): Promise<void> {
  const parallelIndex = parallelIndexFromBaseUrl(baseUrl)
  const authFile = workerAuthFile(parallelIndex)
  let adminToken: string | null = null
  try {
    const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'))
    const origin = data.origins?.find((o: { origin: string }) => o.origin === baseUrl)
    adminToken =
      origin?.localStorage?.find((ls: { name: string }) => ls.name === 'authToken')?.value ?? null
  } catch {
    return
  }
  if (!adminToken) return
  await fetch(`${baseUrl}/api/admin/applications/${volunteerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'approve' }),
  })
}

export function getAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)').last()
}
