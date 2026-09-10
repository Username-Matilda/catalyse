'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/Button'
import { formatDate, toDateInputValue, fromDateInputValue } from '@/lib/format-date'
import type { GanttRow } from './types'

export type PanelPredecessor = {
  dependencyId: number
  predecessorId: number
  predecessorTitle: string
  lagDays: number
}

/**
 * The click-a-bar side panel — and the keyboard/screen-reader-complete way to do everything the
 * drag gestures do: set or clear the pinned start, change the duration, and manage links.
 */
export default function GanttItemPanel({
  row,
  startDate,
  durationDays,
  canManage,
  siblings,
  predecessors,
  busy,
  onClose,
  onSaveDates,
  onAddDependency,
  onRemoveDependency,
  onUpdateLag,
}: {
  row: GanttRow
  startDate: Date | null
  durationDays: number | null
  canManage: boolean
  siblings: { id: number; title: string }[]
  predecessors: PanelPredecessor[]
  busy?: boolean
  onClose: () => void
  onSaveDates: (patch: { startDate: Date | null; durationDays: number | null }) => void
  onAddDependency: (predecessorId: number, lagDays: number) => void
  onRemoveDependency: (dependencyId: number) => void
  onUpdateLag: (dependencyId: number, lagDays: number) => void
}) {
  const [start, setStart] = useState(toDateInputValue(startDate))
  const [duration, setDuration] = useState(durationDays !== null ? String(durationDays) : '')
  const [newPred, setNewPred] = useState('')
  const [newLag, setNewLag] = useState('')

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
        ? `${p.startVarianceDays} day${p.startVarianceDays === 1 ? '' : 's'} later than planned`
        : `${-p.startVarianceDays} day${p.startVarianceDays === -1 ? '' : 's'} earlier than planned`
      : 'On plan'

  const taken = new Set(predecessors.map((d) => d.predecessorId))

  return (
    <aside className="border-brand-border bg-surface rounded-lg border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="m-0 text-base">{row.label}</h3>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
          ×
        </Button>
      </div>

      <dl className="text-text-light mb-4 text-sm">
        <div className="flex justify-between">
          <dt>Scheduled</dt>
          <dd className="text-brand-text">
            {formatDate(p.start)} – {formatDate(p.end)}
          </dd>
        </div>
        {p.baseline && (
          <div className="flex justify-between">
            <dt>Baseline</dt>
            <dd className="text-brand-text">
              {formatDate(p.baseline.start)} – {formatDate(p.baseline.end)}
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Variance</dt>
          <dd className={p.startVarianceDays ? 'text-warning' : 'text-brand-text'}>{variance}</dd>
        </div>
        {p.actual && (
          <div className="flex justify-between">
            <dt>Actual</dt>
            <dd className="text-brand-text">
              {formatDate(p.actual.start)}
              {p.actual.end ? ` – ${formatDate(p.actual.end)}` : ' – in progress'}
            </dd>
          </div>
        )}
        {p.pinnedBeforePredecessor && (
          <p className="text-error mt-1">Pinned earlier than its dependencies allow.</p>
        )}
      </dl>

      {canManage && (
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSaveDates({
              startDate: fromDateInputValue(start),
              durationDays: duration ? parseInt(duration, 10) : null,
            })
          }}
        >
          <div className="mb-3 flex flex-wrap items-end gap-3">
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
              <label htmlFor="panel-duration">Duration (days)</label>
              <input
                id="panel-duration"
                type="number"
                min="1"
                step="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-24"
              />
            </div>
          </div>
          <div className="flex gap-2">
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
          <p className="text-text-light mt-1 text-xs">
            {start ? 'Pinned to this date.' : 'Following its dependencies — no fixed date.'}
          </p>
        </form>
      )}

      <h4 className="mb-1 text-sm font-medium">Depends on</h4>
      {predecessors.length === 0 ? (
        <p className="text-text-light mb-2 text-sm">Nothing — can start whenever.</p>
      ) : (
        <ul className="mb-2 list-none space-y-1 p-0 text-sm">
          {predecessors.map((d) => (
            <li key={d.dependencyId} className="flex flex-wrap items-center gap-2">
              <span className="flex-1">{d.predecessorTitle}</span>
              <label className="text-text-light flex items-center gap-1">
                lag
                <input
                  type="number"
                  step="1"
                  defaultValue={d.lagDays}
                  disabled={!canManage || busy}
                  className="w-16"
                  onBlur={(e) => {
                    const next = e.target.value ? parseInt(e.target.value, 10) : 0
                    if (next !== d.lagDays) onUpdateLag(d.dependencyId, next)
                  }}
                />
              </label>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRemoveDependency(d.dependencyId)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && siblings.some((s) => !taken.has(s.id) && s.id !== row.id) && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newPred) return
            onAddDependency(parseInt(newPred, 10), newLag ? parseInt(newLag, 10) : 0)
            setNewPred('')
            setNewLag('')
          }}
        >
          <div>
            <label htmlFor="panel-add-pred">Add</label>
            <select
              id="panel-add-pred"
              value={newPred}
              onChange={(e) => setNewPred(e.target.value)}
            >
              <option value="">Select…</option>
              {siblings
                .filter((s) => !taken.has(s.id) && s.id !== row.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="panel-add-lag">lag</label>
            <input
              id="panel-add-lag"
              type="number"
              step="1"
              value={newLag}
              onChange={(e) => setNewLag(e.target.value)}
              placeholder="0"
              className="w-16"
            />
          </div>
          <Button type="submit" size="sm" disabled={!newPred || busy}>
            Add
          </Button>
        </form>
      )}
    </aside>
  )
}
