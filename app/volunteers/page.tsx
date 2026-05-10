'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { LOCATION_OPTIONS } from '@/lib/filter-options'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { CARD_GRID_CLASSES } from '@/components/ProjectCard'

interface FlatSkill {
  id: number
  name: string
  category_name: string
}

interface Skill {
  id: number
  name: string
  category_name: string
}

interface Volunteer {
  id: number
  name: string
  bio: string | null
  location: string | null
  country: string | null
  local_group: string | null
  availability_hours_per_week: number | null
  created_at: string
  skills: Skill[]
}

export default function VolunteersPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [loadingVolunteers, setLoadingVolunteers] = useState(true)
  const [allSkills, setAllSkills] = useState<FlatSkill[]>([])
  const [search, setSearch] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    apiRequest<FlatSkill[]>('/api/skills/flat')
      .then((s) => setAllSkills(s))
      .catch(() => {})
  }, [])

  const fetchVolunteers = useCallback(async () => {
    setLoadingVolunteers(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (skillFilter) params.set('skill_ids', skillFilter)
      if (locationFilter) {
        const [country, localGroup] = locationFilter.split(':')
        params.set('country', country)
        if (localGroup) params.set('local_group', localGroup)
      }
      const data = await apiRequest<{ volunteers: Volunteer[]; total: number }>(
        `/api/volunteers?${params}`,
      )
      setVolunteers(data.volunteers)
    } catch {
      setVolunteers([])
    } finally {
      setLoadingVolunteers(false)
    }
  }, [search, skillFilter, locationFilter])

  useEffect(() => {
    if (!user) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchVolunteers, search || locationFilter ? 300 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [user, fetchVolunteers, search, locationFilter])

  function clearFilters() {
    setSearch('')
    setSkillFilter('')
    setLocationFilter('')
  }

  const hasFilters = search || skillFilter || locationFilter

  if (loading || !user) return null

  return (
    <>
      <Header />
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
              label="Country"
              ariaLabel="Country filter"
              value={locationFilter}
              options={LOCATION_OPTIONS}
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
                  {(v.location || v.country || v.local_group || v.availability_hours_per_week) && (
                    <div className="flex items-center gap-3 flex-wrap text-xs text-text-light mb-2">
                      {(v.location || v.country || v.local_group) && (
                        <span>
                          📍 {[v.local_group, v.country ?? v.location].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {v.availability_hours_per_week && (
                        <span>🕐 {v.availability_hours_per_week}h/week</span>
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
                  <div className="flex justify-between items-center mt-auto pt-4 border-t border-brand-border">
                    <span className="text-sm text-text-light">
                      Joined{' '}
                      {new Date(v.created_at).toLocaleDateString('en-GB', {
                        month: 'short',
                        year: 'numeric',
                      })}
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
