'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

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

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't Fix" },
]
const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'ux', label: 'UX Issue' },
]

const BUG_STATUS_CLASSES: Record<string, string> = {
  open: 'bg-[#FED7AA] text-[#92400E] dark:bg-[#78350F] dark:text-[#FED7AA]',
  in_progress: 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]',
  resolved: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
  wont_fix: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
}

function bugStatusClasses(status: string) {
  return `inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${BUG_STATUS_CLASSES[status] ?? 'bg-[#F3F4F6] text-[#374151]'}`
}

export default function AdminBugsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [reports, setReports] = useState<BugReport[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editModal, setEditModal] = useState<BugReport | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    loadReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter, categoryFilter])

  async function loadReports() {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await apiRequest<BugReport[]>(`/api/admin/bug-reports${query}`)
      setReports(data)
    } catch {
      showToast('Failed to load reports', 'error')
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
      showToast('Report updated!', 'success')
      setEditModal(null)
      await loadReports()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Bug Reports &amp; Feedback</h1>

        <div className="mb-6 flex gap-4 flex-wrap">
          <FilterDropdown
            id="status-filter"
            label="Status"
            ariaLabel="Filter by status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={setStatusFilter}
          />
          <FilterDropdown
            id="category-filter"
            label="Type"
            ariaLabel="Filter by type"
            value={categoryFilter}
            options={CATEGORY_OPTIONS}
            onChange={setCategoryFilter}
          />
        </div>

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : reports.length === 0 ? (
          <p>No bug reports found.</p>
        ) : (
          /* [test hook] card class used as test selector */
          reports.map((r) => (
            <div
              key={r.id}
              className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word w-full"
              style={{ cursor: 'pointer' }}
              onClick={() => openEdit(r)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 8,
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>{r.title}</h3>
                  <div
                    className="text-text-light"
                    style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}
                  >
                    {r.category && <span>{r.category}</span>}
                    {r.severity && <span>· {r.severity}</span>}
                    {r.reporter_name && <span>· {r.reporter_name}</span>}
                    <span>· {new Date(r.created_at).toLocaleDateString()}</span>
                    {r.page_url &&
                      (() => {
                        let path: string
                        try {
                          path = new URL(r.page_url).pathname + new URL(r.page_url).search
                        } catch {
                          path = r.page_url
                        }
                        return (
                          <span>
                            ·{' '}
                            <a
                              href={path}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="underline hover:text-text"
                            >
                              {path}
                            </a>
                          </span>
                        )
                      })()}
                  </div>
                </div>
                <span className={bugStatusClasses(r.status)}>
                  {STATUS_OPTIONS.find((s) => s.value === r.status)?.label ?? r.status}
                </span>
              </div>

              <p className="text-text-light" style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
                {r.description}
              </p>

              {r.resolution_notes && (
                <p style={{ margin: '0 0 12px', fontSize: '0.875rem', fontStyle: 'italic' }}>
                  Resolution: {r.resolution_notes}
                </p>
              )}
            </div>
          ))
        )}
      </main>

      {editModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditModal(null)
          }}
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

              {/* TODO: add quick-action buttons to mark as in_progress with an assignee, without opening the full edit form */}
              <div className="mb-5">
                <label htmlFor="edit-status">Status</label>
                <select
                  id="edit-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {STATUS_OPTIONS.filter((s) => s.value !== 'all').map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-5">
                <label htmlFor="edit-notes">Resolution Notes</label>
                <textarea
                  id="edit-notes"
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Describe what was fixed…"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setEditModal(null)}>
                  Cancel
                </Button>
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
