import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  BASE_URL, IS_LOCAL,
  ADMIN_EMAIL, ADMIN_PASSWORD,
  TEST_DB_DIR, SERVER_PID_FILE, ADMIN_STATE_FILE,
} from './config';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VENV_PYTHON = path.join(PROJECT_ROOT, 'venv', 'bin', 'python3');
const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
const SERVER_PORT = 8002;

function killServerOnPort(port: number): void {
  try {
    execSync(`lsof -ti :${port} | xargs kill -TERM 2>/dev/null || true`, { shell: true });
  } catch {
    // nothing listening
  }
}

async function globalSetup(): Promise<void> {
  if (IS_LOCAL) {
    // Kill any stale server from a previous run before wiping the DB dir,
    // so it doesn't return 500 and block waitForServer.
    killServerOnPort(SERVER_PORT);

    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });

    const server = spawn(PYTHON, ['api.py'], {
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        RAILWAY_VOLUME_MOUNT_PATH: TEST_DB_DIR,
        ADMIN_EMAILS: ADMIN_EMAIL,
        RESEND_API_KEY: '',
      },
      cwd: PROJECT_ROOT,
      detached: false,
    });

    fs.writeFileSync(SERVER_PID_FILE, String(server.pid));

    await waitForServer();

    const resp = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Admin',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        consent_profile_visible: true,
        consent_contact_by_owners: true,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Admin signup failed: ${await resp.text()}`);
    }

  }

  // Log in as admin and save browser storage state for tests to reuse
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/static/login.html`);
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(`${BASE_URL}/static/dashboard.html`);

  fs.mkdirSync(path.dirname(ADMIN_STATE_FILE), { recursive: true });
  await context.storageState({ path: ADMIN_STATE_FILE });

  await browser.close();
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/api/skills`);
      if (r.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Test server did not become ready within 30 seconds');
}

export default globalSetup;
