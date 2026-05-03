import { defineConfig, devices } from '@playwright/test';
import { WORKER_COUNT } from './config';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: WORKER_COUNT,
  retries: 0,
  timeout: 30_000,
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
