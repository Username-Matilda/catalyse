import React from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import { Badge, badgeClasses, type BadgeVariant } from '@/components/Badge'
import { matchGradeLabel } from '@/lib/matching'
import { projectLocationParts } from '@/lib/filter-options'
import {
  PROJECT_STATUS_CONFIG as PROJECT_LIFECYCLE_CONFIG,
  proposerDisplay,
} from '@/lib/project-status'

export interface Project {
  id: number
  title: string
  status: string
  description: string | null
  updatedAt?: string | Date | null
  pendingInterestCount?: number
  isSeekingHelp?: boolean | null
  /** Derived server-side: live but ownerless. */
  isSeekingOwner?: boolean | null
  /** Derived server-side: owned, but no open tasks. */
  needsTasks?: boolean | null
  isOrgProposed?: boolean | null
  projectType?: string | null
  country?: string | null
  localGroup?: string | null
  remoteEligibility?: string | null
  team?: { id: number; name: string } | null
  /** Derived server-side: is the viewer a member of this project's team? */
  isMyTeam?: boolean
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

// Project lifecycle statuses come from lib/project-status.ts (shared with the server and
// e2e helpers); the interest statuses below are badged by the same helpers, so they're
// merged in here rather than kept in the lifecycle map.
export const PROJECT_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  ...PROJECT_LIFECYCLE_CONFIG,
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

export const INTEREST_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

export const QUICK_TASK_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  under_review: 'Under Review',
  completed: 'Completed',
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
  showProposer = false,
}: {
  project: Project
  userSkillIds?: Set<number>
  action?: React.ReactNode
  /**
   * Name the proposer in place of the empty owner state. Admin-only by convention:
   * volunteers browsing need to know a project has no owner yet, not who filed it.
   */
  showProposer?: boolean
}) {
  const proposer = p.owner || !showProposer ? null : proposerDisplay(p)
  return (
    <div
      className={`card bg-surface rounded-xl shadow px-5 pt-5 pb-4 overflow-hidden wrap-break-word grid grid-rows-subgrid row-span-6 gap-y-2 relative min-w-0 ${p.isMyTeam ? 'border-l-4 border-primary' : ''}`}
    >
      <div className="card-header row-start-1">
        <Link
          role="link"
          href={`/projects/${p.id}`}
          className="font-heading text-lg font-bold text-secondary-dark no-underline hover:text-primary transition-colors"
        >
          {p.title}
        </Link>
      </div>
      {/* Status is the lifecycle position; Seeking Owner/Help/Tasks are separate,
          independently-derived facts and can co-occur with any status, including Ready. */}
      <div className="row-start-2 flex gap-1 flex-wrap self-start">
        <Badge variant={projectStatusVariant(p.status)}>
          {STATUS_LABELS[p.status] ?? p.status.replace(/_/g, ' ')}
        </Badge>
        {p.isSeekingOwner && <Badge variant="caution">Seeking Owner</Badge>}
        {p.isSeekingHelp && <Badge variant="caution">Seeking Help</Badge>}
        {p.needsTasks && <Badge variant="warning">Needs Tasks</Badge>}
      </div>
      <div className="row-start-3 flex items-center gap-3 flex-wrap text-xs text-text-light self-start">
        <span>
          👤 {p.owner ? p.owner.name : proposer ? `Proposer: ${proposer.name}` : 'No owner yet'}
        </span>
        {(() => {
          const parts = projectLocationParts(p.country, p.localGroup, p.remoteEligibility)
          return parts.length > 0 && <span>📍 {parts.join(' · ')}</span>
        })()}
        {p.team && <span>🧑‍🤝‍🧑 {p.team.name}</span>}
        {p.projectType && <span>📋 {PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType}</span>}
        {p.timeCommitmentHoursPerWeek && <span>🕐 {p.timeCommitmentHoursPerWeek}h/week</span>}
        {p.urgency && <span>⚡ {p.urgency} priority</span>}
      </div>
      <p className="row-start-4 min-w-0 text-text-light text-sm m-0 wrap-break-word">
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
          <span className="text-xs font-semibold text-primary-text">
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
  showProposer = false,
}: {
  projects: Project[]
  userSkillIds?: Set<number>
  single?: boolean
  showProposer?: boolean
}) {
  return (
    <div className={single ? CARD_GRID_SINGLE_CLASSES : CARD_GRID_CLASSES}>
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          userSkillIds={userSkillIds}
          showProposer={showProposer}
        />
      ))}
    </div>
  )
}
