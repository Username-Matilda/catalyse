import crypto from 'crypto';
import { test, expect } from '../fixtures';
import { signup, login } from '../actions/auth';

test.describe('Authentication: Signup & Login', () => {
  test('Visitor signs up successfully', async ({ browser, baseUrl }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signup(baseUrl, page, `New User ${id}`, `new_${id}@test.com`, 'testpassword1');
      await expect(page).toHaveURL(`${baseUrl}/static/dashboard.html`);
    } finally {
      await context.close();
    }
  });

  test('Visitor logs in successfully', async ({ browser, volunteer, baseUrl }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(baseUrl, page, volunteer.email, volunteer.password);
      await expect(page).toHaveURL(`${baseUrl}/static/dashboard.html`);
    } finally {
      await context.close();
    }
  });

  test('Login fails with wrong password', async ({ browser, volunteer, baseUrl }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/static/login.html`);
      await page.getByLabel('Email', { exact: true }).fill(volunteer.email);
      await page.getByLabel('Password').fill('wrongpassword');
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
      await expect(page).toHaveURL(`${baseUrl}/static/login.html`);
    } finally {
      await context.close();
    }
  });

  test('Login fails with unknown email', async ({ browser, baseUrl }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/static/login.html`);
      await page.getByLabel('Email', { exact: true }).fill(`unknown_${id}@test.com`);
      await page.getByLabel('Password').fill('testpassword1');
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('Signup fails when email is already registered', async ({ browser, volunteer, baseUrl }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/static/signup.html`);
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

  test('Signup fails with a short password', async ({ browser, baseUrl }) => {
    const id = crypto.randomBytes(4).toString('hex');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/static/signup.html`);
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

  test('Logged-in user visiting login page is redirected to dashboard', async ({ volunteer, baseUrl }) => {
    await volunteer.page.goto(`${baseUrl}/static/login.html`);
    await expect(volunteer.page).toHaveURL(`${baseUrl}/static/dashboard.html`, { timeout: 10_000 });
  });
});
