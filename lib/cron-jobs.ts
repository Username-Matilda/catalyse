import { recordCronRun } from '@/lib/cron-audit'
import { runBackupJob } from '@/jobs/backup'
import { runDigestJob } from '@/jobs/digest'
import { runNudgesJob } from '@/jobs/nudges'
import { runApplicationsSummaryJob, runApplicationsAnonymisationJob } from '@/jobs/applications'
import { type CronJobName } from '@/lib/cron-job-names'

export { CRON_JOB_NAMES, type CronJobName } from '@/lib/cron-job-names'

export const CRON_JOBS: Record<CronJobName, () => Promise<unknown>> = {
  backup: () => recordCronRun('backup', runBackupJob),
  digest: () => recordCronRun('digest', runDigestJob),
  nudges: () => recordCronRun('nudges', runNudgesJob),
  'applications-summary': () => recordCronRun('applications-summary', runApplicationsSummaryJob),
  'applications-anonymisation': () =>
    recordCronRun('applications-anonymisation', runApplicationsAnonymisationJob),
}
