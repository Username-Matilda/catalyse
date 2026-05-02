import { test as base, Browser, Page } from '@playwright/test';
import crypto from 'crypto';
import { signup } from './actions/auth';
import { ADMIN_STATE_FILE } from './config';

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

export const test = base.extend<Fixtures>({
  adminPage: async ({ browser }: { browser: Browser }, use: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  volunteer: async ({ browser }: { browser: Browser }, use: (v: Volunteer) => Promise<void>) => {
    const id = crypto.randomBytes(4).toString('hex');
    const credentials = {
      name: 'Test Volunteer',
      email: `vol_${id}@test.com`,
      password: 'testpassword1',
    };
    const context = await browser.newContext();
    const page = await context.newPage();
    await signup(page, credentials.name, credentials.email, credentials.password);
    await use({ page, ...credentials });
    await context.close();
  },
});

export { expect } from '@playwright/test';
