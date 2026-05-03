import { test as base, Browser, Page, WorkerInfo } from '@playwright/test';
import crypto from 'crypto';
import { workerAuthFile, workerBaseUrl, parallelIndexFromBaseUrl } from './config';

interface Volunteer {
  page: Page;
  name: string;
  email: string;
  password: string;
}

interface Fixtures {
  adminPage: Page;
  volunteer: Volunteer;
}

interface WorkerFixtures {
  baseUrl: string;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  baseUrl: [async ({}, use, workerInfo: WorkerInfo) => {
    await use(workerBaseUrl(workerInfo.parallelIndex));
  }, { scope: 'worker' }],

  adminPage: async ({ browser, baseUrl }, use) => {
    const authFile = workerAuthFile(parallelIndexFromBaseUrl(baseUrl));
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  volunteer: async ({ browser, baseUrl }: { browser: Browser; baseUrl: string }, use: (v: Volunteer) => Promise<void>) => {
    const id = crypto.randomBytes(4).toString('hex');
    const credentials = {
      name: `Test Volunteer ${id}`,
      email: `vol_${id}@test.com`,
      password: 'testpassword1',
    };
    const resp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: credentials.name,
        email: credentials.email,
        password: credentials.password,
        consent_profile_visible: true,
        consent_contact_by_owners: true,
      }),
    });
    if (!resp.ok) throw new Error(`Volunteer signup failed: ${await resp.text()}`);
    const { auth_token } = await resp.json();
    const context = await browser.newContext();
    await context.addInitScript((token: string) => {
      localStorage.setItem('authToken', token);
    }, auth_token);
    const page = await context.newPage();
    await use({ page, ...credentials });
    await context.close();
  },
});

export { expect } from '@playwright/test';
