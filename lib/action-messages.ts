/**
 * What a volunteer is told after an action another person has to answer. Each says who
 * has it and what happens next, so the toast is not the only record of it.
 */

export function interestSentMessage(ownerName: string | null): string {
  return `Sent to ${ownerName ?? 'the project team'}. You'll get a notification when they reply.`
}

export function teamApplicationSentMessage(teamName: string): string {
  return `Sent to the leader of ${teamName}. You'll get a notification when they reply.`
}

export const QUICK_TASK_SUBMITTED_MESSAGE =
  "Submitted. An admin will review it and you'll get a notification."

export const QUICK_TASK_CLAIMED_MESSAGE = "Task claimed. Submit it for review when it's done."

// A claimed project task that goes quiet is reminded about and then released.
export const PROJECT_TASK_CLAIMED_MESSAGE =
  'Task claimed. Post an update when you make progress, or it may be released.'
