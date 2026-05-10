export default function DescriptionTips() {
  return (
    <aside className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 mb-2 text-sm">
      <dl className="m-0 columns-2 max-sm:columns-1 gap-x-6">
        <dt className="font-semibold text-brand-text break-after-avoid mt-2 first:mt-0">
          Goal &amp; Impact
        </dt>
        <dd className="m-0 mb-1.5 text-text-light leading-snug break-inside-avoid">
          What problem does this solve? What does success look like and how would you measure it?
        </dd>
        <dt className="font-semibold text-brand-text break-after-avoid mt-2">
          Approach &amp; Activities
        </dt>
        <dd className="m-0 mb-1.5 text-text-light leading-snug break-inside-avoid">
          What are the key steps? Do you have a rough sense of how this would work?
        </dd>
        <dt className="font-semibold text-brand-text break-after-avoid mt-2">Feasibility</dt>
        <dd className="m-0 mb-1.5 text-text-light leading-snug break-inside-avoid">
          Main uncertainties or risks? Resources or dependencies needed? Existing work to build on?
        </dd>
        <dt className="font-semibold text-brand-text break-after-avoid mt-2">
          Team &amp; Collaboration
        </dt>
        <dd className="m-0 mb-1.5 text-text-light leading-snug break-inside-avoid">
          What skills and availability are ideal? How do you imagine the team working together?
        </dd>
        <dt className="font-semibold text-brand-text break-after-avoid mt-2">
          Challenge Your Idea
        </dt>
        <dd className="m-0 text-text-light leading-snug break-inside-avoid">
          What&apos;s the best argument against doing this? What&apos;s your Theory of Change?
        </dd>
      </dl>
    </aside>
  )
}
