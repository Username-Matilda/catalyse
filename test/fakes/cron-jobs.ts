import { CRON_JOB_NAMES, type CronJobName } from '@/lib/cron-job-names'
import type { CronJobRunners } from '@/lib/cron-jobs'

/**
 * Stands in for the scheduled jobs, which back up the database and send mail in bulk.
 * Each job records that it ran and resolves to whatever the test set with `returns`, or
 * throws what it set with `fails`. `test/setup-db.ts` installs one per test file and
 * clears it before each test.
 */
export class FakeCronJobs {
  readonly runs: CronJobName[] = []
  private readonly outcomes = new Map<CronJobName, () => Promise<unknown>>()

  readonly runners = Object.fromEntries(
    CRON_JOB_NAMES.map((name) => [
      name,
      async () => {
        this.runs.push(name)
        return this.outcomes.get(name)?.()
      },
    ]),
  ) as CronJobRunners

  /** Makes `name` resolve to `value` when run. */
  returns(name: CronJobName, value: unknown): void {
    this.outcomes.set(name, async () => value)
  }

  /** Makes `name` throw `message` when run. */
  fails(name: CronJobName, message: string): void {
    this.outcomes.set(name, async () => {
      throw new Error(message)
    })
  }

  reset(): void {
    this.runs.length = 0
    this.outcomes.clear()
  }
}

export const cronJobs = new FakeCronJobs()
