'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import Linkify from '@/components/Linkify'
import Tooltip from '@/components/Tooltip'
import { formatDateShort, toDateInputValue, fromDateInputValue } from '@/lib/format-date'
import { barFill, barTone, TONE_LABELS } from './palette'
import { ANCHOR_HINT, CRITICAL_HINT } from './GanttLegend'
import type { GanttRow } from './types'

/**
 * What the viewer may do about who is working on this task. `canAssign` is the manager's
 * power to hand it to anyone; `canClaim` is any eligible volunteer's power to take it
 * themselves. They are separate permissions and a viewer can hold either, both or neither.
 */
export type PanelAssignment = {
  canAssign: boolean
  canClaim: boolean
  /** Volunteers the manager may pick from, already grouped and labelled by the caller. */
  options: { value: string; label: string; header?: boolean }[]
  onAssign: (volunteerId: number) => void
  onClaim: () => void
  onUnassign: () => void
}

export type PanelPredecessor = {
  dependencyId: number
  predecessorId: number
  predecessorTitle: string
  lagDays: number
}

/** One label/value line in the summary. Values wrap under themselves rather than into the label. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-text-light">{label}</dt>
      <dd className="text-brand-text m-0">{children}</dd>
    </>
  )
}

/** A section heading with a rule above it, so the panel reads as distinct blocks. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-brand-border mt-4 border-t pt-4">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {children}
    </section>
  )
}

/**
 * The click-a-bar side panel — and the keyboard/screen-reader-complete way to do everything the
 * drag gestures do: set or clear the pinned start, change the duration, and manage links.
 */
export default function GanttItemPanel({
  row,
  startDate,
  durationDays,
  description,
  assigneeName,
  deadline,
  estimatedHours,
  canManage,
  siblings,
  predecessors,
  busy,
  onClose,
  onSaveDates,
  onAddDependency,
  onRemoveDependency,
  onUpdateLag,
  onSetAnchor,
  assignment,
}: {
  row: GanttRow
  startDate: Date | null
  durationDays: number | null
  description?: string | null
  assigneeName?: string | null
  deadline?: Date | string | null
  /** Effort, as opposed to `durationDays` elapsed — the two are independent. */
  estimatedHours?: number | null
  canManage: boolean
  siblings: { id: number; title: string }[]
  predecessors: PanelPredecessor[]
  busy?: boolean
  onClose: () => void
  onSaveDates: (patch: { startDate: Date | null; durationDays: number | null }) => void
  onAddDependency: (predecessorId: number, lagDays: number) => void
  onRemoveDependency: (dependencyId: number) => void
  onUpdateLag: (dependencyId: number, lagDays: number) => void
  onSetAnchor?: (isAnchor: boolean) => void
  /** Omit to leave the panel read-only about who is doing the work. */
  assignment?: PanelAssignment
}) {
  const [start, setStart] = useState(toDateInputValue(startDate))
  const [duration, setDuration] = useState(durationDays !== null ? String(durationDays) : '')
  const [newPred, setNewPred] = useState('')
  const [newLag, setNewLag] = useState('')
  const [pickedAssignee, setPickedAssignee] = useState('')

  useEffect(() => {
    // Re-seed the inputs when a different bar is selected or its stored dates change.
    /* eslint-disable react-hooks/set-state-in-effect */
    setStart(toDateInputValue(startDate))
    setDuration(durationDays !== null ? String(durationDays) : '')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [row.id, startDate, durationDays])

  const p = row.placement
  const variance =
    p.startVarianceDays && p.startVarianceDays !== 0
      ? p.startVarianceDays > 0
        ? `${p.startVarianceDays} day${p.startVarianceDays === 1 ? '' : 's'} late`
        : `${-p.startVarianceDays} day${p.startVarianceDays === -1 ? '' : 's'} early`
      : 'On plan'

  const span = p.isMilestone
    ? formatDateShort(p.start)
    : `${formatDateShort(p.start)} – ${formatDateShort(p.end)}`

  const taken = new Set(predecessors.map((d) => d.predecessorId))
  const addable = siblings.filter((s) => !taken.has(s.id) && s.id !== row.id)

  return (
    <aside className="border-brand-border bg-surface rounded-lg border p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="m-0 text-base leading-snug">{row.label}</h3>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
          ×
        </Button>
      </div>

      {/* Chips carry the facts that are true of the whole item, so the table below stays dates. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span
          className="rounded-full px-2 py-0.5"
          style={{ background: barFill(row.status), color: 'var(--gantt-bar-text)' }}
        >
          {TONE_LABELS[barTone(row.status)]}
        </span>
        {p.isMilestone && (
          <span className="border-brand-border text-text-light rounded-full border px-2 py-0.5">
            Milestone
          </span>
        )}
        {canManage && p.isAnchor && (
          <Tooltip content={ANCHOR_HINT}>
            <span
              className="rounded-full px-2 py-0.5"
              style={{ background: 'var(--gantt-anchor)', color: 'var(--gantt-bar-text)' }}
            >
              ★ Anchor
            </span>
          </Tooltip>
        )}
        {canManage && p.isCritical && (
          <Tooltip content={CRITICAL_HINT}>
            <span
              className="rounded-full px-2 py-0.5"
              style={{ background: 'var(--gantt-critical)', color: 'var(--gantt-bar-text)' }}
            >
              Critical path
            </span>
          </Tooltip>
        )}
        {p.breachesDeadline && (
          <span
            className="rounded-full px-2 py-0.5"
            style={{ background: 'var(--gantt-today)', color: 'var(--gantt-bar-text)' }}
          >
            Past deadline
          </span>
        )}
      </div>

      {description && (
        <p className="mb-3 text-sm whitespace-pre-wrap">
          <Linkify text={description} />
        </p>
      )}

      {/* Derived facts only. Anything editable is stated once, by its own control below — the
          panel should never print a value and then offer the field for it half a screen away. */}
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <Fact label="Scheduled">{span}</Fact>
        {deadline && <Fact label="Deadline">{formatDateShort(deadline)}</Fact>}
        {estimatedHours !== null && estimatedHours !== undefined && (
          <Fact label="Effort">
            {estimatedHours} hour{estimatedHours === 1 ? '' : 's'} of work
          </Fact>
        )}
        {p.baseline && (
          <Fact label="Planned">
            {formatDateShort(p.baseline.start)} – {formatDateShort(p.baseline.end)}
          </Fact>
        )}
        {/* Variance only means something against a committed baseline. With none set there is
            nothing to compare to, so the row is absent rather than reading a misleading
            "On plan". */}
        {p.baseline && (
          <Fact label="Variance">
            <span className={p.startVarianceDays ? 'text-warning-text' : undefined}>
              {variance}
            </span>
          </Fact>
        )}
        {p.actual && (
          <Fact label="Actual">
            {formatDateShort(p.actual.start)}
            {p.actual.end ? ` – ${formatDateShort(p.actual.end)}` : ' – in progress'}
          </Fact>
        )}
      </dl>

      {canManage && !p.baseline && (
        <p className="text-text-light mt-2 mb-0 text-xs">No baseline set, so no variance yet.</p>
      )}

      {p.pinnedBeforePredecessor && (
        <p className="text-error mt-2 mb-0 text-sm">Pinned earlier than its dependencies allow.</p>
      )}

      {canManage && (
        <Section title="Dates">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSaveDates({
                startDate: fromDateInputValue(start),
                durationDays: duration ? parseInt(duration, 10) : null,
              })
            }}
          >
            {/* A date needs room for ten characters; a duration needs two. Equal columns would
                make the duration hint wrap. */}
            <div className="mb-2 grid grid-cols-[1fr_auto] items-start gap-3">
              <div>
                <label htmlFor="panel-start">Start date</label>
                <input
                  id="panel-start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="panel-duration">Duration</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="panel-duration"
                    type="number"
                    min="0"
                    step="1"
                    className="w-16"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    aria-describedby="panel-duration-hint"
                  />
                  <span className="text-text-light text-sm">days</span>
                </div>
              </div>
            </div>
            <p id="panel-duration-hint" className="text-text-light mt-0 mb-2 text-xs">
              {start ? 'Pinned to this date.' : 'Following its dependencies — no fixed date.'} A
              duration of 0 makes it a milestone.
            </p>

            {/* The anchor belongs with the dates it governs, not in a section of its own. */}
            {onSetAnchor && (
              <label className="mb-3 flex items-center gap-2 font-normal">
                <input
                  type="checkbox"
                  className="w-auto"
                  checked={p.isAnchor}
                  disabled={busy}
                  onChange={(e) => onSetAnchor(e.target.checked)}
                />
                <Tooltip content={ANCHOR_HINT}>
                  <span className="text-sm decoration-dotted underline-offset-2 [text-decoration-line:underline]">
                    Anchor — a fixed point the plan is built around
                  </span>
                </Tooltip>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                Save
              </Button>
              {start && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setStart('')
                    onSaveDates({
                      startDate: null,
                      durationDays: duration ? parseInt(duration, 10) : null,
                    })
                  }}
                >
                  Unpin
                </Button>
              )}
            </div>
          </form>
        </Section>
      )}

      <Section title="Depends on">
        {predecessors.length === 0 ? (
          <p className="text-text-light m-0 text-sm">Nothing — can start whenever.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0 text-sm">
            {predecessors.map((d) => (
              <li key={d.dependencyId} className="border-brand-border rounded-md border px-3 py-2">
                <p className="m-0 leading-snug">{d.predecessorTitle}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {/* Lag is nearly always 0, so it gets a two-character box on one line. */}
                  <label
                    htmlFor={`panel-lag-${d.dependencyId}`}
                    className="text-text-light m-0 flex items-center gap-1.5 text-xs font-normal"
                  >
                    Lag
                    <input
                      id={`panel-lag-${d.dependencyId}`}
                      type="number"
                      step="1"
                      defaultValue={d.lagDays}
                      disabled={!canManage || busy}
                      className="w-14 !px-2 !py-1"
                      onBlur={(e) => {
                        const next = e.target.value ? parseInt(e.target.value, 10) : 0
                        if (next !== d.lagDays) onUpdateLag(d.dependencyId, next)
                      }}
                    />
                    days
                  </label>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onRemoveDependency(d.dependencyId)}
                      aria-label={`Remove dependency on ${d.predecessorTitle}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canManage && addable.length > 0 && (
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!newPred) return
              onAddDependency(parseInt(newPred, 10), newLag ? parseInt(newLag, 10) : 0)
              setNewPred('')
              setNewLag('')
            }}
          >
            <label htmlFor="panel-add-pred">Add a dependency</label>
            <select
              id="panel-add-pred"
              value={newPred}
              onChange={(e) => setNewPred(e.target.value)}
            >
              <option value="">Select…</option>
              {addable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-2">
              <label
                htmlFor="panel-add-lag"
                className="text-text-light m-0 flex items-center gap-1.5 text-xs font-normal"
              >
                Lag
                <input
                  id="panel-add-lag"
                  type="number"
                  step="1"
                  value={newLag}
                  onChange={(e) => setNewLag(e.target.value)}
                  placeholder="0"
                  className="w-14 !px-2 !py-1"
                />
                days
              </label>
              <Button type="submit" size="sm" disabled={!newPred || busy}>
                Add
              </Button>
            </div>
          </form>
        )}
      </Section>

      {/* Who does the work comes after when it happens: this is the timeline's panel, and the
          task's own page is where staffing is really managed. */}
      <Section title="Assigned to">
        <p className="m-0 text-sm">{assigneeName || 'Nobody yet'}</p>

        {assignment && (assignment.canAssign || assignment.canClaim) && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {assignment.canClaim && !assigneeName && (
              <Button size="sm" disabled={busy} onClick={assignment.onClaim}>
                Assign to me
              </Button>
            )}
            {assigneeName && assignment.canAssign && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={assignment.onUnassign}>
                Unassign
              </Button>
            )}
            {assignment.canAssign && (
              <>
                <div className="min-w-40 flex-1">
                  <label htmlFor="panel-assignee" className="sr-only">
                    Assign to a volunteer
                  </label>
                  <select
                    id="panel-assignee"
                    value={pickedAssignee}
                    disabled={busy}
                    onChange={(e) => setPickedAssignee(e.target.value)}
                  >
                    {assignment.options.map((o) => (
                      <option key={o.value} value={o.value} disabled={o.header}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !pickedAssignee}
                  onClick={() => {
                    assignment.onAssign(parseInt(pickedAssignee, 10))
                    setPickedAssignee('')
                  }}
                >
                  Assign
                </Button>
              </>
            )}
          </div>
        )}
      </Section>

      {/* Navigation last, where it does not interrupt the editing controls. */}
      {row.href && (
        <p className="mt-4 mb-0 text-sm">
          <Link href={row.href} className="text-primary-text underline">
            Open task →
          </Link>
        </p>
      )}
    </aside>
  )
}
