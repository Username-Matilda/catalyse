import { Page } from '@playwright/test';
import { BASE_URL } from '../config';

export async function signup(page: Page, name: string, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/static/signup.html`);
  await page.getByLabel('Your Name').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForURL(`${BASE_URL}/static/dashboard.html`, { timeout: 15_000 });
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/static/login.html`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(`${BASE_URL}/static/dashboard.html`, { timeout: 15_000 });
}
