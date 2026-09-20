import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { resolveDbUrl } from '../lib/db-url'

/**
 * Every test file gets its own Postgres schema, built by running the migration SQL
 * directly. Schemas rather than databases because the local `prisma dev` server treats
 * every database name as the same database, and because it needs no CREATEDB privilege on
 * a shared server. The URL each file hands to Prisma carries `?schema=<name>`.
 */
export const SCHEMA_PREFIX = 'vitest_'

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'prisma', 'migrations')

export function migrationSql(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((dir) => fs.readFileSync(path.join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
    .join('\n')
}

export function urlWithSchema(schema: string): string {
  const url = new URL(resolveDbUrl())
  url.searchParams.set('schema', schema)
  // Prisma's default pool is 2 × cores + 1 per client; with a worker per core that overruns
  // Postgres's default max_connections on a large machine. Test files are mostly sequential.
  url.searchParams.set('connection_limit', '3')
  return url.toString()
}

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: resolveDbUrl() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function createSchema(schema: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}"`)
    await client.query(migrationSql())
  })
}

export async function dropSchema(schema: string): Promise<void> {
  // A query the test file left in flight can still hold locks in the schema, and Postgres
  // may pick the drop as the deadlock victim.
  for (let attempt = 1; ; attempt++) {
    try {
      await withClient((client) => client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`))
      return
    } catch (e) {
      if ((e as { code?: string }).code !== '40P01' || attempt === 5) throw e
    }
  }
}

export async function dropStaleSchemas(): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE $1`,
      [`${SCHEMA_PREFIX}%`],
    )
    for (const { nspname } of rows) await client.query(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`)
  })
}
