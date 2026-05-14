import React from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import { matchGradeLabel } from '@/lib/matching'

export interface Project {
  id: number
  title: string
  status: string
  description: string | null
  updated_at?: string
  pending_interest_count?: number
  is_seeking_help?: boolean | null
  is_seeking_owner?: boolean | null
  is_org_proposed?: boolean | null
  project_type?: string | null
  country?: string | null
  local_group?: string | null
  time_commitment_hours_per_week?: number | null
  urgency?: string | null
  owner?: { name: string } | null
  proposed_by?: { id?: number; name: string } | string | null
  skills?: Array<{ id: number; name: string; is_required: boolean }>
  match?: {
    required_match_percent: number
    matched_required_count: number
    total_required: number
    overall_score: number
  } | null
}

export const STATUS_LABELS: Record<string, string> = {
  seeking_owner: 'Seeking Owner',
  seeking_help: 'Seeking Help',
  needs_tasks: 'Needs Tasks',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  pending_review: 'Pending Review',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  sprint: 'Sprint',
  container: 'Time-boxed',
  ongoing: 'Ongoing',
  one_off: 'One-off',
}

export function statusBadgeClasses(status: string) {
  const map: Record<string, string> = {
    seeking_owner: 'bg-[#FED7AA] text-[#92400E] dark:bg-[#78350F] dark:text-[#FED7AA]',
    seeking_help: 'bg-[#FED7AA] text-[#92400E] dark:bg-[#78350F] dark:text-[#FED7AA]',
    needs_tasks: 'bg-[#FEF9C3] text-[#713F12] dark:bg-[#78350F] dark:text-[#FDE68A]',
    in_progress: 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]',
    on_hold: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
    completed: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
    pending_review: 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]',
    accepted: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
    declined: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
    withdrawn: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
  }
  // [test hook] status-badge class used as test selector
  return `status-badge inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${map[status] ?? 'bg-[#F3F4F6] text-[#374151]'}`
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
      <div className={`card-header row-start-1${p.is_org_proposed ? ' pr-[80px]' : ''}`}>
        <Link
          role="link"
          href={`/projects/${p.id}`}
          className="font-heading text-lg font-bold text-secondary-dark no-underline hover:text-primary transition-colors"
        >
          {p.title}
        </Link>
      </div>
      {p.is_org_proposed && (
        <span className="absolute top-0 right-0 bg-primary text-white text-xs font-semibold px-3 py-1 rounded-bl-xl rounded-tr-xl">
          PauseAI
        </span>
      )}
      <div className="row-start-2 flex gap-1 flex-wrap">
        {!['seeking_owner', 'seeking_help'].includes(p.status) && (
          <span className={statusBadgeClasses(p.status)}>
            {STATUS_LABELS[p.status] ?? p.status.replace(/_/g, ' ')}
          </span>
        )}
        {p.is_seeking_help && (
          <span className={statusBadgeClasses('seeking_help')}>Seeking Help</span>
        )}
        {p.is_seeking_owner && (
          <span className={statusBadgeClasses('seeking_owner')}>Seeking Owner</span>
        )}
      </div>
      <div className="row-start-3 flex items-center gap-3 flex-wrap text-xs text-text-light">
        <span>👤 {p.owner ? p.owner.name : 'No owner yet'}</span>
        {(p.local_group || p.country) && (
          <span>📍 {[p.country, p.local_group].filter(Boolean).join(' · ')}</span>
        )}
        {p.project_type && <span>📋 {PROJECT_TYPE_LABELS[p.project_type] ?? p.project_type}</span>}
        {p.time_commitment_hours_per_week && (
          <span>🕐 {p.time_commitment_hours_per_week}h/week</span>
        )}
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
                className="inline-flex items-center px-2 py-0.5 bg-accent text-secondary-dark rounded-full text-xs font-medium dark:bg-[#374151] dark:text-[#D1D5DB]"
              >
                {s.name}
              </span>
            ))}
            {overflow > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 bg-[#F3F4F6] text-text-light rounded-full text-xs font-medium dark:bg-[#374151] dark:text-[#9CA3AF]">
                and {overflow} more
              </span>
            )}
          </div>
        )
      })()}
      <div className="row-start-6 flex justify-between items-center pt-2">
        {p.match && (p.skills?.length ?? 0) > 0 && userSkillIds.size > 0 && matchGradeLabel(p.match.matched_required_count) ? (
          <span className="text-xs font-semibold text-primary">
            {matchGradeLabel(p.match.matched_required_count)}
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

export const CARD_GRID_CLASSES =
  'grid grid-cols-3 gap-x-5 gap-y-5 max-[1200px]:grid-cols-2 max-[600px]:grid-cols-1'
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
