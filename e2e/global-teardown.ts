import { FullConfig } from '@playwright/test'
import { execSync } from 'child_process'
import fs from 'fs'
import { IS_LOCAL, BASE_PORT, SERVER_PIDS_FILE } from './config'
import { SNAPSHOTS_ENABLED, snapshotWorkerCount } from './snapshots/config'

// Only the listener: a client socket to the port (Playwright itself, holding a keep-alive
// connection) would otherwise be killed too.
function killServerOnPort(port: number): void {
  try {
    execSync(`lsof -tiTCP:${port} -sTCP:LISTEN | xargs kill -TERM 2>/dev/null || true`, {
      shell: '/bin/sh',
    })
  } catch {
    // nothing listening
  }
}

async function globalTeardown(config: FullConfig): Promise<void> {
  if (!IS_LOCAL) return

  if (fs.existsSync(SERVER_PIDS_FILE)) {
    const pids: Record<string, number> = JSON.parse(fs.readFileSync(SERVER_PIDS_FILE, 'utf8'))
    for (const pid of Object.values(pids)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* already exited */
      }
    }
    fs.unlinkSync(SERVER_PIDS_FILE)
  }

  const serverCount = SNAPSHOTS_ENABLED ? snapshotWorkerCount() : config.workers
  for (let i = 0; i < serverCount; i++) {
    killServerOnPort(BASE_PORT + i)
  }
}

export default globalTeardown
