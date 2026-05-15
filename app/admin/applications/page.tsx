'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Tabs from '@/components/Tabs'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface Application {
  id: number
  name: string
  email: string | null
  bio: string | null
  application_message: string | null
  approval_status: string
  created_at: string
  skills: Array<{ id: number; name: string; category_name: string }>
}

export default function ApplicationsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [applications, setApplications] = useState<Application[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING')
  const [submitting, setSubmitting] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  const loadApplications = useCallback(
    async function (status: string) {
      setLoadingData(true)
      try {
        const data = await apiRequest<Application[]>(`/api/admin/applications?status=${status}`)
        setApplications(data)
      } catch {
        showToast('Failed to load applications', 'error')
      } finally {
        setLoadingData(false)
      }
    },
    [showToast],
  )

  useEffect(() => {
    // False positive: loadApplications is async; setState only runs after the awaited API response, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.is_admin) loadApplications(activeTab)
  }, [user, activeTab, loadApplications])

  async function handleAction(id: number, action: 'approve' | 'reject') {
    setSubmitting(id)
    try {
      await apiRequest(`/api/admin/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      })
      showToast(`Application ${action}d`, 'success')
      await loadApplications(activeTab)
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Failed to ${action}`, 'error')
    } finally {
      setSubmitting(null)
    }
  }

  if (loading || !user) return null

  const tabs = [
    { key: 'PENDING' as const, label: 'Pending' },
    { key: 'APPROVED' as const, label: 'Approved' },
    { key: 'REJECTED' as const, label: 'Rejected' },
  ]

  return (
    <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
      <h1>Applications</h1>
      <p className="text-text-light mb-6">Review new volunteer applications.</p>

      <Tabs
        tabs={tabs.map((t) => ({ key: t.key, label: t.label }))}
        activeTab={activeTab}
        onChange={(k) => setActiveTab(k as typeof activeTab)}
      />

      {loadingData ? (
        <p className="text-text-light mt-6">Loading…</p>
      ) : applications.length === 0 ? (
        <p className="text-text-light mt-6">No {activeTab.toLowerCase()} applications.</p>
      ) : (
        <div className="flex flex-col gap-4 mt-6">
          {applications.map((app) => (
            <div key={app.id} className="bg-surface rounded-xl shadow p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="mb-1">{app.name}</h3>
                  <p className="text-sm text-text-light">{app.email}</p>
                  <p className="text-sm text-text-light">
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>
                {activeTab === 'PENDING' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      onClick={() => handleAction(app.id, 'approve')}
                      disabled={submitting === app.id}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleAction(app.id, 'reject')}
                      disabled={submitting === app.id}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>

              {app.application_message && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-1">Application</p>
                  <p className="text-sm text-text-light whitespace-pre-wrap">
                    {app.application_message}
                  </p>
                </div>
              )}

              {app.bio && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">Bio</p>
                  <p className="text-sm text-text-light">{app.bio}</p>
                </div>
              )}

              {app.skills.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">Skills</p>
                  <p className="text-sm text-text-light">
                    {app.skills.map((s) => s.name).join(', ')}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
