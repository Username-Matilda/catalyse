const DAY_MS = 24 * 60 * 60 * 1000

/** A claimed task with no change for longer than this many days is flagged as quiet. */
export const QUIET_AFTER_DAYS = 7

/** Whole days since `updatedAt`, or null while the task is not yet quiet. */
export function daysQuiet(updatedAt: Date | string | null, now = new Date()): number | null {
  if (!updatedAt) return null
  const days = Math.floor((now.getTime() - new Date(updatedAt).getTime()) / DAY_MS)
  return days > QUIET_AFTER_DAYS ? days : null
}

/**
 * Days without an update after which the daily job reminds the assignee of a claimed
 * project task, warns them, and finally releases the task for someone else. Posting a
 * comment or changing the task counts as an update.
 */
export const TASK_REMINDER_AFTER_DAYS = 14
export const TASK_FINAL_WARNING_AFTER_DAYS = 21
export const TASK_RELEASE_AFTER_DAYS = 28

/** The release rule as volunteers read it, on the task page and the privacy page. */
export const TASK_INACTIVITY_RULE = `Post an update within ${TASK_REMINDER_AFTER_DAYS} days. With no update we'll remind you at ${TASK_REMINDER_AFTER_DAYS} days, warn you at ${TASK_FINAL_WARNING_AFTER_DAYS}, and release the task at ${TASK_RELEASE_AFTER_DAYS}.`
