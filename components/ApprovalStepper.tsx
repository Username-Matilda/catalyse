import React from 'react'
import { Badge, type BadgeVariant } from '@/components/Badge'
import { ApprovalStatus } from '@/generated/prisma/enums'

type Step = { label: string; variant: BadgeVariant }

/**
 * Three-stage progress badge for an application awaiting approval: Applied →
 * Under Review → Approved/Rejected. Only meaningful before a final decision —
 * callers gate on that (e.g. the dashboard's pending-approval banner).
 */
export function ApprovalStepper({ status }: { status: ApprovalStatus }) {
  const reachedReview =
    status === ApprovalStatus.under_review ||
    status === ApprovalStatus.needs_info ||
    status === ApprovalStatus.approved ||
    status === ApprovalStatus.rejected
  const inReview = status === ApprovalStatus.under_review || status === ApprovalStatus.needs_info

  const finalStep: Step =
    status === ApprovalStatus.approved
      ? { label: 'Approved', variant: 'success' }
      : status === ApprovalStatus.rejected
        ? { label: 'Rejected', variant: 'danger' }
        : { label: 'Approved', variant: 'neutral' }

  const steps: Step[] = [
    { label: 'Applied', variant: 'success' },
    { label: 'Under Review', variant: reachedReview ? (inReview ? 'info' : 'success') : 'neutral' },
    finalStep,
  ]

  return (
    <div className="flex items-center gap-1 flex-wrap" aria-label="Application status">
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          {i > 0 && <span className="text-text-light text-xs">→</span>}
          <Badge variant={step.variant}>{step.label}</Badge>
        </React.Fragment>
      ))}
    </div>
  )
}
