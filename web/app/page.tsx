'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Project {
  id: number
  title: string
  status: string
  is_seeking_help: boolean | null
  is_seeking_owner: boolean | null
}

interface ProjectsResponse {
  projects: Project[]
  total: number
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'needs_tasks', label: 'Needs Tasks' },
  { value: 'seeking_owner', label: 'Seeking Owner' },
  { value: 'seeking_help', label: 'Seeking Help' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
]

const NEEDS_OPTIONS = [
  { value: '', label: 'All needs' },
  { value: 'seeking_help', label: 'Seeking Help' },
  { value: 'seeking_owner', label: 'Seeking Owner' },
]

export default function ProjectsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [needsFilter, setNeedsFilter] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)
  const [needsOpen, setNeedsOpen] = useState(false)
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
    debounceRef.current = setTimeout(() => {
      fetchProjects()
    }, search ? 300 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, statusFilter, needsFilter])

  async function fetchProjects() {
    setLoadingProjects(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (needsFilter === 'seeking_help') params.set('status', 'seeking_help')
      else if (needsFilter === 'seeking_owner') params.set('status', 'seeking_owner')
      const data = await apiRequest<ProjectsResponse>(`/api/projects?${params}`)
      setProjects(data.projects)
    } catch {
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <h1 role="heading">Projects</h1>

        {user.is_admin && pendingCount > 0 && (
          <div className="message" style={{ marginBottom: 16, background: 'var(--warning-bg, #fffbeb)', border: '1px solid var(--warning, #d97706)', borderRadius: 8, padding: 12 }}>
            <strong>{pendingCount} project{pendingCount !== 1 ? 's' : ''} pending review.</strong>{' '}
            <Link href="/admin/triage">Go to triage →</Link>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="search-projects" style={{ display: 'none' }}>Search</label>
            <input
              id="search-projects"
              type="search"
              aria-label="Search"
              placeholder="Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <button
              role="button"
              onClick={() => { setStatusOpen(o => !o); setNeedsOpen(false) }}
              className="btn btn-secondary"
            >
              Status filter{statusFilter ? `: ${STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}` : ''}
            </button>
            {statusOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--card-bg, white)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 180, padding: 4 }}>
                {STATUS_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={statusFilter === opt.value}
                    onClick={() => { setStatusFilter(opt.value); setStatusOpen(false) }}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 4, background: statusFilter === opt.value ? 'var(--primary-light, #e0f2fe)' : 'transparent' }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              role="button"
              onClick={() => { setNeedsOpen(o => !o); setStatusOpen(false) }}
              className="btn btn-secondary"
            >
              Needs filter{needsFilter ? `: ${NEEDS_OPTIONS.find(o => o.value === needsFilter)?.label}` : ''}
            </button>
            {needsOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--card-bg, white)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 180, padding: 4 }}>
                {NEEDS_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={needsFilter === opt.value}
                    onClick={() => { setNeedsFilter(opt.value); setStatusOpen(false); setNeedsOpen(false) }}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 4, background: needsFilter === opt.value ? 'var(--primary-light, #e0f2fe)' : 'transparent' }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {loadingProjects ? (
          <div className="loading">Loading projects…</div>
        ) : projects.length === 0 ? (
          <p>No projects found.</p>
        ) : (
          <div>
            {projects.map(p => (
              <div key={p.id} className="card">
                <Link role="link" href={`/projects/${p.id}`}>{p.title}</Link>
                <span style={{ marginLeft: 8, color: 'var(--text-light)' }}>{p.status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
