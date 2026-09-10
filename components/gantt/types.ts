import type { ScheduledItem } from '@/lib/schedule'

/** One bar on the chart: a work item, its computed placement, and how to label/link it. */
export type GanttRow = {
  id: number
  label: string
  /** Optional deep link for the row's name. */
  href?: string
  /** Status string (TaskStatus / ProjectStatus) — drives the bar colour. */
  status: string
  placement: ScheduledItem
}

/** A finish-to-start edge, already filtered to rows present on the chart. */
export type GanttEdge = {
  /** Dependency row id, when the caller has it (lets the panel edit the link). */
  id?: number
  predecessorId: number
  successorId: number
  lagDays: number
}
