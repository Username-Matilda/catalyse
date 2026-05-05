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
  const [editModal, setEditModal] = useState<BugReport | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editNotes, setEditNotes] = useState('')
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

  function openEdit(report: BugReport) {
    setEditModal(report)
    setEditStatus(report.status)
    setEditNotes(report.resolution_notes ?? '')
  }

  async function handleUpdate() {
    if (!editModal) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/bug-reports/${editModal.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: editStatus, resolution_notes: editNotes || null }),
      })
      setAlert({ text: 'Report updated!', type: 'success' })
      setEditModal(null)
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
        <h1>Bug Reports &amp; Feedback</h1>

        {alert && (
          <div role="alert" className={`message ${alert.type}`} style={{ marginBottom: 16 }}>
            {alert.text}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="status-filter">Filter by status</label>
          <select
            id="status-filter"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {loadingData ? (
          <div className="loading">Loading…</div>
        ) : reports.length === 0 ? (
          <p>No bug reports found.</p>
        ) : (
          reports.map(r => (
            <div
              key={r.id}
              className="card"
              style={{ marginBottom: 16, cursor: 'pointer' }}
              onClick={() => openEdit(r)}
            >
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
            </div>
          ))
        )}
      </main>

      {editModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}
        >
          <div
            role="dialog"
            aria-label={editModal.title}
            aria-modal="true"
            style={{ background: 'var(--card-bg, white)', borderRadius: 12, padding: 32, maxWidth: 520, width: '90%' }}
          >
            <h2 style={{ marginBottom: 4 }}>{editModal.title}</h2>
            <p style={{ color: 'var(--text-light)', marginBottom: 16, fontSize: '0.875rem' }}>{editModal.description}</p>

            <div className="form-group">
              <label htmlFor="edit-status">Status</label>
              <select
                id="edit-status"
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                style={{ width: '100%' }}
              >
                {STATUS_OPTIONS.filter(s => s !== 'all').map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="edit-notes">Resolution Notes</label>
              <textarea
                id="edit-notes"
                rows={3}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Describe what was fixed…"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={handleUpdate}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
