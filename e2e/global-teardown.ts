import { execSync } from 'child_process';
import fs from 'fs';
import { IS_LOCAL, WORKER_COUNT, BASE_PORT, SERVER_PIDS_FILE } from './config';

function killServerOnPort(port: number): void {
  try {
    execSync(`lsof -ti :${port} | xargs kill -TERM 2>/dev/null || true`, { shell: true });
  } catch {
    // nothing listening
  }
}

async function globalTeardown(): Promise<void> {
  if (!IS_LOCAL) return;

  if (fs.existsSync(SERVER_PIDS_FILE)) {
    const pids: Record<number, number> = JSON.parse(fs.readFileSync(SERVER_PIDS_FILE, 'utf8'));
    for (const pid of Object.values(pids)) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already exited */ }
    }
    fs.unlinkSync(SERVER_PIDS_FILE);
  }

  for (let i = 0; i < WORKER_COUNT; i++) {
    killServerOnPort(BASE_PORT + i);
  }
}

export default globalTeardown;
