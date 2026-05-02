import path from 'path';
import os from 'os';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8002';
export const IS_LOCAL = BASE_URL.startsWith('http://localhost');

export const ADMIN_EMAIL = 'admin@e2e-test.com';
export const ADMIN_PASSWORD = 'adminpassword1';

export const TEST_DB_DIR = path.join(os.tmpdir(), 'catalyse_e2e');
export const SERVER_PID_FILE = path.join(os.tmpdir(), 'catalyse_e2e_server.pid');
export const ADMIN_STATE_FILE = path.join(__dirname, '.auth', 'admin.json');
