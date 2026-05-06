'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Stats {
  volunteers: { total: number; this_month: number }
  projects: {
    total: number
    pending_review: number
    seeking_help: number
    in_progress: number
    completed: number
  }
  interests: { total: number; pending: number }
}

export default function AdminStatsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    apiRequest<Stats>('/api/admin/stats')
      .then(data => { setStats(data); setLoadingData(false) })
      .catch(() => setLoadingData(false))
  }, [user])

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Platform Statistics</h1>

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : !stats ? (
          <p>Failed to load statistics.</p>
        ) : (
          <>
            <h2>Volunteers</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
              <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
                <div className="text-4xl font-bold text-primary mb-1">{stats.volunteers.total}</div>
                <div className="text-text-light">Total Volunteers</div>
              </div>
              <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
                <div className="text-4xl font-bold text-primary mb-1">{stats.volunteers.this_month}</div>
                <div className="text-text-light">Joined This Month</div>
              </div>
            </div>

            <h2>Projects</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
              {[
                { label: 'Total', value: stats.projects.total },
                { label: 'Pending Review', value: stats.projects.pending_review },
                { label: 'In Progress', value: stats.projects.in_progress },
                { label: 'Seeking Help', value: stats.projects.seeking_help },
                { label: 'Completed', value: stats.projects.completed },
              ].map(s => (
                <div key={s.label} className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
                  <div className="text-4xl font-bold text-primary mb-1">{s.value}</div>
                  <div className="text-text-light">{s.label}</div>
                </div>
              ))}
            </div>

            <h2>Interests</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
              <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
                <div className="text-4xl font-bold text-primary mb-1">{stats.interests.total}</div>
                <div className="text-text-light">Total Interests</div>
              </div>
              <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
                <div className="text-4xl font-bold text-primary mb-1">{stats.interests.pending}</div>
                <div className="text-text-light">Pending Review</div>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
