'use client'

import Modal from '@/components/ui/Modal'
import Button from '@/components/Button'
import { formatDateShort } from '@/lib/format-date'

/**
 * Setting a baseline is cheap; replacing one is not. Overwriting discards every accumulated
 * variance and the old dates are not stored anywhere, so the dialog spells out what is lost
 * before it happens — and says less when there is nothing to lose.
 */
export default function BaselineDialog({
  isOpen,
  existingSetAt,
  taskCount,
  busy,
  onConfirm,
  onClose,
}: {
  isOpen: boolean
  /** When the current baseline was captured, or null if the project has never had one. */
  existingSetAt: Date | null
  /** How many dated tasks the write will cover. */
  taskCount: number
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const replacing = existingSetAt !== null

  return (
    <Modal
      id="baseline-dialog"
      title={replacing ? 'Replace the baseline?' : 'Set the baseline'}
      isOpen={isOpen}
      onClose={onClose}
    >
      <p>
        The baseline is the plan you are measuring against. It records today&rsquo;s dates for the
        project and its {taskCount} dated task{taskCount === 1 ? '' : 's'}, and stays put while the
        real schedule moves — the gap between the two is what the timeline shows as variance.
      </p>

      {replacing ? (
        <>
          <p>
            This project was baselined on <strong>{formatDateShort(existingSetAt)}</strong>.
            Replacing it means:
          </p>
          <ul className="mb-4 list-disc pl-5">
            <li>every task&rsquo;s variance resets to &ldquo;on plan&rdquo;</li>
            <li>the record of how far the schedule has slipped is gone</li>
            <li>the old baseline is not stored anywhere, so this cannot be undone</li>
          </ul>
          <p className="text-text-light text-sm">
            Do this when the team has genuinely re-planned — not to clear a variance you would
            rather not report.
          </p>
        </>
      ) : (
        <p className="text-text-light text-sm">
          Nothing is overwritten: this project has no baseline yet. Until you set one, the timeline
          shows no planned track and no variance.
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {replacing ? 'Replace baseline' : 'Set baseline'}
        </Button>
      </div>
    </Modal>
  )
}
