import { execSync } from 'child_process'
import { DatabaseSync } from 'node:sqlite'
import { resolveDbUrl } from '../lib/db-url'

process.env.DATABASE_URL = resolveDbUrl()

// These tables/columns were added to production via `prisma db push` before proper migration
// files existed. If they're already in the DB but the migration isn't recorded, mark it as
// applied so `migrate deploy` doesn't try to run SQL that would fail on existing objects.
const CATCH_UP_MIGRATIONS: Array<{ name: string; detectTable: string }> = [
  { name: '20260512000000_local_groups', detectTable: 'local_groups' },
  { name: '20260512100000_local_group_suggestions', detectTable: 'local_group_suggestions' },
  {
    name: '20260514115514_add_digest_runs_and_task_nudge_tracking',
    detectTable: 'digest_runs',
  },
]

const dbUrl = process.env.DATABASE_URL
if (dbUrl.startsWith('file:')) {
  const dbPath = dbUrl.slice(5)
  try {
    const db = new DatabaseSync(dbPath)
    const hasMigrationsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'")
      .get()
    if (hasMigrationsTable) {
      for (const { name, detectTable } of CATCH_UP_MIGRATIONS) {
        const tableExists = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='${detectTable}'`,
          )
          .get()
        const migrationRecorded = db
          .prepare(`SELECT id FROM _prisma_migrations WHERE migration_name = '${name}'`)
          .get()
        if (tableExists && !migrationRecorded) {
          console.log(`Resolving catch-up migration ${name} as already applied...`)
          execSync(`npx prisma migrate resolve --applied ${name}`, { stdio: 'inherit' })
        }
      }
    }
    db.close()
  } catch (err) {
    console.warn('Could not check migration state, proceeding anyway:', err)
  }
}

execSync('npx prisma migrate deploy', { stdio: 'inherit' })
