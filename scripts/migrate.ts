import { execSync } from 'child_process'
import { readdirSync, rmdirSync } from 'fs'
import { join } from 'path'
import { resolveDbUrl } from '../lib/db-url'
import { runBackup } from '../lib/backup'

process.env.DATABASE_URL = resolveDbUrl()

function removeEmptyMigrationDirs() {
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations')
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(migrationsDir, entry.name)
    const files = readdirSync(dir)
    if (!files.includes('migration.sql')) {
      console.warn(
        `[MIGRATE] Warning: migration dir "${entry.name}" has no migration.sql — removing`,
      )
      rmdirSync(dir)
    }
  }
}

async function main() {
  removeEmptyMigrationDirs()

  if (process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
    console.log('[MIGRATE] Running pre-deploy backup...')
    await runBackup().catch((err) => console.error('[MIGRATE] Backup failed (continuing):', err))
  }

  execSync('npx prisma migrate deploy', { stdio: 'inherit' })
}

main().catch((err) => {
  console.error('[MIGRATE] Fatal error:', err)
  process.exit(1)
})
