'use client'

import { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { buildLocationOptions, type LocalGroupOption } from '@/lib/filter-options'
import { InferRouterOutputs } from '@orpc/server'
import { orpc } from '@/lib/orpc'
import { AppRouter } from '@/server/router'
import { CARD_GRID_CLASSES } from '@/components/ProjectCard'

type SkillCategory = InferRouterOutputs<AppRouter>['skills']['list'][number]
type FlatSkill = SkillCategory['skills'][number] & { categoryName: string }

type Volunteer = InferRouterOutputs<AppRouter>['volunteers']['list']['volunteers'][number]

export default function VolunteersPage() {
  const { user, loading } = useRequireAuth()
  const [search, setSearch] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
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

  const { data: skillsData } = useQuery({
    ...orpc.skills.list.queryOptions({ input: {} }),
    enabled: !!user,
  })
  const allSkills: FlatSkill[] = (skillsData ?? []).flatMap((cat) =>
    cat.skills.map((s) => ({ ...s, categoryName: cat.name })),
  )

  const { data: localGroupsData } = useQuery({
    ...orpc.localGroups.list.queryOptions({ input: {} }),
    enabled: !!user,
  })
  const localGroups: LocalGroupOption[] = localGroupsData?.groups ?? []

  const { data: volunteersData, isPending: loadingVolunteers } = useQuery({
    ...orpc.volunteers.list.queryOptions({
      input: {
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(skillFilter ? { skillIds: [parseInt(skillFilter, 10)] } : {}),
        ...(debouncedLocationFilter ? { country: debouncedLocationFilter.split(':')[0] } : {}),
        ...(debouncedLocationFilter && debouncedLocationFilter.split(':')[1]
          ? { localGroup: debouncedLocationFilter.split(':')[1] }
          : {}),
      },
    }),
    enabled: !!user,
  })
  const volunteers: Volunteer[] = volunteersData?.volunteers ?? []

  function clearFilters() {
    setSearch('')
    setSkillFilter('')
    setLocationFilter('')
  }

  const hasFilters = search || skillFilter || locationFilter

  if (loading || !user) return null

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Volunteer Directory</h1>

        <div className="mb-5">
          <div className="mb-3">
            <label htmlFor="search-volunteers">Search</label>
            <input
              id="search-volunteers"
              type="search"
              aria-label="Search"
              placeholder="Search volunteers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-3 flex-wrap items-end">
            <FilterDropdown
              id="skill-filter"
              label="Skill"
              ariaLabel="Skill filter"
              value={skillFilter}
              options={[
                { value: '', label: 'All skills' },
                ...allSkills.map((s) => ({ value: String(s.id), label: s.name })),
              ]}
              onChange={setSkillFilter}
              searchable
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

            {hasFilters && (
              <Button variant="outline" size="lg" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div id="volunteersList">
          {/* [test hook] loading class polled by tests to detect when fetch completes */}
          {loadingVolunteers ? (
            <div className="loading text-center py-10 text-text-light">Loading volunteers…</div>
          ) : volunteers.length === 0 ? (
            <div className="text-center py-15 px-5 text-text-light">
              <h3>No volunteers found</h3>
              <p>Try adjusting your filters.</p>
            </div>
          ) : (
            <div className={CARD_GRID_CLASSES}>
              {/* [test hook] card class used as test selector */}
              {volunteers.map((v) => (
                <div
                  key={v.id}
                  className="card bg-surface rounded-xl shadow p-6 overflow-hidden wrap-break-word flex flex-col"
                >
                  <h3 className="m-0 mb-2">
                    <Link
                      href={`/volunteers/${v.id}`}
                      className="text-primary-dark no-underline hover:underline"
                    >
                      {v.name}
                    </Link>
                  </h3>
                  {(v.location || v.country || v.localGroup || v.availabilityHoursPerWeek) && (
                    <div className="flex items-center gap-3 flex-wrap text-xs text-text-light mb-2">
                      {(v.location || v.country || v.localGroup) && (
                        <span>
                          📍 {[v.localGroup, v.country ?? v.location].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {v.availabilityHoursPerWeek && (
                        <span>🕐 {v.availabilityHoursPerWeek}h/week</span>
                      )}
                    </div>
                  )}
                  {v.bio && (
                    <p className="m-0 mb-3">
                      {v.bio.length > 100 ? v.bio.slice(0, 100) + '…' : v.bio}
                    </p>
                  )}
                  {v.skills.length > 0 &&
                    (() => {
                      const shown = v.skills.slice(0, 6)
                      const overflow = v.skills.length - 6
                      return (
                        <div className="flex flex-wrap gap-1.5 mb-3">
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
                  <div className="flex justify-between items-center mt-auto pt-4 border-t border-brand-border">
                    <span className="text-sm text-text-light">
                      Joined{' '}
                      {v.createdAt
                        ? new Date(v.createdAt).toLocaleDateString('en-GB', {
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </span>
                    <Button href={`/volunteers/${v.id}`} variant="secondary" size="sm">
                      View Profile
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
