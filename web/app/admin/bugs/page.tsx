'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface BugReport {
  id: number
  title: string
  description: string
  category: string | null
  severity: string | null
  status: string
  page_url: string | null
  reporter_name: string | null
  reporter_email: string | null
  resolution_notes: string | null
  created_at: string
}

const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'resolved', 'wont_fix']

export default function AdminBugsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [reports, setReports] = useState<BugReport[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [resolveModal, setResolveModal] = useState<BugReport | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    loadReports()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter])

  async function loadReports() {
    setLoadingData(true)
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const data = await apiRequest<BugReport[]>(`/api/admin/bug-reports${params}`)
      setReports(data)
    } catch {
      setAlert({ text: 'Failed to load reports', type: 'error' })
    } finally {
      setLoadingData(false)
    }
  }

  async function updateStatus(id: number, status: string, notes?: string) {
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/bug-reports/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, resolution_notes: notes ?? null }),
      })
      setAlert({ text: `Report marked as ${status}`, type: 'success' })
      setResolveModal(null)
      setResolutionNotes('')
      await loadReports()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to update', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <h1>Bug Reports</h1>

        {alert && (
          <div role="alert" className={`message ${alert.type}`} style={{ marginBottom: 16 }}>
            {alert.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'} btn-small`}
              onClick={() => setStatusFilter(s)}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {loadingData ? (
          <div className="loading">Loading…</div>
        ) : reports.length === 0 ? (
          <p>No bug reports found.</p>
        ) : (
          reports.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>{r.title}</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                    {r.category && <span>{r.category}</span>}
                    {r.severity && <span>· {r.severity}</span>}
                    {r.reporter_name && <span>· {r.reporter_name}</span>}
                    <span>· {new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.8rem', background: 'var(--bg-secondary, #f8fafc)', whiteSpace: 'nowrap' }}>
                  {r.status.replace(/_/g, ' ')}
                </span>
              </div>

              <p style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap', color: 'var(--text-light)' }}>{r.description}</p>

              {r.page_url && (
                <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: 'var(--text-light)' }}>Page: {r.page_url}</p>
              )}

              {r.resolution_notes && (
                <p style={{ margin: '0 0 12px', fontSize: '0.875rem', fontStyle: 'italic' }}>Resolution: {r.resolution_notes}</p>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {r.status === 'open' && (
                  <button className="btn btn-small btn-secondary" onClick={() => updateStatus(r.id, 'in_progress')}>
                    Start
                  </button>
                )}
                {(r.status === 'open' || r.status === 'in_progress') && (
                  <>
                    <button className="btn btn-small btn-primary" onClick={() => { setResolveModal(r); setResolutionNotes('') }}>
                      Resolve
                    </button>
                    <button className="btn btn-small" style={{ color: 'var(--text-light)' }} onClick={() => updateStatus(r.id, 'wont_fix')}>
                      Won&apos;t Fix
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </main>

      {resolveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setResolveModal(null) }}>
          <div style={{ background: 'var(--card-bg, white)', borderRadius: 12, padding: 32, maxWidth: 480, width: '90%' }}>
            <h2 style={{ marginBottom: 8 }}>Resolve Report</h2>
            <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>{resolveModal.title}</p>
            <div className="form-group">
              <label htmlFor="resolution-notes">Resolution Notes</label>
              <textarea
                id="resolution-notes"
                rows={3}
                value={resolutionNotes}
                onChange={e => setResolutionNotes(e.target.value)}
                placeholder="Describe what was fixed…"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setResolveModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => updateStatus(resolveModal.id, 'resolved', resolutionNotes)}
              >
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
