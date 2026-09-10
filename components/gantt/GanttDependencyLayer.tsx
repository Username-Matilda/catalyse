'use client'

import { dateToX, spanToWidth, ROW_HEIGHT, type ZoomLevel } from './geometry'
import type { GanttEdge, GanttRow } from './types'

/**
 * A single SVG overlaid on the bar grid, drawing an elbow connector from the right edge of
 * each predecessor bar to the left edge of its successor. Kept in SVG rather than DOM boxes so
 * the arrowheads and corners stay crisp.
 */
export default function GanttDependencyLayer({
  rows,
  edges,
  origin,
  zoom,
  width,
  height,
}: {
  rows: GanttRow[]
  edges: GanttEdge[]
  origin: Date
  zoom: ZoomLevel
  width: number
  height: number
}) {
  const indexById = new Map(rows.map((r, i) => [r.id, i]))

  const paths = edges.flatMap((edge) => {
    const fromRow = rows.find((r) => r.id === edge.predecessorId)
    const toRow = rows.find((r) => r.id === edge.successorId)
    const fromIndex = indexById.get(edge.predecessorId)
    const toIndex = indexById.get(edge.successorId)
    if (!fromRow || !toRow || fromIndex === undefined || toIndex === undefined) return []

    const barMidY = (i: number) => i * ROW_HEIGHT + ROW_HEIGHT / 2

    const x1 =
      dateToX(fromRow.placement.start, origin, zoom) +
      spanToWidth(fromRow.placement.start, fromRow.placement.end, zoom)
    const y1 = barMidY(fromIndex)
    const x2 = dateToX(toRow.placement.start, origin, zoom)
    const y2 = barMidY(toIndex)

    // Step out from the predecessor, run vertically, then into the successor's start —
    // stopping 4px short so the arrowhead sits just off the bar rather than under it.
    const midX = Math.max(x1 + 10, x2 - 10)
    const d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2 - 4}`

    return [{ key: `${edge.predecessorId}-${edge.successorId}`, d }]
  })

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute left-0 top-0"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="gantt-arrowhead"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-text-light)" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke="var(--color-text-light)"
          strokeWidth={1.5}
          markerEnd="url(#gantt-arrowhead)"
        />
      ))}
    </svg>
  )
}
