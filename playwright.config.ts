import { defineConfig, devices } from '@playwright/test';
import { WORKER_COUNT } from './e2e/config';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  workers: WORKER_COUNT,
  retries: 0,
  timeout: 30_000,
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { slowMo: parseInt(process.env.SLOW_MO ?? '0', 10) },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
