'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
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
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Bug Reports &amp; Feedback</h1>

        {alert && (
          <div role="alert" className={alert.type === 'success'
            ? 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] dark:bg-[#064E3B] dark:text-[#6EE7B7] dark:border-[#059669]'
            : 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]'}>
            {alert.text}
          </div>
        )}

        <div className="mb-6">
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
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : reports.length === 0 ? (
          <p>No bug reports found.</p>
        ) : (
          /* [test hook] card class used as test selector */
          reports.map(r => (
            <div
              key={r.id}
              className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              style={{ cursor: 'pointer' }}
              onClick={() => openEdit(r)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>{r.title}</h3>
                  <div className="text-text-light" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
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

              <p className="text-text-light" style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{r.description}</p>

              {r.page_url && (
                <p className="text-sm text-text-light" style={{ margin: '0 0 12px' }}>Page: {r.page_url}</p>
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
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}
        >
          <div
            role="dialog"
            aria-label={editModal.title}
            aria-modal="true"
            className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 style={{ marginBottom: 4 }}>{editModal.title}</h2>
            </div>
            <div className="p-6">
              <p className="text-text-light mb-4 text-sm">{editModal.description}</p>

              <div className="mb-5">
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

              <div className="mb-5">
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

              <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
                <Button disabled={submitting} onClick={handleUpdate}>
                  Update
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
