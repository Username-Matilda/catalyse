import { execSync, spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { DEMO_PORT, BASE_URL } from './data'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')

let demoServer: ChildProcess | null = null

export async function buildForDemo(): Promise<void> {
  console.log('  Cleaning previous build...')
  fs.rmSync(path.join(PROJECT_ROOT, '.next'), { recursive: true, force: true })
  console.log('  Building for demo...')
  await new Promise<void>((resolve, reject) => {
    const build = spawn(NEXT_BINARY, ['build'], { cwd: PROJECT_ROOT, stdio: 'inherit' })
    build.on('close', (code) => code === 0 ? resolve() : reject(new Error(`next build failed (exit ${code})`)))
  })
}

/** Starts the server immediately (non-blocking). Returns a Promise that resolves when the server is healthy. */
export function startDemoServer(dbPath: string): Promise<void> {
  return (async () => {
    const dbDir = path.dirname(dbPath)

    const { resolveDbUrl } = require('../lib/db-url') as { resolveDbUrl: (f?: string) => string }
    const sourceUrl = resolveDbUrl()
    const sourcePath = sourceUrl.startsWith('file:') ? sourceUrl.slice(5) : sourceUrl

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source database not found: ${sourcePath}. Run migrations first.`)
    }

    fs.rmSync(dbDir, { recursive: true, force: true })
    fs.mkdirSync(dbDir, { recursive: true })
    fs.copyFileSync(sourcePath, dbPath)

    try {
      execSync(`lsof -ti :${DEMO_PORT} | xargs kill -TERM 2>/dev/null || true`, { shell: '/bin/sh' })
    } catch { /* nothing listening */ }

    demoServer = spawn(NEXT_BINARY, ['start', '-p', String(DEMO_PORT)], {
      env: { ...process.env, PORT: String(DEMO_PORT), DATABASE_URL: `file:${dbPath}`, STUB_EMAIL: 'true' },
      cwd: PROJECT_ROOT,
      detached: false,
      stdio: 'inherit',
    })

    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${BASE_URL}/api/health`)
        if (r.ok) return
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('Demo server did not become ready within 60s')
  })()
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
