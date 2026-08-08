export const CRON_JOB_NAMES = [
  'backup',
  'digest',
  'nudges',
  'applications-summary',
  'applications-anonymisation',
] as const

export type CronJobName = (typeof CRON_JOB_NAMES)[number]

export const CRON_JOB_INFO: Record<CronJobName, { description: string; idempotent: boolean }> = {
  backup: {
    description: 'Snapshots the database locally and uploads it to B2, then prunes old backups.',
    idempotent: false,
  },
  digest: {
    description: 'Emails volunteers a fortnightly digest of new matching projects.',
    idempotent: true,
  },
  nudges: {
    description:
      'Emails nudges/warnings for stale in-progress tasks, and surrenders tasks inactive 28+ days.',
    idempotent: true,
  },
  'applications-summary': {
    description: 'Emails superadmins a count of pending volunteer applications.',
    idempotent: true,
  },
  'applications-anonymisation': {
    description: 'Anonymises rejected applications past the retention period.',
    idempotent: true,
  },
}
