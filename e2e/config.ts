import path from 'path';
import os from 'os';

const _remoteBaseUrl = process.env.BASE_URL;
export const IS_LOCAL = !_remoteBaseUrl || _remoteBaseUrl.startsWith('http://localhost');

export const ADMIN_EMAIL = 'admin@e2e-test.com';
export const ADMIN_PASSWORD = 'adminpassword1';

export const BASE_PORT = 8002;
export const WORKER_COUNT = 4;

export function workerBaseUrl(parallelIndex: number): string {
  if (IS_LOCAL) return `http://localhost:${BASE_PORT + parallelIndex}`;
  return _remoteBaseUrl!;
}

export function parallelIndexFromBaseUrl(baseUrl: string): number {
  if (!IS_LOCAL) return 0;
  const port = parseInt(new URL(baseUrl).port, 10);
  return port - BASE_PORT;
}

export function workerAuthFile(parallelIndex: number): string {
  return path.join(__dirname, '.auth', `admin_${parallelIndex}.json`);
}

export function workerDbDir(parallelIndex: number): string {
  return path.join(os.tmpdir(), `catalyse_e2e_${parallelIndex}`);
}

export const SERVER_PIDS_FILE = path.join(os.tmpdir(), 'catalyse_e2e_pids.json');
