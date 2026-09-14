import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/jobs/backup', () => ({ runBackupJob: vi.fn(async () => 'backup-ran') }))
vi.mock('@/jobs/digest', () => ({ runDigestJob: vi.fn(async () => 'digest-ran') }))
vi.mock('@/jobs/nudges', () => ({ runNudgesJob: vi.fn(async () => 'nudges-ran') }))
vi.mock('@/jobs/applications', () => ({
  runApplicationsSummaryJob: vi.fn(async () => 'summary-ran'),
  runApplicationsAnonymisationJob: vi.fn(async () => 'anon-ran'),
}))
vi.mock('@/jobs/csp-summary', () => ({ runCspSummaryJob: vi.fn(async () => 'csp-ran') }))

import { CRON_JOBS, CRON_JOB_NAMES } from './cron-jobs'

describe('CRON_JOBS', () => {
  it('wraps every named job in an audited run', async () => {
    const expected: Record<string, string> = {
      backup: 'backup-ran',
      digest: 'digest-ran',
      nudges: 'nudges-ran',
      'applications-summary': 'summary-ran',
      'applications-anonymisation': 'anon-ran',
      'csp-summary': 'csp-ran',
    }
    for (const name of CRON_JOB_NAMES) {
      expect(await CRON_JOBS[name]('admin')).toBe(expected[name])
      const run = await prisma.cronJobRun.findFirstOrThrow({ orderBy: { id: 'desc' } })
      expect(run).toMatchObject({ jobName: name, status: 'success', triggeredBy: 'admin' })
    }
  })
})
