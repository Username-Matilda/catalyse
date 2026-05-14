import { execSync } from 'child_process'
import { DatabaseSync } from 'node:sqlite'
import { resolveDbUrl } from '../lib/db-url'

process.env.DATABASE_URL = resolveDbUrl()

// PR preview DB snapshots may have been taken before this migration was recorded in
// _prisma_migrations on prod (columns exist via db push, record missing). Resolve it
// so migrate deploy doesn't fail with "duplicate column". Safe to run on prod — if
// already recorded, the SELECT guard skips it. Remove once all environments are clean.
const CATCH_UP: Array<{ name: string; detectTable: string }> = [
  {
    name: '20260514115514_add_digest_runs_and_task_nudge_tracking',
    detectTable: 'digest_runs',
  },
]

const dbUrl = process.env.DATABASE_URL
if (dbUrl.startsWith('file:')) {
  const dbPath = dbUrl.slice(5)
  try {
    const toResolve: string[] = []
    const db = new DatabaseSync(dbPath)
    const hasMigrationsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'")
      .get()
    if (hasMigrationsTable) {
      for (const { name, detectTable } of CATCH_UP) {
        const tableExists = db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${detectTable}'`)
          .get()
        const migrationRecorded = db
          .prepare(`SELECT id FROM _prisma_migrations WHERE migration_name = '${name}'`)
          .get()
        if (tableExists && !migrationRecorded) toResolve.push(name)
      }
    }
    db.close()
    for (const name of toResolve) {
      console.log(`Resolving catch-up migration ${name} as already applied...`)
      execSync(`npx prisma migrate resolve --applied ${name}`, { stdio: 'inherit' })
    }
  } catch (err) {
    console.warn('Could not check migration state, proceeding anyway:', err)
  }
}

execSync('npx prisma migrate deploy', { stdio: 'inherit' })
