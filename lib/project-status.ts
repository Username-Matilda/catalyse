import type { BadgeVariant } from '@/components/Badge'
import { ProjectStatus } from '@/generated/prisma/enums'

/**
 * The single source of truth for project lifecycle status — labels, badge colours, and
 * which statuses each role may pick. Server routers, UI and e2e helpers all read from
 * here; previously each kept its own copy and they drifted (notification emails were
 * sending raw enum strings for statuses the server's copy had never heard of).
 *
 *   pending_review → needs_discussion → ready → in_progress → on_hold → completed → archived
 *
 * `ready` means approved and live, but unowned. Assigning an owner is what moves a
 * project to `in_progress`.
 */
export const PROJECT_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  pending_review: { label: 'Pending Review', variant: 'warning' },
  needs_discussion: { label: 'Needs Discussion', variant: 'neutral' },
  ready: { label: 'Ready', variant: 'caution' },
  in_progress: { label: 'In Progress', variant: 'info' },
  on_hold: { label: 'On Hold', variant: 'neutral' },
  completed: { label: 'Completed', variant: 'success' },
  archived: { label: 'Archived', variant: 'neutral' },
}

export const PROJECT_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PROJECT_STATUS_CONFIG).map(([k, v]) => [k, v.label]),
)

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

/** Statuses a project owner may set directly. Admins may set any status. */
export const OWNER_ALLOWED_STATUSES: ProjectStatus[] = [
  ProjectStatus.ready,
  ProjectStatus.in_progress,
  ProjectStatus.on_hold,
  ProjectStatus.completed,
]

/** Additional statuses only an admin may set. */
export const ADMIN_ONLY_STATUSES: ProjectStatus[] = [
  ProjectStatus.archived,
  ProjectStatus.pending_review,
  ProjectStatus.needs_discussion,
]

/** Pre-approval: hidden from browse, never advertised to volunteers. */
export const UNAPPROVED_STATUSES: string[] = [
  ProjectStatus.pending_review,
  ProjectStatus.needs_discussion,
]

/** Finished: no longer taking volunteers, however its flags happen to be set. */
export const TERMINAL_STATUSES: string[] = [ProjectStatus.completed, ProjectStatus.archived]

/**
 * Statuses at which an ownerless project is genuinely looking for an owner: approved
 * ("ready or beyond") but not yet finished. `in_progress`/`on_hold` are included so a
 * project whose owner steps down is re-advertised rather than stranded.
 */
export const SEEKING_OWNER_STATUSES: string[] = [
  ProjectStatus.ready,
  ProjectStatus.in_progress,
  ProjectStatus.on_hold,
]

/**
 * Derived, never stored. There is no `is_seeking_owner` column: a project wants an owner
 * precisely when it hasn't got one and is live. Storing it as a flag meant every mutation
 * that touched ownership had to remember to update it, and several didn't.
 */
export function isSeekingOwner(p: { status: string; assigneeId: number | null }): boolean {
  return p.assigneeId === null && SEEKING_OWNER_STATUSES.includes(p.status)
}

const quoted = (values: string[]) => values.map((v) => `'${v}'`).join(', ')

/** `isSeekingOwner` as a raw SQL predicate, for the hand-written projects.list query. */
export const SEEKING_OWNER_SQL = `(assignee_id IS NULL AND status IN (${quoted(SEEKING_OWNER_STATUSES)}))`

/** Advertisable = approved and not finished. Guards recommendations and admin counts. */
export const ADVERTISABLE_STATUSES_SQL = `status NOT IN (${quoted([...UNAPPROVED_STATUSES, ...TERMINAL_STATUSES])})`

export const ADVERTISABLE_STATUSES: string[] = Object.keys(PROJECT_STATUS_CONFIG).filter(
  (s) => !UNAPPROVED_STATUSES.includes(s) && !TERMINAL_STATUSES.includes(s),
)
