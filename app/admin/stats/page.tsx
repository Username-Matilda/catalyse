'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Stats {
  volunteers: { total: number; thisMonth: number }
  projects: {
    total: number
    pendingReview: number
    seekingHelp: number
    inProgress: number
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
    if (!loading && user && !user.isAdmin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.isAdmin) return
    apiRequest<Stats>('/api/admin/stats')
      .then((data) => {
        setStats(data)
        setLoadingData(false)
      })
      .catch(() => setLoadingData(false))
  }, [user])

  if (loading || !user) return null

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Platform Statistics</h1>

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : !stats ? (
          <p>Failed to load statistics.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface rounded-xl shadow p-6 overflow-hidden">
              <h2 className="mt-0">Volunteers</h2>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}
              >
                <div>
                  <div className="text-4xl font-bold text-primary mb-1">
                    {stats.volunteers.total}
                  </div>
                  <div className="text-text-light">Total Registered</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-success mb-1">
                    {stats.volunteers.thisMonth}
                  </div>
                  <div className="text-text-light">Joined This Month</div>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-xl shadow p-6 overflow-hidden">
              <h2 className="mt-0">Projects</h2>
              <div style={{ marginTop: 16 }}>
                {[
                  { label: 'Total', value: stats.projects.total, color: undefined },
                  {
                    label: 'Pending Review',
                    value: stats.projects.pendingReview,
                    color: 'text-warning',
                  },
                  {
                    label: 'Seeking Help',
                    value: stats.projects.seekingHelp,
                    color: 'text-secondary',
                  },
                  { label: 'In Progress', value: stats.projects.inProgress, color: undefined },
                  { label: 'Completed', value: stats.projects.completed, color: 'text-success' },
                ].map((row, i, arr) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom:
                        i < arr.length - 1 ? '1px solid var(--color-border)' : undefined,
                    }}
                  >
                    <span className={row.color}>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface rounded-xl shadow p-6 overflow-hidden">
              <h2 className="mt-0">Volunteer Interest</h2>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}
              >
                <div>
                  <div className="text-4xl font-bold text-secondary mb-1">
                    {stats.interests.total}
                  </div>
                  <div className="text-text-light">Total Interests</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-warning mb-1">
                    {stats.interests.pending}
                  </div>
                  <div className="text-text-light">Pending Response</div>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-xl shadow p-6 overflow-hidden">
              <h2 className="mt-0">Quick Actions</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                <Button variant="outline" href="/admin/triage">
                  Review Pending Projects ({stats.projects.pendingReview})
                </Button>
                <Button variant="outline" href="/admin/projects/new">
                  Create New Org Project
                </Button>
                <Button variant="outline" href="/admin/volunteers">
                  Browse Volunteers
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
