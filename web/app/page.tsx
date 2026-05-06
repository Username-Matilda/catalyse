'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Project {
  id: number
  title: string
  status: string
  is_seeking_help: boolean | null
  is_seeking_owner: boolean | null
  is_org_proposed: boolean | null
  description: string | null
  urgency: string | null
  time_commitment_hours_per_week: number | null
  project_type: string | null
  local_group: string | null
  owner: { name: string } | null
  skills: Array<{ id: number; name: string; is_required: boolean }>
  match: { required_match_percent: number } | null
}

interface ProjectsResponse {
  projects: Project[]
  total: number
}

const STATUS_LABELS: Record<string, string> = {
  seeking_owner: 'Seeking Owner',
  seeking_help: 'Seeking Help',
  needs_tasks: 'Needs Tasks',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
}


const STATUS_OPTIONS = [
  { value: '', label: 'All Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

const NEEDS_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'looking_for_people', label: 'Looking for People' },
  { value: 'seeking_help', label: 'Seeking Help', indent: true },
  { value: 'seeking_owner', label: 'Seeking Owner', indent: true },
  { value: 'not_seeking', label: 'Not Seeking' },
]

const URGENCY_OPTIONS = [
  { value: '', label: 'Any urgency' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const SORT_OPTIONS = [
  { value: '', label: 'Default sort' },
  { value: 'created_at', label: 'Newest first' },
  { value: 'match', label: 'Best match' },
  { value: 'urgency', label: 'Most urgent' },
]

const LOCATION_OPTIONS = [
  { value: '', label: 'Any country' },
  { value: 'Remote', label: 'Remote' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Austria', label: 'Austria' },
  { value: 'Belgium', label: 'Belgium' },
  { value: 'Brazil', label: 'Brazil' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Czech Republic', label: 'Czech Republic' },
  { value: 'Denmark', label: 'Denmark' },
  { value: 'Finland', label: 'Finland' },
  { value: 'France', label: 'France' },
  { value: 'Germany', label: 'Germany' },
  { value: 'India', label: 'India' },
  { value: 'Ireland', label: 'Ireland' },
  { value: 'Italy', label: 'Italy' },
  { value: 'Japan', label: 'Japan' },
  { value: 'Mexico', label: 'Mexico' },
  { value: 'Netherlands', label: 'Netherlands' },
  { value: 'New Zealand', label: 'New Zealand' },
  { value: 'Norway', label: 'Norway' },
  { value: 'Poland', label: 'Poland' },
  { value: 'Portugal', label: 'Portugal' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'South Korea', label: 'South Korea' },
  { value: 'Spain', label: 'Spain' },
  { value: 'Sweden', label: 'Sweden' },
  { value: 'Switzerland', label: 'Switzerland' },
  { value: 'UK', label: 'UK' },
  { value: 'UK:Oxfordshire', label: 'Oxfordshire', indent: true },
  { value: 'UK:London', label: 'London', indent: true },
  { value: 'UK:Scotland', label: 'Scotland', indent: true },
  { value: 'UK:West of England', label: 'West of England', indent: true },
  { value: 'UK:Leicester', label: 'Leicester', indent: true },
  { value: 'UK:Manchester', label: 'Manchester', indent: true },
  { value: 'US', label: 'US' },
  { value: 'Other', label: 'Other' },
]


function statusBadgeClasses(status: string) {
  const map: Record<string, string> = {
    seeking_owner: 'bg-[#FED7AA] text-[#92400E] dark:bg-[#78350F] dark:text-[#FED7AA]',
    seeking_help: 'bg-[#FED7AA] text-[#92400E] dark:bg-[#78350F] dark:text-[#FED7AA]',
    needs_tasks: 'bg-[#FEF9C3] text-[#713F12] dark:bg-[#78350F] dark:text-[#FDE68A]',
    in_progress: 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]',
    on_hold: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
    completed: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
  }
  return `inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${map[status] ?? 'bg-[#F3F4F6] text-[#374151]'}`
}

export default function ProjectsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const userSkillIds = new Set(user?.skills?.map(s => s.id) ?? [])
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [needsFilter, setNeedsFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [sortBy, setSortBy] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    if (user.is_admin) {
      apiRequest<Project[]>('/api/admin/triage')
        .then(list => setPendingCount(list.length))
        .catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchProjects, search || locationFilter ? 300 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, statusFilter, needsFilter, urgencyFilter, locationFilter, sortBy])

  async function fetchProjects() {
    setLoadingProjects(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (needsFilter === 'looking_for_people') params.set('is_seeking_any', 'true')
      else if (needsFilter === 'seeking_help') params.set('is_seeking_help', 'true')
      else if (needsFilter === 'seeking_owner') params.set('is_seeking_owner', 'true')
      else if (needsFilter === 'not_seeking') params.set('not_seeking', 'true')
      if (urgencyFilter) params.set('urgency', urgencyFilter)
      if (locationFilter) {
        const [country, localGroup] = locationFilter.split(':')
        params.set('country', country)
        if (localGroup) params.set('local_group', localGroup)
      }
      if (sortBy) params.set('sort_by', sortBy)
      const data = await apiRequest<ProjectsResponse>(`/api/projects?${params}`)
      setProjects(data.projects)
    } catch {
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  const hasFilters = search || statusFilter || needsFilter || urgencyFilter || locationFilter || sortBy

  function clearFilters() {
    setSearch(''); setStatusFilter(''); setNeedsFilter(''); setUrgencyFilter(''); setLocationFilter(''); setSortBy('')
  }

  const seeking = projects.filter(p => p.is_seeking_help || p.is_seeking_owner)
  const inProgress = projects.filter(p => !p.is_seeking_help && !p.is_seeking_owner && p.status === 'in_progress')
  const onHold = projects.filter(p => !p.is_seeking_help && !p.is_seeking_owner && p.status === 'on_hold')
  const completed = projects.filter(p => p.status === 'completed')
  const other = projects.filter(p =>
    !p.is_seeking_help && !p.is_seeking_owner &&
    !['in_progress', 'on_hold', 'completed'].includes(p.status)
  )

  const groups = [
    { key: 'seeking', projects: seeking, label: 'Looking for People', desc: 'These projects need your help', color: 'text-orange-600 dark:text-orange-400' },
    { key: 'in_progress', projects: inProgress, label: 'In Progress', desc: 'Actively being worked on', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'other', projects: other, label: 'Other Active', desc: '', color: 'text-text-light' },
    { key: 'on_hold', projects: onHold, label: 'On Hold', desc: '', color: 'text-red-600 dark:text-red-400' },
    { key: 'completed', projects: completed, label: 'Completed', desc: '', color: 'text-green-600 dark:text-green-400' },
  ]

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Projects</h1>

        {user.is_admin && pendingCount > 0 && (
          <div className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] dark:bg-[#78350F] dark:text-[#FDE68A] dark:border-[#D97706]">
            <strong>{pendingCount} project{pendingCount !== 1 ? 's' : ''} pending review.</strong>{' '}
            <Link href="/admin/triage" className="underline">Go to triage →</Link>
          </div>
        )}

        {/* Filters */}
        <div className="mb-5">
          <div className="mb-3">
            <label htmlFor="search-projects">Search</label>
            <input
              id="search-projects"
              type="search"
              aria-label="Search"
              placeholder="Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-3 flex-wrap items-end">
            <FilterDropdown
              id="status-filter"
              label="Status"
              ariaLabel="Status filter"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
            />
            <FilterDropdown
              id="needs-filter"
              label="Needs"
              ariaLabel="Needs filter"
              value={needsFilter}
              options={NEEDS_OPTIONS}
              onChange={setNeedsFilter}
            />
            <FilterDropdown
              id="urgency-filter"
              label="Urgency"
              ariaLabel="Urgency filter"
              value={urgencyFilter}
              options={URGENCY_OPTIONS}
              onChange={setUrgencyFilter}
            />

            <FilterDropdown
              id="location-filter"
              label="Country"
              ariaLabel="Country filter"
              value={locationFilter}
              options={LOCATION_OPTIONS}
              onChange={setLocationFilter}
            />

            <FilterDropdown
              id="sort-filter"
              label="Sort by"
              ariaLabel="Sort filter"
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={setSortBy}
            />

            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} style={{ marginBottom: 0 }}>Clear filters</Button>
            )}
          </div>
        </div>

        {loadingProjects ? (
          <div className="text-center py-10 text-text-light">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-15 px-5 text-text-light">
            <h3>No projects found</h3>
            <p>Try adjusting your filters or{' '}
              <Link href="/suggest" className="underline">suggest a new project</Link>.
            </p>
          </div>
        ) : (
          <>
            {/* Status summary bar */}
            {!statusFilter && !needsFilter && projects.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {seeking.length > 0 && (
                  <span className={statusBadgeClasses('seeking_help')}>Looking for People: {seeking.length}</span>
                )}
                {inProgress.length > 0 && (
                  <span className={statusBadgeClasses('in_progress')}>In Progress: {inProgress.length}</span>
                )}
                <span className="text-sm text-text-light self-center">{projects.length} total</span>
              </div>
            )}

            {/* Grouped project cards */}
            {statusFilter || needsFilter ? (
              <ProjectList projects={projects} userSkillIds={userSkillIds} />
            ) : (
              groups.filter(g => g.projects.length > 0).map(g => (
                <div key={g.key} className="mb-8">
                  <h2 className={`text-lg mb-1 ${g.color}`}>{g.label} — {g.projects.length} project{g.projects.length !== 1 ? 's' : ''}</h2>
                  {g.desc && <p className="text-text-light text-sm mb-3">{g.desc}</p>}
                  <ProjectList projects={g.projects} userSkillIds={userSkillIds} />
                </div>
              ))
            )}
          </>
        )}
      </main>
    </>
  )
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  sprint: 'Sprint',
  container: 'Time-boxed',
  ongoing: 'Ongoing',
  one_off: 'One-off',
}

function ProjectList({ projects, userSkillIds }: { projects: Project[]; userSkillIds: Set<number> }) {
  return (
    <div className="grid grid-cols-3 gap-x-5 gap-y-5 max-[1200px]:grid-cols-2 max-[600px]:grid-cols-1">
      {projects.map(p => (
        <div key={p.id} className="card bg-surface rounded-xl shadow px-5 pt-5 pb-4 overflow-hidden wrap-break-word grid grid-rows-subgrid row-span-6 gap-y-2 relative">
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
            <span className="absolute top-0 right-0 bg-primary text-white text-xs font-semibold px-3 py-1 rounded-bl-xl rounded-tr-xl">PauseAI</span>
          )}
          <div className="row-start-2 flex gap-1 flex-wrap">
            {!['seeking_owner', 'seeking_help'].includes(p.status) && (
              <span className={statusBadgeClasses(p.status)}>{STATUS_LABELS[p.status] ?? p.status.replace(/_/g, ' ')}</span>
            )}
            {p.is_seeking_help && (
              <span className={statusBadgeClasses('seeking_help')}>Seeking Help</span>
            )}
            {p.is_seeking_owner && (
              <span className={statusBadgeClasses('seeking_owner')}>Seeking Owner</span>
            )}
            {p.local_group && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-white">{p.local_group}</span>
            )}
          </div>
          <div className="row-start-3 flex items-center gap-3 flex-wrap text-xs text-text-light">
            {p.project_type && (
              <span>📋 {PROJECT_TYPE_LABELS[p.project_type] ?? p.project_type}</span>
            )}
            <span>👤 {p.owner ? p.owner.name : 'No owner yet'}</span>
            {p.time_commitment_hours_per_week && (
              <span>🕐 {p.time_commitment_hours_per_week}h/week</span>
            )}
            {p.urgency && (
              <span>⚡ {p.urgency} priority</span>
            )}
          </div>
          <p className="row-start-4 text-text-light text-sm m-0">
            {p.description ? `${p.description.slice(0, 150)}${p.description.length > 150 ? '…' : ''}` : ''}
          </p>
          {(() => {
            const allSkills = p.skills ?? []
            const matched = userSkillIds.size > 0 ? allSkills.filter(s => userSkillIds.has(s.id)) : []
            if (matched.length === 0) return null
            const shown = matched.slice(0, 4)
            const overflow = matched.length - 4
            return (
              <div className="row-start-5 flex items-center gap-2 flex-wrap">
                {shown.map(s => (
                  <span key={s.id} className="inline-flex items-center px-2 py-0.5 bg-accent text-secondary-dark rounded-full text-xs font-medium dark:bg-[#374151] dark:text-[#D1D5DB]">
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
            {p.match && (p.skills?.length ?? 0) > 0 && userSkillIds.size > 0
              ? <span className="text-xs font-semibold text-primary">{p.match.required_match_percent}% match</span>
              : <div />
            }
            <Link href={`/projects/${p.id}`}><Button variant="secondary" size="sm">View Details</Button></Link>
          </div>
        </div>
      ))}
    </div>
  )
}
