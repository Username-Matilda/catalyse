const DAY_MS = 24 * 60 * 60 * 1000

/** A claimed task with no change for longer than this many days is flagged as quiet. */
export const QUIET_AFTER_DAYS = 7

/** Whole days since `updatedAt`, or null while the task is not yet quiet. */
export function daysQuiet(updatedAt: Date | string | null, now = new Date()): number | null {
  if (!updatedAt) return null
  const days = Math.floor((now.getTime() - new Date(updatedAt).getTime()) / DAY_MS)
  return days > QUIET_AFTER_DAYS ? days : null
}
