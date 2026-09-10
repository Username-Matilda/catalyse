'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import { startOfUtcDay } from '@/lib/schedule'
import Button from '@/components/Button'
import GanttRow from './GanttRow'
import GanttDependencyLayer from './GanttDependencyLayer'
import {
  dateToX,
  headerTicks,
  rangeWidth,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  PX_PER_DAY,
  type ZoomLevel,
} from './geometry'
import { patchFromDrag, type DragData, type ReschedulePatch } from './useGanttDrag'
import type { GanttEdge, GanttRow as GanttRowData } from './types'

const ZOOMS: { key: ZoomLevel; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

const NAME_COL_WIDTH = 200

/** Move and resize run along the timeline only — never up or down between rows. */
const lockYForBarDrags: Modifier = ({ transform, active }) => {
  const kind = (active?.data.current as DragData | undefined)?.kind
  if (kind === 'move' || kind === 'resize-end') return { ...transform, y: 0 }
  return transform
}

export default function GanttChart({
  rows,
  edges,
  rangeStart,
  rangeEnd,
  editable = false,
  selectedId,
  onSelect,
  onReschedule,
  onLink,
}: {
  rows: GanttRowData[]
  edges: GanttEdge[]
  rangeStart: Date
  rangeEnd: Date
  editable?: boolean
  selectedId?: number | null
  onSelect?: (id: number) => void
  onReschedule?: (patch: ReschedulePatch) => void
  onLink?: (predecessorId: number, successorId: number) => void
}) {
  const [zoom, setZoom] = useState<ZoomLevel>('day')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const origin = startOfUtcDay(rangeStart)
  const width = Math.max(rangeWidth(origin, rangeEnd, zoom), 240)
  const bodyHeight = Math.max(rows.length * ROW_HEIGHT, ROW_HEIGHT)
  const ticks = headerTicks(origin, rangeEnd, zoom)
  const todayX = dateToX(new Date(), origin, zoom)
  const todayVisible = todayX >= 0 && todayX <= width

  function handleDragEnd(event: DragEndEvent) {
    const data = event.active.data.current as DragData | undefined
    if (!data) return
    const row = rows.find((r) => r.id === data.rowId)
    if (!row) return

    if (data.kind === 'link') {
      const targetId = (event.over?.data.current as { rowId?: number } | undefined)?.rowId
      if (targetId && targetId !== row.id) onLink?.(row.id, targetId)
      return
    }
    const patch = patchFromDrag(row, data, event.delta.x, zoom)
    if (patch) onReschedule?.(patch)
  }

  const body = (
    <div className="border-brand-border flex overflow-hidden rounded-lg border">
      {/* Fixed name column. */}
      <div className="border-brand-border shrink-0 border-r" style={{ width: NAME_COL_WIDTH }}>
        <div
          className="border-brand-border text-text-light border-b px-3 text-xs font-medium"
          style={{ height: HEADER_HEIGHT, lineHeight: `${HEADER_HEIGHT}px` }}
        >
          Task
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            className="border-brand-border truncate border-b px-3 text-sm"
            style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
            title={r.label}
          >
            {r.href ? (
              <Link href={r.href} className="text-primary-text hover:underline">
                {r.label}
              </Link>
            ) : (
              r.label
            )}
          </div>
        ))}
      </div>

      {/* Scrollable timeline. */}
      <div className="flex-1 overflow-x-auto">
        <div style={{ width }}>
          <div className="border-brand-border relative border-b" style={{ height: HEADER_HEIGHT }}>
            {ticks.map((t, i) => (
              <div
                key={i}
                className={`absolute top-0 h-full whitespace-nowrap pl-1 text-xs ${
                  t.major ? 'text-brand-text font-medium' : 'text-text-light'
                }`}
                style={{ left: t.x, borderLeft: '1px solid var(--color-brand-border)' }}
              >
                {t.label}
              </div>
            ))}
          </div>

          <div className="relative" style={{ height: bodyHeight }}>
            {zoom === 'day' &&
              ticks.map((t, i) => (
                <div
                  key={`grid-${i}`}
                  className="absolute top-0 h-full"
                  style={{
                    left: t.x,
                    borderLeft: '1px solid var(--color-brand-border)',
                    opacity: 0.5,
                  }}
                />
              ))}

            <GanttDependencyLayer
              rows={rows}
              edges={edges}
              origin={origin}
              zoom={zoom}
              width={width}
              height={bodyHeight}
            />

            {rows.map((r) => (
              <div key={r.id} className="border-brand-border border-b">
                <GanttRow
                  row={r}
                  origin={origin}
                  zoom={zoom}
                  editable={editable}
                  selected={selectedId === r.id}
                  onSelect={onSelect}
                />
              </div>
            ))}

            {todayVisible && (
              <div
                className="pointer-events-none absolute top-0"
                style={{
                  left: todayX,
                  height: bodyHeight,
                  borderLeft: '2px solid var(--color-error)',
                  opacity: 0.6,
                }}
                title="Today"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-text-light text-sm">Zoom</span>
        {ZOOMS.map((z) => (
          <Button
            key={z.key}
            size="sm"
            variant={zoom === z.key ? 'primary' : 'secondary'}
            onClick={() => setZoom(z.key)}
          >
            {z.label}
          </Button>
        ))}
      </div>

      {/* The context is always present so GanttRow's drag hooks resolve; sensors are only
          wired when the chart is editable, so a read-only chart never starts a drag. */}
      <DndContext
        sensors={editable ? sensors : undefined}
        modifiers={[lockYForBarDrags]}
        onDragEnd={editable ? handleDragEnd : undefined}
      >
        {body}
      </DndContext>

      <p className="text-text-light mt-2 text-xs">
        Thin bar above = planned (baseline). Thin bar below = actual. Red line = today.
        {editable ? ' Drag a bar to move it, its right edge to resize, the dot to link.' : ''}
        {PX_PER_DAY[zoom] < 8 ? ' Zoom in for day detail.' : ''}
      </p>
    </div>
  )
}
