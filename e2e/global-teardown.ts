import fs from 'fs';
import { IS_LOCAL, SERVER_PID_FILE } from './config';

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
}

export default globalTeardown;
