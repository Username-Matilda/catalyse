'use client'

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { formatDate } from '@/lib/format-date'
import { dateToX, spanToWidth, ROW_HEIGHT, BAR_HEIGHT, type ZoomLevel } from './geometry'
import type { GanttRow as GanttRowData } from './types'

/** Bar fill per status, using the same palette family as the Badge component. */
function barColour(status: string, isCritical: boolean): string {
  if (status === 'completed') return 'var(--color-success)'
  if (status === 'in_progress') return 'var(--color-warning)'
  if (isCritical) return 'var(--color-accent)'
  return 'var(--color-primary)'
}

export default function GanttRow({
  row,
  origin,
  zoom,
  editable,
  selected,
  onSelect,
}: {
  row: GanttRowData
  origin: Date
  zoom: ZoomLevel
  editable: boolean
  selected: boolean
  onSelect?: (id: number) => void
}) {
  const { placement } = row
  const x = dateToX(placement.start, origin, zoom)
  const width = spanToWidth(placement.start, placement.end, zoom)
  const midY = ROW_HEIGHT / 2

  const {
    setNodeRef: moveRef,
    listeners: moveListeners,
    attributes: moveAttrs,
    transform: moveTransform,
  } = useDraggable({ id: `move-${row.id}`, data: { kind: 'move', rowId: row.id } })
  const {
    setNodeRef: resizeRef,
    listeners: resizeListeners,
    attributes: resizeAttrs,
    transform: resizeTransform,
  } = useDraggable({ id: `resize-${row.id}`, data: { kind: 'resize-end', rowId: row.id } })
  const {
    setNodeRef: linkRef,
    listeners: linkListeners,
    attributes: linkAttrs,
  } = useDraggable({ id: `link-${row.id}`, data: { kind: 'link', rowId: row.id } })
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop-${row.id}`,
    data: { rowId: row.id },
  })

  const rangeLabel = `${formatDate(placement.start)} – ${formatDate(placement.end)}`
  const variance =
    placement.startVarianceDays === null || placement.startVarianceDays === 0
      ? null
      : placement.startVarianceDays > 0
        ? `${placement.startVarianceDays} day${placement.startVarianceDays === 1 ? '' : 's'} later than planned`
        : `${-placement.startVarianceDays} day${placement.startVarianceDays === -1 ? '' : 's'} earlier than planned`

  const moveOffset = editable ? (moveTransform?.x ?? 0) : 0
  const resizeOffset = editable ? (resizeTransform?.x ?? 0) : 0

  return (
    <div
      ref={dropRef}
      className="relative"
      style={{
        height: ROW_HEIGHT,
        background: isOver ? 'var(--color-brand-bg)' : undefined,
      }}
    >
      {/* Baseline — thin, muted, behind the current bar. */}
      {placement.baseline && (
        <div
          className="absolute rounded-sm opacity-40"
          style={{
            left: dateToX(placement.baseline.start, origin, zoom),
            width: spanToWidth(placement.baseline.start, placement.baseline.end, zoom),
            top: midY - BAR_HEIGHT / 2 - 5,
            height: 4,
            background: 'var(--color-text-light)',
          }}
          title={`Planned ${formatDate(placement.baseline.start)} – ${formatDate(placement.baseline.end)}`}
        />
      )}

      {/* Current schedule — the interactive bar. */}
      <button
        ref={moveRef}
        type="button"
        {...(editable ? moveListeners : {})}
        {...(editable ? moveAttrs : {})}
        onClick={onSelect ? () => onSelect(row.id) : undefined}
        aria-label={`${row.label}: ${rangeLabel}${variance ? `, ${variance}` : ''}`}
        aria-pressed={selected}
        className="absolute rounded border-0 p-0 text-left focus:outline-2 focus:outline-offset-2"
        style={{
          left: x + moveOffset,
          width: Math.max(width + resizeOffset, 6),
          top: midY - BAR_HEIGHT / 2,
          height: BAR_HEIGHT,
          background: barColour(row.status, placement.isCritical),
          cursor: editable ? 'grab' : 'pointer',
          boxShadow: selected ? '0 0 0 2px var(--color-primary-text)' : undefined,
          outlineColor: 'var(--color-primary-text)',
          touchAction: 'none',
        }}
      >
        {placement.pinnedBeforePredecessor && (
          <span
            className="absolute -right-1 -top-1 block h-2 w-2 rounded-full"
            style={{ background: 'var(--color-error)' }}
            title="Pinned earlier than its dependencies allow"
          />
        )}
      </button>

      {editable && (
        <>
          {/* Resize grip at the bar's right edge. */}
          <span
            ref={resizeRef}
            {...resizeListeners}
            {...resizeAttrs}
            role="button"
            aria-label={`Resize ${row.label} — currently ${rangeLabel}`}
            tabIndex={0}
            className="absolute"
            style={{
              left: x + Math.max(width + resizeOffset, 6) - 5,
              top: midY - BAR_HEIGHT / 2,
              width: 8,
              height: BAR_HEIGHT,
              cursor: 'ew-resize',
              touchAction: 'none',
            }}
          />
          {/* Link handle just past the bar's end. */}
          <span
            ref={linkRef}
            {...linkListeners}
            {...linkAttrs}
            role="button"
            aria-label={`Draw a dependency from ${row.label}`}
            tabIndex={0}
            className="absolute block h-3 w-3 rounded-full border"
            style={{
              left: x + Math.max(width + resizeOffset, 6) + 4,
              top: midY - 6,
              background: 'var(--color-surface)',
              borderColor: 'var(--color-text-light)',
              cursor: 'crosshair',
              touchAction: 'none',
            }}
          />
        </>
      )}

      {/* Actual — below the current bar; runs to today while still open. */}
      {placement.actual && (
        <div
          className="absolute rounded-sm"
          style={{
            left: dateToX(placement.actual.start, origin, zoom),
            width: spanToWidth(placement.actual.start, placement.actual.end ?? new Date(), zoom),
            top: midY + BAR_HEIGHT / 2 + 3,
            height: 4,
            background: 'var(--color-primary-dark)',
          }}
          title={
            placement.actual.end
              ? `Actual ${formatDate(placement.actual.start)} – ${formatDate(placement.actual.end)}`
              : `Started ${formatDate(placement.actual.start)}, still open`
          }
        />
      )}

      {/* Deadline marker. */}
      {placement.breachesDeadline && (
        <div
          className="absolute"
          style={{
            left: x + width + 2,
            top: midY - 6,
            color: 'var(--color-error)',
            fontSize: 12,
            lineHeight: 1,
          }}
          title="Runs past its deadline"
        >
          ▲
        </div>
      )}
    </div>
  )
}
