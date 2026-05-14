import { chromium, FullConfig } from '@playwright/test'
import { execSync } from 'child_process'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  IS_LOCAL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  BASE_PORT,
  workerBaseUrl,
  workerDbDir,
  workerAuthFile,
  SERVER_PIDS_FILE,
} from './config'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')
const PRISMA_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'prisma')

function killServerOnPort(port: number): void {
  try {
    execSync(`lsof -ti :${port} | xargs kill -TERM 2>/dev/null || true`, { shell: '/bin/sh' })
  } catch {
    // nothing listening
  }
}

const IS_DEV_MODE = process.env.E2E_DEV === '1'

function buildNextJs(): void {
  execSync(`${NEXT_BINARY} build`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  })
}

function migrateWorkerDb(parallelIndex: number): void {
  const dbDir = workerDbDir(parallelIndex)
  const dbUrl = `file:${path.join(dbDir, 'catalyse.db')}`
  execSync(`${PRISMA_BINARY} migrate deploy`, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  })
}

function startWorkerNextJs(parallelIndex: number): number {
  const nextPort = BASE_PORT + parallelIndex
  const dbDir = workerDbDir(parallelIndex)

  killServerOnPort(nextPort)
  fs.rmSync(dbDir, { recursive: true, force: true })
  fs.mkdirSync(dbDir, { recursive: true })
  migrateWorkerDb(parallelIndex)

  const nextArgs = IS_DEV_MODE ? ['dev', '--turbo', '-p', String(nextPort)] : ['start', '-p', String(nextPort)]
  const server = spawn(NEXT_BINARY, nextArgs, {
    env: {
      ...process.env,
      PORT: String(nextPort),
      DATABASE_URL: `file:${path.join(dbDir, 'catalyse.db')}`,
      ADMIN_EMAILS: ADMIN_EMAIL,
      RESEND_API_KEY: '',
      STUB_EMAIL: 'true',
    },
    cwd: PROJECT_ROOT,
    detached: false,
    stdio: 'ignore',
  })

  return server.pid!
}

async function waitForServer(
  baseUrl: string,
  path = '/api/health',
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}${path}`)
      if (r.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Server at ${baseUrl}${path} did not become ready within ${timeoutMs / 1000}s`)
}

async function setupAdminAuth(parallelIndex: number): Promise<void> {
  const baseUrl = workerBaseUrl(parallelIndex)

  if (IS_LOCAL) {
    const resp = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Admin',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        consent_make_profile_visible_in_directory: true,
        consent_contactable_by_project_owners: true,
      }),
    })
    if (!resp.ok) {
      throw new Error(`Admin signup failed for worker ${parallelIndex}: ${await resp.text()}`)
    }
  }

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${baseUrl}/login`)
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL(`${baseUrl}/dashboard`)

  const authFile = workerAuthFile(parallelIndex)
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await context.storageState({ path: authFile })

  await browser.close()
}

async function globalSetup(config: FullConfig): Promise<void> {
  const workerCount = config.workers

  if (IS_LOCAL) {
    if (!IS_DEV_MODE) buildNextJs()

    const pids: Record<string, number> = {}
    for (let i = 0; i < workerCount; i++) {
      pids[i] = startWorkerNextJs(i)
    }
    fs.writeFileSync(SERVER_PIDS_FILE, JSON.stringify(pids))

    await Promise.all(
      Array.from({ length: workerCount }, (_, i) =>
        waitForServer(workerBaseUrl(i), '/api/health', 30_000),
      ),
    )

    await Promise.all(Array.from({ length: workerCount }, (_, i) => setupAdminAuth(i)))
  } else {
    await setupAdminAuth(0)
    const src = workerAuthFile(0)
    for (let i = 1; i < workerCount; i++) {
      fs.copyFileSync(src, workerAuthFile(i))
    }
  }
}

export default globalSetup
