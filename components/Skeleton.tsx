/**
 * Placeholder shapes shown while a list loads, so the page keeps its layout instead of
 * collapsing to a line of text. `label` is read by screen readers, and by tests as text.
 */
export default function Skeleton({
  label,
  variant = 'card',
  count = 3,
  className = '',
}: {
  label: string
  variant?: 'card' | 'row'
  count?: number
  className?: string
}) {
  const shape =
    variant === 'card'
      ? 'h-36 rounded-xl shadow mb-4'
      : 'h-12 rounded-lg border border-brand-border mb-2'
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" className={`bg-surface animate-pulse ${shape}`} />
      ))}
    </div>
  )
}
