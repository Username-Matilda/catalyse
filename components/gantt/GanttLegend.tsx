import Tooltip from '@/components/Tooltip'
import { TONE_LABELS, toneFill, type BarTone } from './palette'

const TONES: BarTone[] = ['todo', 'progress', 'done', 'hold']

function Swatch({
  children,
  label,
  hint,
}: {
  children: React.ReactNode
  label: string
  /** Shown on hover, for marks whose name does not explain them. */
  hint?: string
}) {
  const text = (
    <span
      className={
        hint ? 'decoration-dotted underline-offset-2 [text-decoration-line:underline]' : undefined
      }
    >
      {label}
    </span>
  )
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex h-3 w-6 shrink-0 items-center justify-center">{children}</span>
      {hint ? <Tooltip content={hint}>{text}</Tooltip> : text}
    </span>
  )
}

/** The two markings that need more than a name to be understood. */
export const ANCHOR_HINT =
  'A fixed point the plan is built around — an event date, a launch, a deadline. The critical path is measured towards the anchors, so work that only follows one is correctly shown as having slack.'
export const CRITICAL_HINT =
  'Zero slack: this runs right up against the next thing, so a one-day delay here delays the anchor by a day. Work with a gap before its successor is not on the path — it can slip by that much and change nothing.'

/**
 * A compact key for the chart. Every mark the timeline can draw appears here once, so the
 * chart itself needs no inline text to explain a colour.
 */
export default function GanttLegend({ editable }: { editable: boolean }) {
  return (
    <div className="text-text-light mt-3 flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {TONES.map((tone) => (
          <Swatch key={tone} label={TONE_LABELS[tone]}>
            <span
              className="block h-3 w-6 rounded-sm"
              style={{ background: toneFill(tone) }}
              aria-hidden="true"
            />
          </Swatch>
        ))}
        <Swatch label="Milestone (no duration)">
          <span
            className="block h-2.5 w-2.5"
            style={{
              background: 'var(--gantt-bar-todo)',
              borderRadius: 1,
              transform: 'rotate(45deg)',
            }}
            aria-hidden="true"
          />
        </Swatch>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Swatch label="Planned">
          <span
            className="block h-1 w-6 rounded-full"
            style={{ background: 'var(--gantt-baseline)' }}
            aria-hidden="true"
          />
        </Swatch>
        <Swatch label="Actual">
          <span
            className="block h-1 w-6 rounded-full"
            style={{ background: 'var(--gantt-actual)' }}
            aria-hidden="true"
          />
        </Swatch>
        <Swatch label="Anchor" hint={ANCHOR_HINT}>
          <span aria-hidden="true" style={{ color: 'var(--gantt-anchor)' }}>
            ★
          </span>
        </Swatch>
        <Swatch label="Critical path" hint={CRITICAL_HINT}>
          <span
            className="block h-3 w-6 rounded-sm"
            style={{
              background: 'transparent',
              boxShadow: 'inset 0 0 0 2px var(--gantt-critical)',
            }}
            aria-hidden="true"
          />
        </Swatch>
        <Swatch label="Today">
          <span
            className="block h-3 w-0.5"
            style={{ background: 'var(--gantt-today)' }}
            aria-hidden="true"
          />
        </Swatch>
        <Swatch label="Project end">
          <span
            className="block h-3"
            style={{ borderLeft: '2px dashed var(--gantt-finish)' }}
            aria-hidden="true"
          />
        </Swatch>
        <Swatch label="Past deadline">
          <span aria-hidden="true" style={{ color: 'var(--gantt-today)' }}>
            ▲
          </span>
        </Swatch>
        <Swatch label="Pinned earlier than dependencies allow">
          <span
            className="block h-2.5 w-2.5 rounded-full"
            style={{
              background: 'var(--gantt-today)',
              boxShadow: '0 0 0 1.5px var(--color-surface)',
            }}
            aria-hidden="true"
          />
        </Swatch>
      </div>

      {/* Two markings carry a whole scheduling idea between them, so they get a sentence each
          rather than only a swatch. Everything else on the chart explains itself. */}
      <dl className="border-brand-border m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 border-t pt-2">
        <dt className="whitespace-nowrap" style={{ color: 'var(--gantt-anchor)' }}>
          ★ Anchor
        </dt>
        <dd className="m-0">
          The fixed point the plan is built around — the event date itself. Mark one by selecting a
          bar and ticking <em>Anchor</em>. With none set, the last item to finish stands in for one.
        </dd>
        <dt className="whitespace-nowrap" style={{ color: 'var(--gantt-critical)' }}>
          Critical path
        </dt>
        <dd className="m-0">
          Zero slack: a one-day delay here delays the anchor by a day. Work that finishes with a gap
          before whatever follows it has that many days spare, so it is not on the path.
        </dd>
      </dl>

      {editable && (
        <p className="m-0">
          Drag a bar to move it, its right edge to change duration, or the circle at its end onto
          another row to link them. Click a bar to select it — a × appears on each of its dependency
          arrows, and removes that link.
        </p>
      )}
    </div>
  )
}
