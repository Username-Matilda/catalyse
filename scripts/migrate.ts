import { execSync } from 'child_process'
import { DatabaseSync } from 'node:sqlite'
import { resolveDbUrl } from '../lib/db-url'

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' })
}

const dbUrl = resolveDbUrl()
const dbPath = dbUrl.replace(/^file:/, '')

const db = new DatabaseSync(dbPath)

const hasMigrationTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'")
  .all().length > 0

db.close()

if (!hasMigrationTable) {
  console.log('No _prisma_migrations table found — resolving pre-Prisma migrations as applied...')
  run('npx prisma migrate resolve --applied 20260503000000_baseline')
  run('npx prisma migrate resolve --applied 20260504000000_seed_skills')
}

run('npx prisma migrate deploy')
