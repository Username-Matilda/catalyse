/**
 * Timeline scheduling for work items.
 *
 * Pure date arithmetic over ids — this module knows nothing about Prisma, projects or tasks, so
 * the same code runs on the server (to produce the authoritative schedule) and in the browser (to
 * preview a drag before it is saved). Both sides must agree, which is why there is only one copy.
 *
 * The model is finish-to-start with lag. An item is either:
 *   - pinned    — it has a `startDate`, and sits there regardless of what moves around it; or
 *   - derived   — it has none, and starts once every predecessor has finished (+1 day +lag).
 * An item with neither a pin nor a predecessor falls back to the scope's origin.
 */

const MS_PER_DAY = 86_400_000

export type ScheduleInput = {
  id: number
  /** Pinned anchor, or null to derive the start from predecessors. */
  startDate: Date | null
  /** null is read as 1 day. */
  durationDays: number | null
  deadline: Date | null
  baselineStartDate: Date | null
  baselineDurationDays: number | null
  startedAt: Date | null
  completedAt: Date | null
}

export type ScheduleEdge = {
  predecessorId: number
  successorId: number
  lagDays: number
}

export type DateSpan = { start: Date; end: Date }

export type ScheduledItem = {
  id: number
  /** Inclusive start of the current schedule. */
  start: Date
  /** Inclusive end — a 1-day item has start === end. */
  end: Date
  isPinned: boolean
  /** Start came from a predecessor rather than from the origin. */
  isDerived: boolean
  breachesDeadline: boolean
  /** Pin is earlier than the dependencies allow. The pin wins; this flags the conflict. */
  pinnedBeforePredecessor: boolean
  /** On the longest chain through the scope. */
  isCritical: boolean
  baseline: DateSpan | null
  /** `end` null means work has started but not finished. */
  actual: { start: Date; end: Date | null } | null
  startVarianceDays: number | null
  finishVarianceDays: number | null
}

export type Schedule = {
  scheduled: ScheduledItem[]
  byId: Map<number, ScheduledItem>
  /** Earliest start across the scope, or the origin when the scope is empty. */
  start: Date
  /** Latest end across the scope, or the origin when the scope is empty. */
  end: Date
}

/** Midnight UTC on the same calendar day, so day arithmetic never drifts across timezones. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. Both are snapped to UTC days. */
export function diffInDays(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / MS_PER_DAY)
}

/** A duration of `n` days starting on `start` ends on day `n - 1`, so a 1-day item is a point. */
function endOfSpan(start: Date, durationDays: number | null): Date {
  return addDays(start, Math.max(1, durationDays ?? 1) - 1)
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

/**
 * Returns the ids forming a dependency cycle, or null when the graph is acyclic.
 * Call this before writing a new edge — a cycle has no valid schedule, so it is refused
 * rather than stored.
 */
export function findDependencyCycle(edges: ScheduleEdge[]): number[] | null {
  const successors = new Map<number, number[]>()
  for (const edge of edges) {
    const list = successors.get(edge.predecessorId)
    if (list) list.push(edge.successorId)
    else successors.set(edge.predecessorId, [edge.successorId])
  }

  const UNVISITED = 0
  const IN_STACK = 1
  const DONE = 2
  const state = new Map<number, number>()
  const path: number[] = []

  function visit(id: number): number[] | null {
    state.set(id, IN_STACK)
    path.push(id)

    for (const next of successors.get(id) ?? []) {
      const nextState = state.get(next) ?? UNVISITED
      if (nextState === IN_STACK) {
        // `next` is still on the stack, so the walk from it back to here closes a loop.
        return path.slice(path.indexOf(next)).concat(next)
      }
      if (nextState === UNVISITED) {
        const cycle = visit(next)
        if (cycle) return cycle
      }
    }

    path.pop()
    state.set(id, DONE)
    return null
  }

  for (const id of successors.keys()) {
    if ((state.get(id) ?? UNVISITED) === UNVISITED) {
      const cycle = visit(id)
      if (cycle) return cycle
    }
  }
  return null
}

/**
 * Places every item on the calendar.
 *
 * Items are visited in topological order so each one is positioned only after its predecessors
 * are final. Any edge that survives a cycle (which `findDependencyCycle` should have blocked at
 * write time) is dropped here rather than hanging the caller — a schedule that renders is more
 * useful than none.
 */
export function computeSchedule(
  items: ScheduleInput[],
  edges: ScheduleEdge[],
  origin: Date,
): Schedule {
  const scopeOrigin = startOfUtcDay(origin)
  const itemById = new Map(items.map((item) => [item.id, item]))

  // Ignore edges pointing outside this scope; callers assemble scopes independently and a
  // dangling reference must not stall the topological pass.
  const liveEdges = edges.filter(
    (edge) => itemById.has(edge.predecessorId) && itemById.has(edge.successorId),
  )

  const predecessorsOf = new Map<number, ScheduleEdge[]>()
  const successorsOf = new Map<number, ScheduleEdge[]>()
  const indegree = new Map<number, number>(items.map((item) => [item.id, 0]))

  for (const edge of liveEdges) {
    const preds = predecessorsOf.get(edge.successorId)
    if (preds) preds.push(edge)
    else predecessorsOf.set(edge.successorId, [edge])

    const succs = successorsOf.get(edge.predecessorId)
    if (succs) succs.push(edge)
    else successorsOf.set(edge.predecessorId, [edge])

    indegree.set(edge.successorId, (indegree.get(edge.successorId) ?? 0) + 1)
  }

  const queue = items.filter((item) => (indegree.get(item.id) ?? 0) === 0).map((item) => item.id)
  const order: number[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const edge of successorsOf.get(id) ?? []) {
      const remaining = (indegree.get(edge.successorId) ?? 0) - 1
      indegree.set(edge.successorId, remaining)
      if (remaining === 0) queue.push(edge.successorId)
    }
  }
  // Anything left has an indegree that never reached zero, i.e. it sits on a cycle. Append it in
  // input order so it is still drawn, just without dependency-derived placement.
  if (order.length < items.length) {
    const placed = new Set(order)
    for (const item of items) if (!placed.has(item.id)) order.push(item.id)
  }

  const spans = new Map<number, DateSpan>()
  const results = new Map<number, ScheduledItem>()

  for (const id of order) {
    const item = itemById.get(id)!
    const preds = predecessorsOf.get(id) ?? []

    let earliest = scopeOrigin
    let isDerived = false
    for (const edge of preds) {
      const predSpan = spans.get(edge.predecessorId)
      if (!predSpan) continue // predecessor sat on a cycle; ignore this constraint
      isDerived = true
      earliest = laterOf(earliest, addDays(predSpan.end, 1 + edge.lagDays))
    }

    const pinned = item.startDate ? startOfUtcDay(item.startDate) : null
    const start = pinned ?? earliest
    const end = endOfSpan(start, item.durationDays)
    spans.set(id, { start, end })

    const baseline =
      item.baselineStartDate === null
        ? null
        : (() => {
            const baseStart = startOfUtcDay(item.baselineStartDate!)
            return { start: baseStart, end: endOfSpan(baseStart, item.baselineDurationDays) }
          })()

    const actual =
      item.startedAt === null
        ? null
        : {
            start: startOfUtcDay(item.startedAt),
            end: item.completedAt ? startOfUtcDay(item.completedAt) : null,
          }

    results.set(id, {
      id,
      start,
      end,
      isPinned: pinned !== null,
      isDerived: isDerived && pinned === null,
      breachesDeadline:
        item.deadline !== null && end.getTime() > startOfUtcDay(item.deadline).getTime(),
      pinnedBeforePredecessor:
        pinned !== null && isDerived && pinned.getTime() < earliest.getTime(),
      isCritical: false,
      baseline,
      actual,
      startVarianceDays: baseline ? diffInDays(baseline.start, start) : null,
      finishVarianceDays: baseline ? diffInDays(baseline.end, end) : null,
    })
  }

  markCriticalPath(order, results, successorsOf)

  const scheduled = items.map((item) => results.get(item.id)!)
  const scopeStart = scheduled.reduce(
    (acc, item) => (item.start.getTime() < acc.getTime() ? item.start : acc),
    scheduled.length > 0 ? scheduled[0].start : scopeOrigin,
  )
  const scopeEnd = scheduled.reduce(
    (acc, item) => (item.end.getTime() > acc.getTime() ? item.end : acc),
    scheduled.length > 0 ? scheduled[0].end : scopeOrigin,
  )

  return { scheduled, byId: results, start: scopeStart, end: scopeEnd }
}

/**
 * Marks the chain that determines the scope's finish: walking back from the latest-finishing
 * items, an item is critical when a critical successor starts exactly when this one's
 * constraint allows. Slipping any of them slips the whole scope.
 */
function markCriticalPath(
  order: number[],
  results: Map<number, ScheduledItem>,
  successorsOf: Map<number, ScheduleEdge[]>,
): void {
  if (results.size === 0) return

  let latest = -Infinity
  for (const item of results.values()) latest = Math.max(latest, item.end.getTime())

  for (let i = order.length - 1; i >= 0; i--) {
    const item = results.get(order[i])
    if (!item) continue

    if (item.end.getTime() === latest) {
      item.isCritical = true
      continue
    }
    item.isCritical = (successorsOf.get(item.id) ?? []).some((edge) => {
      const successor = results.get(edge.successorId)
      if (!successor?.isCritical) return false
      // The successor is only held up by this item if it starts the moment this one permits.
      return successor.start.getTime() === addDays(item.end, 1 + edge.lagDays).getTime()
    })
  }
}
