'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { LOCATION_OPTIONS } from '@/lib/filter-options'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { type Project, ProjectList, statusBadgeClasses } from '@/components/ProjectCard'

interface ProjectsResponse {
  projects: Project[]
  total: number
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
              searchable
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
              <Button variant="outline" size="lg" onClick={clearFilters}>Clear filters</Button>
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

