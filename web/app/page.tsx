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
  description: string | null
  urgency: string | null
  time_commitment_hours_per_week: number | null
  skills: Array<{ id: number; name: string }>
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

const STATUS_ORDER = ['seeking_owner', 'seeking_help', 'needs_tasks', 'in_progress', 'on_hold', 'completed']

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
    seeking_owner: 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]',
    seeking_help: 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]',
    needs_tasks: 'bg-[#FEF9C3] text-[#713F12] dark:bg-[#78350F] dark:text-[#FDE68A]',
    in_progress: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
    on_hold: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
    completed: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
  }
  return `inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${map[status] ?? 'bg-[#F3F4F6] text-[#374151]'}`
}

export default function ProjectsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
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

  const grouped = STATUS_ORDER.reduce<Record<string, Project[]>>((acc, s) => {
    const matching = projects.filter(p => p.status === s)
    if (matching.length) acc[s] = matching
    return acc
  }, {})

  // Status summary counts
  const statusCounts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = projects.filter(p => p.status === s).length
    return acc
  }, {})

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
            {!statusFilter && projects.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {STATUS_ORDER.filter(s => statusCounts[s] > 0).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={statusBadgeClasses(s) + ' cursor-pointer hover:opacity-80 transition-opacity'}
                  >
                    {STATUS_LABELS[s]} ({statusCounts[s]})
                  </button>
                ))}
              </div>
            )}

            {/* Grouped project cards */}
            {statusFilter ? (
              <ProjectList projects={projects} />
            ) : (
              STATUS_ORDER.filter(s => grouped[s]).map(s => (
                <div key={s} className="mb-8">
                  <h2 className="text-lg mb-3 pb-2 border-b border-brand-border">{STATUS_LABELS[s]}</h2>
                  <ProjectList projects={grouped[s]} />
                </div>
              ))
            )}
          </>
        )}
      </main>
    </>
  )
}

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div className="flex flex-col gap-3">
      {projects.map(p => (
        <div key={p.id} className="bg-surface rounded-xl shadow p-5 overflow-hidden wrap-break-word">
          <div className="flex justify-between items-start gap-3 mb-2">
            <Link
              role="link"
              href={`/projects/${p.id}`}
              className="font-heading text-lg font-bold text-secondary-dark no-underline hover:text-primary transition-colors"
            >
              {p.title}
            </Link>
            <span className={statusBadgeClasses(p.status)} style={{ whiteSpace: 'nowrap' }}>
              {STATUS_LABELS[p.status] ?? p.status.replace(/_/g, ' ')}
            </span>
          </div>
          {p.description && (
            <p className="text-text-light text-sm m-0 mb-3 line-clamp-2">
              {p.description.slice(0, 200)}{p.description.length > 200 ? '…' : ''}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {p.urgency && p.urgency !== 'medium' && (
              <span className="text-xs text-text-light uppercase tracking-wide">
                {p.urgency} urgency
              </span>
            )}
            {p.time_commitment_hours_per_week && (
              <span className="text-xs text-text-light">
                {p.time_commitment_hours_per_week}h/week
              </span>
            )}
            {p.skills?.slice(0, 4).map(s => (
              <span key={s.id} className="inline-flex items-center px-2 py-0.5 bg-accent text-secondary-dark rounded-full text-xs font-medium dark:bg-[#374151] dark:text-[#D1D5DB]">
                {s.name}
              </span>
            ))}
            {(p.skills?.length ?? 0) > 4 && (
              <span className="text-xs text-text-light">+{p.skills.length - 4} more</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
