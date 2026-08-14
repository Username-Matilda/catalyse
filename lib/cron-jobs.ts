import { recordCronRun, type CronTriggerSource } from '@/lib/cron-audit'
import { runBackupJob } from '@/jobs/backup'
import { runDigestJob } from '@/jobs/digest'
import { runNudgesJob } from '@/jobs/nudges'
import { runApplicationsSummaryJob, runApplicationsAnonymisationJob } from '@/jobs/applications'
import { type CronJobName } from '@/lib/cron-job-names'

export { CRON_JOB_NAMES, type CronJobName } from '@/lib/cron-job-names'

export const CRON_JOBS: Record<CronJobName, (triggeredBy?: CronTriggerSource) => Promise<unknown>> =
  {
    backup: (triggeredBy) => recordCronRun('backup', runBackupJob, triggeredBy),
    digest: (triggeredBy) => recordCronRun('digest', runDigestJob, triggeredBy),
    nudges: (triggeredBy) => recordCronRun('nudges', runNudgesJob, triggeredBy),
    'applications-summary': (triggeredBy) =>
      recordCronRun('applications-summary', runApplicationsSummaryJob, triggeredBy),
    'applications-anonymisation': (triggeredBy) =>
      recordCronRun('applications-anonymisation', runApplicationsAnonymisationJob, triggeredBy),
  }
