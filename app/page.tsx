'use client'

import { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/Button'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import { buildLocationOptions, type LocalGroupOption } from '@/lib/filter-options'
import { InferRouterInputs } from '@orpc/server'
import { orpc } from '@/lib/orpc'
import { AppRouter } from '@/server/router'
import { type Project, ProjectList, statusBadgeClasses } from '@/components/ProjectCard'
import { ProjectStatus } from '@/generated/prisma/enums'

const STATUS_OPTIONS = [
  { value: '', label: 'All Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
] as const

const NEEDS_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'looking_for_people', label: 'Looking for People' },
  { value: 'seeking_help', label: 'Seeking Help', indent: true },
  { value: 'seeking_owner', label: 'Seeking Owner', indent: true },
  { value: 'not_seeking', label: 'Not Seeking' },
] as const

const URGENCY_OPTIONS = [
  { value: '', label: 'Any urgency' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const

const SORT_OPTIONS = [
  { value: '', label: 'Default sort' },
  { value: 'created_at', label: 'Newest first' },
  { value: 'match', label: 'Best match' },
  { value: 'urgency', label: 'Most urgent' },
] as const

export default function ProjectsPage() {
  const { user, loading } = useRequireAuth()
  const userSkillIds = new Set(user?.skills?.map((s) => s.id) ?? [])
  const [search, setSearch] = useState('')
  const { value: statusFilter, onChange: setStatusFilter } = useFilterOptions(STATUS_OPTIONS, '')
  const { value: needsFilter, onChange: setNeedsFilter } = useFilterOptions(NEEDS_OPTIONS, '')
  const { value: urgencyFilter, onChange: setUrgencyFilter } = useFilterOptions(URGENCY_OPTIONS, '')
  const [locationFilter, setLocationFilter] = useState('')
  const { value: sortBy, onChange: setSortBy } = useFilterOptions(SORT_OPTIONS, '')
  const [completedOpen, setCompletedOpen] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [debouncedLocationFilter, setDebouncedLocationFilter] = useState('')

  useEffect(() => {
    const t = setTimeout(
      () => {
        setDebouncedSearch(search)
        setDebouncedLocationFilter(locationFilter)
      },
      search || locationFilter ? 300 : 0,
    )
    return () => clearTimeout(t)
  }, [search, locationFilter])

  const { data: pendingTriageList = [] } = useQuery({
    ...orpc.admin.triage.list.queryOptions(),
    enabled: !!user?.isAdmin,
  })
  const pendingCount = pendingTriageList.length

  const { data: pendingApplicationsList = [] } = useQuery({
    ...orpc.admin.applications.list.queryOptions({ input: { filter: 'mine' } }),
    enabled: !!user?.isAdmin,
  })
  const pendingApplicationsCount = pendingApplicationsList.length

  const { data: localGroupsData } = useQuery({
    ...orpc.localGroups.list.queryOptions({ input: {} }),
    enabled: true,
  })
  const localGroups: LocalGroupOption[] = localGroupsData?.groups ?? []

  const projectsInput: InferRouterInputs<AppRouter>['projects']['list'] = {}
  if (debouncedSearch) projectsInput.search = debouncedSearch
  if (statusFilter) projectsInput.status = statusFilter
  if (needsFilter === 'looking_for_people') projectsInput.isSeekingAny = true
  else if (needsFilter === 'seeking_help') projectsInput.isSeekingHelp = true
  else if (needsFilter === 'seeking_owner') projectsInput.isSeekingOwner = true
  else if (needsFilter === 'not_seeking') projectsInput.notSeeking = true
  if (urgencyFilter) projectsInput.urgency = urgencyFilter
  if (debouncedLocationFilter) {
    const [country, localGroup] = debouncedLocationFilter.split(':')
    projectsInput.country = country
    if (localGroup) projectsInput.localGroup = localGroup
  }
  if (sortBy) projectsInput.sortBy = sortBy

  const {
    data: projectsData,
    isPending: loadingProjects,
    error: projectsError,
  } = useQuery({
    ...orpc.projects.list.queryOptions({ input: projectsInput }),
    enabled: !!user,
  })
  const projects = projectsData?.projects ?? []

  const hasFilters =
    search || statusFilter || needsFilter || urgencyFilter || locationFilter || sortBy

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setNeedsFilter('')
    setUrgencyFilter('')
    setLocationFilter('')
    setSortBy('')
  }

  function byMatchScore(a: Project, b: Project) {
    const scoreA = a.match?.matchedRequiredCount ?? 0
    const scoreB = b.match?.matchedRequiredCount ?? 0
    return scoreB - scoreA
  }
  const sortGroup = (list: Project[]) =>
    userSkillIds.size > 0 ? [...list].sort(byMatchScore) : list

  const seeking = sortGroup(projects.filter((p) => p.isSeekingHelp || p.isSeekingOwner))
  const inProgress = sortGroup(
    projects.filter(
      (p) => !p.isSeekingHelp && !p.isSeekingOwner && p.status === ProjectStatus.in_progress,
    ),
  )
  const onHold = sortGroup(
    projects.filter(
      (p) => !p.isSeekingHelp && !p.isSeekingOwner && p.status === ProjectStatus.on_hold,
    ),
  )
  const completed = sortGroup(projects.filter((p) => p.status === ProjectStatus.completed))
  const other = sortGroup(
    projects.filter(
      (p) =>
        !p.isSeekingHelp &&
        !p.isSeekingOwner &&
        !['in_progress', 'on_hold', 'completed'].includes(p.status),
    ),
  )

  const groups = [
    {
      key: 'seeking',
      projects: seeking,
      label: 'Looking for People',
      desc: 'These projects need your help',
      color: 'text-orange-600 dark:text-orange-400',
    },
    {
      key: 'in_progress',
      projects: inProgress,
      label: 'In Progress',
      desc: 'Actively being worked on',
      color: 'text-blue-600 dark:text-blue-400',
    },
    { key: 'other', projects: other, label: 'Other Active', desc: '', color: 'text-text-light' },
    {
      key: 'on_hold',
      projects: onHold,
      label: 'On Hold',
      desc: '',
      color: 'text-red-600 dark:text-red-400',
    },
    {
      key: 'completed',
      projects: completed,
      label: 'Completed',
      desc: '',
      color: 'text-green-600 dark:text-green-400',
    },
  ]

  if (loading || !user) return null

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Projects</h1>

        {user.isAdmin && pendingCount > 0 && (
          <div className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-600">
            <strong>
              {pendingCount} project{pendingCount !== 1 ? 's' : ''} pending review.
            </strong>{' '}
            <Link href="/admin/triage" className="underline">
              Go to triage →
            </Link>
          </div>
        )}
        {user.isAdmin && pendingApplicationsCount > 0 && (
          <div className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-violet-100 text-violet-800 border border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-600">
            <strong>
              {pendingApplicationsCount} application{pendingApplicationsCount !== 1 ? 's' : ''}{' '}
              pending review.
            </strong>{' '}
            <Link href="/admin/applications" className="underline">
              Review applications →
            </Link>
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
              onChange={(e) => setSearch(e.target.value)}
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
              label="Country/Group"
              ariaLabel="Country/Group filter"
              value={locationFilter}
              options={buildLocationOptions(localGroups)}
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
              <Button variant="outline" size="lg" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {loadingProjects ? (
          <div className="text-center py-10 text-text-light">Loading projects…</div>
        ) : projectsError ? (
          <div className="text-center py-15 px-5 text-text-light">
            <h3>Couldn’t load projects</h3>
            <p>
              {projectsError instanceof Error
                ? projectsError.message
                : 'Something went wrong loading projects.'}
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-15 px-5 text-text-light">
            <h3>No projects found</h3>
            <p>
              Try adjusting your filters or{' '}
              <Link href="/suggest" className="underline">
                suggest a new project
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            {/* Status summary bar */}
            {!statusFilter && !needsFilter && projects.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {seeking.length > 0 && (
                  <span className={statusBadgeClasses('seeking_help')}>
                    Looking for People: {seeking.length}
                  </span>
                )}
                {inProgress.length > 0 && (
                  <span className={statusBadgeClasses('in_progress')}>
                    In Progress: {inProgress.length}
                  </span>
                )}
                <span className="text-sm text-text-light self-center">{projects.length} total</span>
              </div>
            )}

            {/* Grouped project cards */}
            {statusFilter || needsFilter ? (
              <ProjectList projects={projects} userSkillIds={userSkillIds} />
            ) : (
              groups
                .filter((g) => g.projects.length > 0)
                .map((g) => {
                  const isCompleted = g.key === 'completed'
                  const isOpen = !isCompleted || completedOpen
                  return (
                    <div key={g.key} className="mb-8">
                      {isCompleted ? (
                        <h2
                          className="text-lg mb-1 flex items-center gap-2 cursor-pointer select-none"
                          onClick={() => setCompletedOpen((o) => !o)}
                          role="button"
                          aria-expanded={completedOpen}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && setCompletedOpen((o) => !o)}
                        >
                          {g.label} — {g.projects.length} project
                          {g.projects.length !== 1 ? 's' : ''}
                          <svg
                            className={`text-text-light shrink-0 transition-transform ${completedOpen ? 'rotate-180' : 'rotate-0'}`}
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </h2>
                      ) : (
                        <h2 className={`text-lg mb-1 ${g.color}`}>
                          {g.label} — {g.projects.length} project
                          {g.projects.length !== 1 ? 's' : ''}
                        </h2>
                      )}
                      {g.desc && <p className="text-text-light text-sm mb-3">{g.desc}</p>}
                      {isOpen && (
                        <div
                          key={String(completedOpen)}
                          className={isCompleted ? 'animate-fade-slide-in' : undefined}
                        >
                          <ProjectList projects={g.projects} userSkillIds={userSkillIds} />
                        </div>
                      )}
                    </div>
                  )
                })
            )}
          </>
        )}
      </main>
    </>
  )
}
