'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

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
  const [search, setSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchVolunteers()
    }, search ? 300 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search])

  async function fetchVolunteers() {
    setLoadingVolunteers(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const data = await apiRequest<{ volunteers: Volunteer[]; total: number }>(`/api/volunteers?${params}`)
      setVolunteers(data.volunteers)
    } catch {
      setVolunteers([])
    } finally {
      setLoadingVolunteers(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <h1>Volunteer Directory</h1>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="search-volunteers" style={{ display: 'none' }}>Search</label>
          <input
            id="search-volunteers"
            type="search"
            aria-label="Search"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', maxWidth: 400 }}
          />
        </div>

        <div id="volunteersList">
          {loadingVolunteers ? (
            <div className="loading">Loading volunteers…</div>
          ) : volunteers.length === 0 ? (
            <p>No volunteers found.</p>
          ) : (
            volunteers.map(v => (
              <div key={v.id} className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 8px' }}>
                  <Link href={`/volunteers/${v.id}`}>{v.name}</Link>
                </h3>
                {(v.location || v.local_group) && (
                  <p style={{ color: 'var(--text-light)', margin: '0 0 8px', fontSize: '0.875rem' }}>
                    {[v.location, v.local_group].filter(Boolean).join(' · ')}
                  </p>
                )}
                {v.bio && (
                  <p style={{ margin: '0 0 12px' }}>
                    {v.bio.length > 100 ? v.bio.slice(0, 100) + '…' : v.bio}
                  </p>
                )}
                {v.skills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {v.skills.map(s => (
                      <span key={s.id} className="skill-tag">{s.name}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {v.availability_hours_per_week ? (
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                      Available: {v.availability_hours_per_week}h/week
                    </span>
                  ) : <span />}
                  <Link href={`/volunteers/${v.id}`} className="btn btn-small btn-outline">View Profile</Link>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </>
  )
}
