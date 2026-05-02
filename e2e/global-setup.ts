import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  IS_LOCAL, WORKER_COUNT,
  ADMIN_EMAIL, ADMIN_PASSWORD,
  BASE_PORT,
  workerBaseUrl, workerDbDir, workerAuthFile,
  SERVER_PIDS_FILE,
} from './config';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VENV_PYTHON = path.join(PROJECT_ROOT, 'venv', 'bin', 'python3');
const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

function killServerOnPort(port: number): void {
  try {
    execSync(`lsof -ti :${port} | xargs kill -TERM 2>/dev/null || true`, { shell: true });
  } catch {
    // nothing listening
  }
}

function startWorkerServer(parallelIndex: number): number {
  const port = BASE_PORT + parallelIndex;
  const dbDir = workerDbDir(parallelIndex);

  killServerOnPort(port);
  fs.rmSync(dbDir, { recursive: true, force: true });
  fs.mkdirSync(dbDir, { recursive: true });

  const server = spawn(PYTHON, ['api.py'], {
    env: {
      ...process.env,
      PORT: String(port),
      RAILWAY_VOLUME_MOUNT_PATH: dbDir,
      ADMIN_EMAILS: ADMIN_EMAIL,
      RESEND_API_KEY: '',
      STUB_EMAIL: 'true',
    },
    cwd: PROJECT_ROOT,
    detached: false,
  });

  return server.pid!;
}

async function waitForServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/skills`);
      if (r.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server at ${baseUrl} did not become ready within 30 seconds`);
}

async function setupAdminAuth(parallelIndex: number): Promise<void> {
  const baseUrl = workerBaseUrl(parallelIndex);

  if (IS_LOCAL) {
    const resp = await fetch(`${baseUrl}/api/auth/signup`, {
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
      throw new Error(`Admin signup failed for worker ${parallelIndex}: ${await resp.text()}`);
    }
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseUrl}/static/login.html`);
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(`${baseUrl}/static/dashboard.html`);

  const authFile = workerAuthFile(parallelIndex);
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });

  await browser.close();
}

async function globalSetup(): Promise<void> {
  if (IS_LOCAL) {
    const pids: Record<number, number> = {};
    for (let i = 0; i < WORKER_COUNT; i++) {
      pids[i] = startWorkerServer(i);
    }
    fs.writeFileSync(SERVER_PIDS_FILE, JSON.stringify(pids));

    await Promise.all(
      Array.from({ length: WORKER_COUNT }, (_, i) => waitForServer(workerBaseUrl(i)))
    );

    await Promise.all(
      Array.from({ length: WORKER_COUNT }, (_, i) => setupAdminAuth(i))
    );
  } else {
    await setupAdminAuth(0);
    const src = workerAuthFile(0);
    for (let i = 1; i < WORKER_COUNT; i++) {
      fs.copyFileSync(src, workerAuthFile(i));
    }
  }
}

export default globalSetup;
