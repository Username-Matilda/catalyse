import path from 'path'
import os from 'os'
import { resolveTestDbUrl } from '../test/pg'

const _remoteBaseUrl = process.env.BASE_URL
export const IS_LOCAL = !_remoteBaseUrl || _remoteBaseUrl.startsWith('http://localhost')

export const ADMIN_EMAIL = 'admin@e2e-test.com'
export const ADMIN_PASSWORD = 'adminpassword1'

export const BASE_PORT = 4000
// Each worker is a Next server (up to ~900 MB) plus a browser. CI has the machine to itself:
// half the cores, never fewer than the four a runner gives, at most eight so the workers'
// connection pools (see workerDbUrl) stay under Postgres's default max_connections. A dev
// machine also runs the editor and Docker, so it takes a quarter of the cores. `WORKER_COUNT`
// (settable in .env.local) overrides either.
export const WORKER_COUNT = process.env.WORKER_COUNT
  ? parseInt(process.env.WORKER_COUNT, 10)
  : process.env.CI
    ? Math.min(8, Math.max(4, Math.floor(os.availableParallelism() / 2)))
    : Math.max(2, Math.floor(os.availableParallelism() / 4))

export function workerBaseUrl(parallelIndex: number): string {
  if (IS_LOCAL) return `http://localhost:${BASE_PORT + parallelIndex}`
  return _remoteBaseUrl!
}

export function parallelIndexFromBaseUrl(baseUrl: string): number {
  if (!IS_LOCAL) return 0
  const port = parseInt(new URL(baseUrl).port, 10)
  return port - BASE_PORT
}

export function workerAuthFile(parallelIndex: number): string {
  return path.join(__dirname, '.auth', `admin_${parallelIndex}.json`)
}

// Each worker's app server gets its own Postgres schema, addressed through Prisma's
// `?schema=` URL parameter.
export function workerDbSchema(parallelIndex: number): string {
  return `e2e_${parallelIndex}`
}

export function workerDbUrl(parallelIndex: number): string {
  const url = new URL(resolveTestDbUrl())
  url.searchParams.set('schema', workerDbSchema(parallelIndex))
  // Each worker's app server gets its own pool; keep the sum well under max_connections.
  url.searchParams.set('connection_limit', '10')
  return url.toString()
}

export const SERVER_PIDS_FILE = path.join(os.tmpdir(), 'catalyse_e2e_pids.json')
