import React from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import { Badge, badgeClasses, type BadgeVariant } from '@/components/Badge'
import { matchGradeLabel } from '@/lib/matching'

export interface Project {
  id: number
  title: string
  status: string
  description: string | null
  updatedAt?: string | Date | null
  pendingInterestCount?: number
  isSeekingHelp?: boolean | null
  isSeekingOwner?: boolean | null
  isOrgProposed?: boolean | null
  projectType?: string | null
  country?: string | null
  localGroup?: string | null
  timeCommitmentHoursPerWeek?: number | null
  urgency?: string | null
  owner?: { name: string } | null
  proposedBy?: { id?: number; name: string } | string | null
  skills?: Array<{ id: number; name: string; isRequired: boolean | null }>
  match?: {
    requiredMatchPercent: number
    matchedRequiredCount: number
    totalRequired: number
    overallScore: number
  } | null
}

export const PROJECT_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  seeking_owner: { label: 'Seeking Owner', variant: 'caution' },
  seeking_help: { label: 'Seeking Help', variant: 'caution' },
  needs_tasks: { label: 'Needs Tasks', variant: 'warning' },
  in_progress: { label: 'In Progress', variant: 'info' },
  on_hold: { label: 'On Hold', variant: 'neutral' },
  completed: { label: 'Completed', variant: 'success' },
  archived: { label: 'Archived', variant: 'neutral' },
  needs_discussion: { label: 'Needs Discussion', variant: 'neutral' },
  pending_review: { label: 'Pending Review', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  declined: { label: 'Declined', variant: 'neutral' },
  withdrawn: { label: 'Withdrawn', variant: 'neutral' },
}

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PROJECT_STATUS_CONFIG).map(([k, v]) => [k, v.label]),
)

const PROJECT_TYPE_LABELS: Record<string, string> = {
  sprint: 'Sprint',
  container: 'Time-boxed',
  ongoing: 'Ongoing',
  one_off: 'One-off',
}

export function projectStatusVariant(status: string): BadgeVariant {
  return PROJECT_STATUS_CONFIG[status]?.variant ?? 'neutral'
}

export function statusBadgeClasses(status: string) {
  return badgeClasses(projectStatusVariant(status))
}

export function ProjectCard({
  project: p,
  userSkillIds = new Set(),
  action,
}: {
  project: Project
  userSkillIds?: Set<number>
  action?: React.ReactNode
}) {
  return (
    <div className="card bg-surface rounded-xl shadow px-5 pt-5 pb-4 overflow-hidden wrap-break-word grid grid-rows-subgrid row-span-6 gap-y-2 relative">
      <div className="card-header row-start-1">
        <Link
          role="link"
          href={`/projects/${p.id}`}
          className="font-heading text-lg font-bold text-secondary-dark no-underline hover:text-primary transition-colors"
        >
          {p.title}
        </Link>
      </div>
      <div className="row-start-2 flex gap-1 flex-wrap self-start">
        {!['seeking_owner', 'seeking_help'].includes(p.status) && (
          <Badge variant={projectStatusVariant(p.status)}>
            {STATUS_LABELS[p.status] ?? p.status.replace(/_/g, ' ')}
          </Badge>
        )}
        {p.isSeekingHelp && <Badge variant="caution">Seeking Help</Badge>}
        {p.isSeekingOwner && <Badge variant="caution">Seeking Owner</Badge>}
      </div>
      <div className="row-start-3 flex items-center gap-3 flex-wrap text-xs text-text-light self-start">
        <span>👤 {p.owner ? p.owner.name : 'No owner yet'}</span>
        {(p.localGroup || p.country) && (
          <span>📍 {[p.country, p.localGroup].filter(Boolean).join(' · ')}</span>
        )}
        {p.projectType && <span>📋 {PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType}</span>}
        {p.timeCommitmentHoursPerWeek && <span>🕐 {p.timeCommitmentHoursPerWeek}h/week</span>}
        {p.urgency && <span>⚡ {p.urgency} priority</span>}
      </div>
      <p className="row-start-4 text-text-light text-sm m-0">
        {p.description
          ? `${p.description.slice(0, 150)}${p.description.length > 150 ? '…' : ''}`
          : ''}
      </p>
      {(() => {
        const allSkills = p.skills ?? []
        const matched =
          userSkillIds.size > 0 ? allSkills.filter((s) => userSkillIds.has(s.id)) : allSkills
        if (matched.length === 0) return null
        const shown = matched.slice(0, 4)
        const overflow = matched.length - 4
        return (
          <div className="row-start-5 flex items-center gap-2 flex-wrap">
            {shown.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center px-2 py-0.5 bg-accent text-secondary-dark rounded-full text-xs font-medium dark:bg-gray-700 dark:text-gray-300"
              >
                {s.name}
              </span>
            ))}
            {overflow > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-text-light rounded-full text-xs font-medium dark:bg-gray-700 dark:text-gray-400">
                and {overflow} more
              </span>
            )}
          </div>
        )
      })()}
      <div className="row-start-6 flex justify-between items-center pt-2">
        {p.match &&
        (p.skills?.length ?? 0) > 0 &&
        userSkillIds.size > 0 &&
        matchGradeLabel(p.match.matchedRequiredCount) ? (
          <span className="text-xs font-semibold text-primary">
            {matchGradeLabel(p.match.matchedRequiredCount)}
          </span>
        ) : (
          <div />
        )}
        {action ?? (
          <Link href={`/projects/${p.id}`}>
            <Button variant="secondary" size="sm">
              View Details
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

export const CARD_GRID_CLASSES = 'grid grid-cols-2 gap-x-5 gap-y-5 max-[600px]:grid-cols-1'
export const CARD_GRID_SINGLE_CLASSES = 'flex flex-col gap-5'

export function ProjectList({
  projects,
  userSkillIds = new Set(),
  single = false,
}: {
  projects: Project[]
  userSkillIds?: Set<number>
  single?: boolean
}) {
  return (
    <div className={single ? CARD_GRID_SINGLE_CLASSES : CARD_GRID_CLASSES}>
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} userSkillIds={userSkillIds} />
      ))}
    </div>
  )
}
