import { test as base, Browser, Page, WorkerInfo } from '@playwright/test'
import { workerAuthFile, workerBaseUrl, parallelIndexFromBaseUrl } from './config'
import { fake } from './fake'
import fs from 'fs'
import { createApiClient } from './client'

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
    const api = createApiClient(baseUrl)
    const result = await api.auth.signup({
      body: {
        name: credentials.name,
        email: credentials.email,
        password: credentials.password,
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    if (result.status !== 200)
      throw new Error(`Volunteer signup failed: ${JSON.stringify(result.body)}`)
    const { id: volunteerId, token: auth_token, emailVerificationToken } = result.body

    if (emailVerificationToken) {
      await confirmVolunteerEmail(baseUrl, emailVerificationToken)
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
  const api = createApiClient(baseUrl)
  await api.auth.verifyEmail({ body: { token } })
}

export function readAdminToken(baseUrl: string): string | null {
  const parallelIndex = parallelIndexFromBaseUrl(baseUrl)
  const authFile = workerAuthFile(parallelIndex)
  try {
    const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'))
    const origin = data.origins?.find((o: { origin: string }) => o.origin === baseUrl)
    return (
      origin?.localStorage?.find((ls: { name: string }) => ls.name === 'authToken')?.value ?? null
    )
  } catch {
    return null
  }
}

export async function rejectVolunteer(
  baseUrl: string,
  volunteerId: number,
  adminNotes?: string,
): Promise<void> {
  const adminToken = readAdminToken(baseUrl)
  if (!adminToken) return
  const api = createApiClient(baseUrl, adminToken)
  await api.admin.applications.action({
    params: { id: volunteerId },
    body: { action: 'reject', ...(adminNotes && { adminNotes }) },
  })
}

export async function approveVolunteer(baseUrl: string, volunteerId: number): Promise<void> {
  const adminToken = readAdminToken(baseUrl)
  if (!adminToken) return
  const api = createApiClient(baseUrl, adminToken)
  await api.admin.applications.action({
    params: { id: volunteerId },
    body: { action: 'approve' },
  })
}

export function getAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)').last()
}
