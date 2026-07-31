'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useUrlParam, useUrlSearchInput } from '@/lib/hooks/url-filters'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { buildLocationOptions, type LocalGroupOption } from '@/lib/filter-options'
import { InferRouterOutputs } from '@orpc/server'
import { orpc } from '@/lib/orpc'
import { AppRouter } from '@/server/router'
import { CARD_GRID_CLASSES } from '@/components/ProjectCard'
import Tooltip from '@/components/Tooltip'

type SkillCategory = InferRouterOutputs<AppRouter>['skills']['list'][number]
type FlatSkill = SkillCategory['skills'][number] & { categoryName: string }

type Volunteer = InferRouterOutputs<AppRouter>['volunteers']['list']['volunteers'][number]
type AuthUser = NonNullable<ReturnType<typeof useRequireAuth>['user']>

function VolunteersPageContent({ user }: { user: AuthUser }) {
  const [searchInput, setSearchInput, urlSearch] = useUrlSearchInput('q')
  const [skillFilter, setSkillFilter] = useUrlParam('skill')
  const [locationFilter, setLocationFilter] = useUrlParam('location')
  const router = useRouter()
  function clearFilters() {
    setSearchInput('')
    router.replace('?', { scroll: false })
  }

  const hasFilters = searchInput || skillFilter || locationFilter

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
        ...(urlSearch ? { search: urlSearch } : {}),
        ...(skillFilter ? { skillIds: [parseInt(skillFilter, 10)] } : {}),
        ...(locationFilter ? { country: locationFilter.split(':')[0] } : {}),
        ...(locationFilter && locationFilter.split(':')[1]
          ? { localGroup: locationFilter.split(':')[1] }
          : {}),
      },
    }),
    enabled: !!user,
  })
  const volunteers: Volunteer[] = volunteersData?.volunteers ?? []

  return (
    <>
      <main className="container py-5 pb-15">
        <h1>Volunteer Directory</h1>

        <div className="mb-5">
          <div className="mb-3">
            <label htmlFor="search-volunteers">Search</label>
            <input
              id="search-volunteers"
              type="search"
              aria-label="Search"
              placeholder="Search volunteers…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
                    {v.hiddenFromDirectory && (
                      <Tooltip content="This volunteer has opted out of the directory. Only admins can see their profile here.">
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium dark:bg-yellow-900 dark:text-yellow-200">
                          Hidden
                        </span>
                      </Tooltip>
                    )}
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

export default function VolunteersPage() {
  const { user, loading } = useRequireAuth()

  if (loading || !user) return null

  return (
    <Suspense>
      <VolunteersPageContent user={user} />
    </Suspense>
  )
}
