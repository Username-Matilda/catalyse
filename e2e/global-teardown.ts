import { execSync } from 'child_process';
import fs from 'fs';
import { IS_LOCAL, SERVER_PID_FILE } from './config';

function killServerOnPort(port: number): void {
  try {
    // The venv Python launcher uses posix_spawn, so the actual interpreter
    // runs as a sibling process — kill by port to catch it reliably.
    execSync(`lsof -ti :${port} | xargs kill -TERM 2>/dev/null || true`, { shell: true });
  } catch {
    // nothing listening
  }
}

async function globalTeardown(): Promise<void> {
  if (!IS_LOCAL) return;

  if (fs.existsSync(SERVER_PID_FILE)) {
    const pid = parseInt(fs.readFileSync(SERVER_PID_FILE, 'utf8'), 10);
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // process may have already exited
    }
    fs.unlinkSync(SERVER_PID_FILE);
  }

  // Kill any surviving server process (handles posix_spawn launcher orphans)
  killServerOnPort(8002);
}

export default globalTeardown;
