import { createSchema, dropSchema, dropStaleSchemas } from './pg'

/**
 * Runs once per `vitest` invocation. Clears schemas left by an interrupted run, then builds
 * and drops one schema so a broken migration or an unreachable database fails here with one
 * clear error instead of once per test file.
 */
export default async function globalSetup() {
  await dropStaleSchemas()
  await createSchema('vitest_probe')
  await dropSchema('vitest_probe')
  return async () => {
    await dropStaleSchemas()
  }
}
