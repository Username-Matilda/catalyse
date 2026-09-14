#!/usr/bin/env node
/**
 * One-off: copies every row of a SQLite database (a production backup) into the Postgres
 * database at DATABASE_URL, whose schema must already be migrated. The target's tables are
 * truncated first. Values are converted where SQLite and Postgres storage differ:
 * booleans are 0/1 integers, DateTimes are epoch milliseconds (or, in rows written by an
 * old CURRENT_TIMESTAMP default, 'YYYY-MM-DD HH:MM:SS' text in UTC).
 *
 * Usage:
 *   NODE_OPTIONS=--experimental-sqlite npx tsx scripts/migrate-sqlite-to-pg.ts --from backup.db --confirm
 *
 * Prints per-table row counts for both sides and exits non-zero if any differ.
 */

import { DatabaseSync } from 'node:sqlite'
import { Client } from 'pg'
import { libpqUrl } from '../jobs/backup'
import { resolveDbUrl } from '../lib/db-url'

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

type Column = { name: string; dataType: string }
type Table = { name: string; columns: Column[] }

const SKIP_TABLES = new Set(['_prisma_migrations'])
const BATCH_ROWS = 500

async function readTables(pg: Client): Promise<Table[]> {
  const { rows } = await pg.query<{ table_name: string; column_name: string; data_type: string }>(`
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `)
  const tables = new Map<string, Table>()
  for (const r of rows) {
    if (SKIP_TABLES.has(r.table_name)) continue
    if (!tables.has(r.table_name)) tables.set(r.table_name, { name: r.table_name, columns: [] })
    tables.get(r.table_name)!.columns.push({ name: r.column_name, dataType: r.data_type })
  }
  return [...tables.values()]
}

export function convertValue(dataType: string, value: unknown): unknown {
  if (value === null || value === undefined) return null
  switch (dataType) {
    case 'boolean':
      return typeof value === 'string' ? value === '1' || value === 'true' : Boolean(value)
    case 'timestamp without time zone':
    case 'timestamp with time zone': {
      if (typeof value === 'number' || typeof value === 'bigint') return new Date(Number(value))
      const text = String(value)
      // Bare 'YYYY-MM-DD HH:MM:SS' is UTC; anything with a zone or a 'T' parses as written.
      const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text)
        ? `${text.replace(' ', 'T')}Z`
        : text
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) throw new Error(`Unparseable timestamp: ${text}`)
      return date
    }
    default:
      return typeof value === 'bigint' ? Number(value) : value
  }
}

async function copyTable(sqlite: DatabaseSync, pg: Client, table: Table): Promise<number> {
  const sqliteCols = new Set(
    (sqlite.prepare(`PRAGMA table_info("${table.name}")`).all() as { name: string }[]).map(
      (c) => c.name,
    ),
  )
  const missing = table.columns.filter((c) => !sqliteCols.has(c.name)).map((c) => c.name)
  if (missing.length)
    throw new Error(`${table.name}: columns missing from SQLite: ${missing.join(', ')}`)

  const cols = table.columns
  const colList = cols.map((c) => `"${c.name}"`).join(', ')
  const rows = sqlite.prepare(`SELECT ${colList} FROM "${table.name}"`).all() as Record<
    string,
    unknown
  >[]

  for (let i = 0; i < rows.length; i += BATCH_ROWS) {
    const batch = rows.slice(i, i + BATCH_ROWS)
    const params: unknown[] = []
    const tuples = batch.map((row) => {
      const placeholders = cols.map((c) => {
        params.push(convertValue(c.dataType, row[c.name]))
        return `$${params.length}`
      })
      return `(${placeholders.join(', ')})`
    })
    await pg.query(`INSERT INTO "${table.name}" (${colList}) VALUES ${tuples.join(', ')}`, params)
  }
  return rows.length
}

async function resetSequences(pg: Client, tables: Table[]): Promise<void> {
  for (const t of tables) {
    if (!t.columns.some((c) => c.name === 'id')) continue
    await pg.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM "${t.name}"), 0) + 1, false)`,
      [`"${t.name}"`],
    )
  }
}

/** Constraints are made deferrable for the load so insertion order never matters. */
async function setConstraintsDeferrable(pg: Client, deferrable: boolean): Promise<void> {
  const { rows } = await pg.query<{ table_name: string; conname: string }>(`
    SELECT conrelid::regclass::text AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f' AND connamespace = current_schema()::regnamespace
  `)
  for (const r of rows) {
    await pg.query(
      `ALTER TABLE ${r.table_name} ALTER CONSTRAINT "${r.conname}" ${deferrable ? 'DEFERRABLE INITIALLY DEFERRED' : 'NOT DEFERRABLE'}`,
    )
  }
}

async function main(): Promise<void> {
  const from = argValue('--from')
  if (!from) {
    console.error('Usage: migrate-sqlite-to-pg.ts --from <sqlite file> --confirm')
    process.exit(1)
  }
  const dbUrl = libpqUrl(resolveDbUrl())
  const target = new URL(dbUrl)
  console.log(`Source: ${from}`)
  console.log(`Target: ${target.host}${target.pathname} (all tables will be truncated)`)
  if (!process.argv.includes('--confirm')) {
    console.error('Re-run with --confirm to proceed.')
    process.exit(1)
  }

  const sqlite = new DatabaseSync(from, { readOnly: true })
  const pg = new Client({ connectionString: dbUrl })
  await pg.connect()

  const tables = await readTables(pg)
  const counts: { table: string; sqlite: number; postgres: number }[] = []

  try {
    await setConstraintsDeferrable(pg, true)
    await pg.query('BEGIN')
    await pg.query(
      `TRUNCATE ${tables.map((t) => `"${t.name}"`).join(', ')} RESTART IDENTITY CASCADE`,
    )
    for (const t of tables) {
      const n = await copyTable(sqlite, pg, t)
      console.log(`${t.name.padEnd(40)} ${n}`)
    }
    await resetSequences(pg, tables)
    await pg.query('COMMIT')
  } catch (err) {
    await pg.query('ROLLBACK')
    throw err
  } finally {
    await setConstraintsDeferrable(pg, false)
  }

  let mismatch = false
  for (const t of tables) {
    const sqliteCount = Number(
      (sqlite.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number }).n,
    )
    const { rows } = await pg.query<{ n: string }>(`SELECT COUNT(*) AS n FROM "${t.name}"`)
    const postgresCount = Number(rows[0].n)
    counts.push({ table: t.name, sqlite: sqliteCount, postgres: postgresCount })
    if (sqliteCount !== postgresCount) mismatch = true
  }
  await pg.end()
  sqlite.close()

  console.log('\nRow counts (sqlite → postgres):')
  for (const c of counts) {
    const flag = c.sqlite === c.postgres ? '' : '  MISMATCH'
    console.log(
      `${c.table.padEnd(40)} ${String(c.sqlite).padStart(7)} → ${String(c.postgres).padStart(7)}${flag}`,
    )
  }
  if (mismatch) {
    console.error('\nRow counts differ; the load was committed but must be investigated.')
    process.exit(2)
  }
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
