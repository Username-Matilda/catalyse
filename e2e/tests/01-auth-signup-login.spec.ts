import crypto from 'crypto';
import { test, expect } from '../fixtures';
import { BASE_URL } from '../config';
import { signup, login } from '../actions/auth';

test.describe('Authentication: Signup & Login', () => {
  test('Visitor signs up successfully', async ({ browser }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signup(page, `New User ${id}`, `new_${id}@test.com`, 'testpassword1');
      await expect(page).toHaveURL(`${BASE_URL}/static/dashboard.html`);
    } finally {
      await context.close();
    }
  });

  test('Visitor logs in successfully', async ({ browser, volunteer }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(page, volunteer.email, volunteer.password);
      await expect(page).toHaveURL(`${BASE_URL}/static/dashboard.html`);
    } finally {
      await context.close();
    }
  });

  test('Login fails with wrong password', async ({ browser, volunteer }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/static/login.html`);
      await page.getByLabel('Email', { exact: true }).fill(volunteer.email);
      await page.getByLabel('Password').fill('wrongpassword');
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
      await expect(page).toHaveURL(`${BASE_URL}/static/login.html`);
    } finally {
      await context.close();
    }
  });

  test('Login fails with unknown email', async ({ browser }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/static/login.html`);
      await page.getByLabel('Email', { exact: true }).fill(`unknown_${id}@test.com`);
      await page.getByLabel('Password').fill('testpassword1');
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('Signup fails when email is already registered', async ({ browser, volunteer }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/static/signup.html`);
      await page.getByLabel('Your Name').fill('Duplicate User');
      await page.getByLabel('Email', { exact: true }).fill(volunteer.email);
      await page.getByLabel('Password', { exact: true }).fill('testpassword1');
      await page.getByLabel('Confirm Password').fill('testpassword1');
      await page.getByRole('button', { name: 'Create Account' }).click();
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('Signup fails with a short password', async ({ browser }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/static/signup.html`);
      await page.getByLabel('Your Name').fill(`Short Pwd ${id}`);
      await page.getByLabel('Email', { exact: true }).fill(`short_${id}@test.com`);
      // Remove HTML minlength so the browser doesn't intercept before the JS handler runs
      await page.evaluate(() => {
        document.querySelector('#password')?.removeAttribute('minlength');
        document.querySelector('#password_confirm')?.removeAttribute('minlength');
      });
      await page.getByLabel('Password', { exact: true }).fill('abc');
      await page.getByLabel('Confirm Password').fill('abc');
      await page.getByRole('button', { name: 'Create Account' }).click();
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('Logged-in user visiting login page is redirected to dashboard', async ({ volunteer }) => {
    await volunteer.page.goto(`${BASE_URL}/static/login.html`);
    await expect(volunteer.page).toHaveURL(`${BASE_URL}/static/dashboard.html`, { timeout: 10_000 });
  });
});
