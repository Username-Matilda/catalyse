'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

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
      .then(s => setAllSkills(s))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchVolunteers, search || locationFilter ? 300 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, skillFilter, locationFilter])

  async function fetchVolunteers() {
    setLoadingVolunteers(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (skillFilter) params.set('skill_ids', skillFilter)
      if (locationFilter) params.set('country', locationFilter)
      const data = await apiRequest<{ volunteers: Volunteer[]; total: number }>(`/api/volunteers?${params}`)
      setVolunteers(data.volunteers)
    } catch {
      setVolunteers([])
    } finally {
      setLoadingVolunteers(false)
    }
  }

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
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Volunteer Directory</h1>

        <div className="flex gap-3 mb-6 flex-wrap items-end">
          <div className="flex-1" style={{ minWidth: 180 }}>
            <label htmlFor="search-volunteers" className="text-sm font-medium mb-1 block">Search by name</label>
            <input
              id="search-volunteers"
              type="search"
              aria-label="Search"
              placeholder="Search volunteers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <label htmlFor="skill-filter" className="text-sm font-medium mb-1 block">Filter by skill</label>
            <select
              id="skill-filter"
              value={skillFilter}
              onChange={e => setSkillFilter(e.target.value)}
            >
              <option value="">All skills</option>
              {allSkills.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 160 }}>
            <label htmlFor="location-filter" className="text-sm font-medium mb-1 block">Filter by country</label>
            <input
              id="location-filter"
              type="text"
              placeholder="e.g. United Kingdom"
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
            />
          </div>

          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
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
            <div className="grid grid-cols-3 gap-5 max-[1200px]:grid-cols-2 max-[600px]:grid-cols-1">
              {/* [test hook] card class used as test selector */}
              {volunteers.map(v => (
                <div key={v.id} className="card bg-surface rounded-xl shadow p-6 overflow-hidden wrap-break-word">
                  <h3 className="m-0 mb-2">
                    <Link href={`/volunteers/${v.id}`} className="text-primary-dark no-underline hover:underline">{v.name}</Link>
                  </h3>
                  {(v.location || v.local_group) && (
                    <p className="text-text-light text-sm m-0 mb-2">
                      {[v.location, v.local_group].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {v.bio && (
                    <p className="m-0 mb-3">
                      {v.bio.length > 100 ? v.bio.slice(0, 100) + '…' : v.bio}
                    </p>
                  )}
                  {v.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {v.skills.map(s => (
                        <span key={s.id} className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    {v.availability_hours_per_week ? (
                      <span className="text-sm text-text-light">
                        {v.availability_hours_per_week}h/week available
                      </span>
                    ) : <span />}
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
