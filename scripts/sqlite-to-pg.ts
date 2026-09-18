/**
 * Copies every row of a SQLite database into a Postgres database whose schema is already
 * migrated. Values are converted where SQLite and Postgres storage differ: booleans are 0/1
 * integers, DateTimes are epoch milliseconds (or, in rows written by an old CURRENT_TIMESTAMP
 * default, 'YYYY-MM-DD HH:MM:SS' text in UTC).
 */

import type { DatabaseSync } from 'node:sqlite'
import type { Client } from 'pg'

// `optional`: the column is nullable or has a default, so a source without it can be loaded.
type Column = { name: string; dataType: string; optional: boolean }
type Table = { name: string; columns: Column[] }
export type TableCount = { table: string; sqlite: number; postgres: number }

const SKIP_TABLES = new Set(['_prisma_migrations'])
const BATCH_ROWS = 500

async function readTables(pg: Client): Promise<Table[]> {
  const { rows } = await pg.query<{
    table_name: string
    column_name: string
    data_type: string
    optional: boolean
  }>(`
    SELECT c.table_name, c.column_name, c.data_type,
      (c.is_nullable = 'YES' OR c.column_default IS NOT NULL) AS optional
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
    tables
      .get(r.table_name)!
      .columns.push({ name: r.column_name, dataType: r.data_type, optional: r.optional })
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
  const missing = table.columns.filter((c) => !sqliteCols.has(c.name))
  const required = missing.filter((c) => !c.optional).map((c) => c.name)
  if (required.length)
    throw new Error(`${table.name}: columns missing from SQLite: ${required.join(', ')}`)

  // A column added after the source was written takes its Postgres default (or NULL).
  const cols = table.columns.filter((c) => sqliteCols.has(c.name))
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

/**
 * Truncates every table in the target and loads the SQLite rows in one transaction. Per-table
 * row counts are compared before the commit, so a mismatch rolls the whole load back and the
 * target is left exactly as it was.
 */
export async function copySqliteToPostgres(
  sqlite: DatabaseSync,
  pg: Client,
  log: (line: string) => void = console.log,
): Promise<TableCount[]> {
  const tables = await readTables(pg)
  const counts: TableCount[] = []

  await setConstraintsDeferrable(pg, true)
  try {
    await pg.query('BEGIN')
    try {
      await pg.query(
        `TRUNCATE ${tables.map((t) => `"${t.name}"`).join(', ')} RESTART IDENTITY CASCADE`,
      )
      for (const t of tables) {
        const n = await copyTable(sqlite, pg, t)
        log(`${t.name.padEnd(40)} ${n}`)
      }
      await resetSequences(pg, tables)

      for (const t of tables) {
        const sqliteCount = Number(
          (sqlite.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number }).n,
        )
        const { rows } = await pg.query<{ n: string }>(`SELECT COUNT(*) AS n FROM "${t.name}"`)
        counts.push({ table: t.name, sqlite: sqliteCount, postgres: Number(rows[0].n) })
      }
      const bad = counts.filter((c) => c.sqlite !== c.postgres)
      if (bad.length)
        throw new Error(
          `Row counts differ, load rolled back: ${bad.map((c) => `${c.table} ${c.sqlite}→${c.postgres}`).join(', ')}`,
        )
      await pg.query('COMMIT')
    } catch (err) {
      await pg.query('ROLLBACK')
      throw err
    }
  } finally {
    await setConstraintsDeferrable(pg, false)
  }
  return counts
}
