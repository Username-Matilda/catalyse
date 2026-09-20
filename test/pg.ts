import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { resolveDbUrl } from '../lib/db-url'

/**
 * Every test file gets its own Postgres database, cloned from one template that global setup
 * migrates once. Cloning copies files instead of replaying the migration SQL, which is what
 * made a run with many test files expensive. The URL each file hands to Prisma carries
 * `?schema=public`, the schema the template's tables live in.
 *
 * The role in the URL needs CREATEDB. `TEST_DATABASE_URL` points the suite at a throwaway
 * server (see docker-compose.yml) so it never shares one with development data; without it
 * the suite uses `DATABASE_URL`.
 */
export const DB_PREFIX = 'vitest_'

const TEMPLATE_DB = `${DB_PREFIX}template`
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'prisma', 'migrations')

/** Postgres refuses a clone while anything, even autovacuum, is connected to the template. */
const OBJECT_IN_USE = '55006'
const CLONE_ATTEMPTS = 20

export function resolveTestDbUrl(): string {
  return process.env.TEST_DATABASE_URL || resolveDbUrl()
}

export function migrationSql(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((dir) => fs.readFileSync(path.join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
    .join('\n')
}

function urlForDatabase(database: string): URL {
  const url = new URL(resolveTestDbUrl())
  url.pathname = `/${database}`
  return url
}

export function testUrl(database: string): string {
  const url = urlForDatabase(database)
  url.searchParams.set('schema', 'public')
  // Prisma's default pool is 2 × cores + 1 per client; with a worker per core that overruns
  // Postgres's default max_connections on a large machine. Test files are mostly sequential.
  url.searchParams.set('connection_limit', '3')
  return url.toString()
}

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString })
  await client.connect()
  return client
}

/** Runs against the server's own database, from which databases are created and dropped. */
export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(resolveTestDbUrl())
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** Builds the template every test database is cloned from. */
export async function createTemplate(): Promise<void> {
  await withClient((client) => client.query(`CREATE DATABASE "${TEMPLATE_DB}"`))
  const client = await connect(urlForDatabase(TEMPLATE_DB).toString())
  try {
    await client.query(migrationSql())
  } finally {
    await client.end()
  }
}

export async function createDatabase(database: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await withClient((client) =>
        client.query(`CREATE DATABASE "${database}" TEMPLATE "${TEMPLATE_DB}"`),
      )
      return
    } catch (e) {
      if ((e as { code?: string }).code !== OBJECT_IN_USE || attempt === CLONE_ATTEMPTS) throw e
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt))
    }
  }
}

export async function dropDatabase(database: string): Promise<void> {
  // FORCE disconnects a query the test file left in flight, which would otherwise block the drop.
  await withClient((client) => client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`))
}

/** Drops the template and any database an interrupted run left behind. */
export async function dropStaleDatabases(): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname LIKE $1`,
      [`${DB_PREFIX.replace('_', '\\_')}%`],
    )
    for (const { datname } of rows) {
      await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`)
    }
  })
}
