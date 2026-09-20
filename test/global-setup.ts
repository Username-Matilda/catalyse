import { dropStale, prepareTestDb } from './pg'

/** Runs once per `vitest` invocation; see `prepareTestDb`. */
export default async function globalSetup() {
  await prepareTestDb()
  return async () => {
    await dropStale()
  }
}
