#!/usr/bin/env node
/**
 * Manual copy of a SQLite database file into the Postgres database at DATABASE_URL, whose
 * schema must already be migrated. The target's tables are truncated first.
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-pg.ts --from backup.db --confirm
 *
 * Prints per-table row counts for both sides and rolls back if any differ.
 */

import { DatabaseSync } from 'node:sqlite'
import { Client } from 'pg'
import { libpqUrl } from '../jobs/backup'
import { resolveDbUrl } from '../lib/db-url'
import { copySqliteToPostgres } from './sqlite-to-pg'

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
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
  try {
    const counts = await copySqliteToPostgres(sqlite, pg)
    console.log('\nRow counts (sqlite → postgres):')
    for (const c of counts) {
      console.log(
        `${c.table.padEnd(40)} ${String(c.sqlite).padStart(7)} → ${String(c.postgres).padStart(7)}`,
      )
    }
    console.log('\nDone.')
  } finally {
    await pg.end()
    sqlite.close()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
