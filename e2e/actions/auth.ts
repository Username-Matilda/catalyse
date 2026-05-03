import { Page } from '@playwright/test';

export async function signup(baseUrl: string, page: Page, name: string, email: string, password: string): Promise<void> {
  await page.goto(`${baseUrl}/static/signup.html`);
  await page.getByLabel('Your Name').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForURL(`${baseUrl}/static/dashboard.html`, { timeout: 15_000 });
}

export async function login(baseUrl: string, page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${baseUrl}/static/login.html`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(`${baseUrl}/static/dashboard.html`, { timeout: 15_000 });
}
