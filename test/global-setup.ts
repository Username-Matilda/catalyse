import { createTemplate, dropStaleDatabases } from './pg'

/**
 * Runs once per `vitest` invocation. Clears databases left by an interrupted run, then
 * migrates the template every test file clones, so a broken migration or an unreachable
 * database fails here with one clear error instead of once per test file.
 */
export default async function globalSetup() {
  await dropStaleDatabases()
  await createTemplate()
  return async () => {
    await dropStaleDatabases()
  }
}
