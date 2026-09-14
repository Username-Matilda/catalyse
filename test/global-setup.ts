import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATE_DB, TEST_DB_DIR } from './db-paths'

/**
 * Runs once per `vitest` invocation. Builds a single freshly migrated SQLite database that
 * `setup-db.ts` then copies for every test file — copying a file is milliseconds, whereas
 * `prisma migrate deploy` is a second or two, which would dominate a run of many files.
 */
export default function globalSetup() {
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DB_DIR, { recursive: true })
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
    stdio: 'pipe',
  })
  return () => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true })
  }
}
