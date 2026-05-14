import { execSync } from 'child_process'
import { DatabaseSync } from 'node:sqlite'
import { resolveDbUrl } from '../lib/db-url'
import { runBackup } from '../lib/backup'

process.env.DATABASE_URL = resolveDbUrl()

// DB snapshots may have been taken before a migration was recorded in _prisma_migrations
// (columns/tables exist via db push or manual ALTER, record missing). Resolve it so
// migrate deploy doesn't fail. Safe to run on prod — if already recorded, the SELECT guard
// skips it. Remove entries once all environments are clean.
const CATCH_UP: Array<{ name: string; detect: (db: DatabaseSync) => boolean }> = [
  {
    name: '20260514115514_add_digest_runs_and_task_nudge_tracking',
    detect: (db) =>
      !!db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='digest_runs'")
        .get(),
  },
  {
    name: '20260514200000_add_approval_status',
    detect: (db) =>
      (
        db
          .prepare("SELECT name FROM pragma_table_info('volunteers') WHERE name='approval_status'")
          .all() as unknown[]
      ).length > 0,
  },
]

async function main() {
  if (process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
    console.log('[MIGRATE] Running pre-deploy backup...')
    await runBackup().catch((err) => console.error('[MIGRATE] Backup failed (continuing):', err))
  }

  const dbUrl = process.env.DATABASE_URL ?? ''
  if (dbUrl.startsWith('file:')) {
    const dbPath = dbUrl.slice(5)
    try {
      const toResolve: string[] = []
      const db = new DatabaseSync(dbPath)
      const hasMigrationsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'")
        .get()
      if (hasMigrationsTable) {
        for (const { name, detect } of CATCH_UP) {
          const alreadyApplied = detect(db)
          const migrationRecorded = db
            .prepare(`SELECT id FROM _prisma_migrations WHERE migration_name = '${name}'`)
            .get()
          if (alreadyApplied && !migrationRecorded) toResolve.push(name)
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
}

main().catch((err) => {
  console.error('[MIGRATE] Fatal error:', err)
  process.exit(1)
})
