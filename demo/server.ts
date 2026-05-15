import { execSync, spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { DEMO_PORT, BASE_URL, DEMO_DB_DIR, DEMO_DB_PATH } from './data'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')

let demoServer: ChildProcess | null = null

export function startDemoServer(): void {
  console.log('  Cleaning previous build...')
  fs.rmSync(path.join(PROJECT_ROOT, '.next'), { recursive: true, force: true })
  console.log('  Building for demo...')
  execSync(`${NEXT_BINARY} build`, { cwd: PROJECT_ROOT, stdio: 'inherit' })

  const { resolveDbUrl } = require('../lib/db-url') as { resolveDbUrl: (f?: string) => string }
  const sourceUrl = resolveDbUrl()
  const sourcePath = sourceUrl.startsWith('file:') ? sourceUrl.slice(5) : sourceUrl

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source database not found: ${sourcePath}. Run migrations first.`)
  }

  fs.rmSync(DEMO_DB_DIR, { recursive: true, force: true })
  fs.mkdirSync(DEMO_DB_DIR, { recursive: true })
  fs.copyFileSync(sourcePath, DEMO_DB_PATH)

  // Kill anything already on the port
  try {
    execSync(`lsof -ti :${DEMO_PORT} | xargs kill -TERM 2>/dev/null || true`, { shell: '/bin/sh' })
  } catch { /* nothing listening */ }

  demoServer = spawn(NEXT_BINARY, ['start', '-p', String(DEMO_PORT)], {
    env: {
      ...process.env,
      PORT: String(DEMO_PORT),
      DATABASE_URL: `file:${DEMO_DB_PATH}`,
      STUB_EMAIL: 'true',
    },
    cwd: PROJECT_ROOT,
    detached: false,
    stdio: 'inherit',
  })
}

export function stopDemoServer(): void {
  if (demoServer) {
    demoServer.kill('SIGTERM')
    demoServer = null
  }
  try {
    execSync(`lsof -ti :${DEMO_PORT} | xargs kill -TERM 2>/dev/null || true`, { shell: '/bin/sh' })
  } catch { /* ignore */ }
}

export async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`)
      if (r.ok) return
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Demo server did not become ready within ${timeoutMs / 1000}s`)
}
