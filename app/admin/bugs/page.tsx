'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't Fix" },
] as const
const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'ux', label: 'UX Issue' },
] as const

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
  const queryClient = useQueryClient()
  const { value: statusFilter, onChange: setStatusFilter } = useFilterOptions(
    STATUS_OPTIONS,
    'open',
  )
  const { value: categoryFilter, onChange: setCategoryFilter } = useFilterOptions(
    CATEGORY_OPTIONS,
    'all',
  )

  const { data: reports = [], isLoading: loadingData } = useQuery({
    ...orpc.admin.bugReports.list.queryOptions({
      input: {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
      },
    }),
    enabled: !!user?.isAdmin,
  })

  const [editModal, setEditModal] = useState<(typeof reports)[number] | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.isAdmin) router.push('/')
  }, [user, loading, router])

  const updateMutation = useMutation({
    ...orpc.admin.bugReports.update.mutationOptions(),
    onSuccess: () => {
      showToast('Report updated!', 'success')
      setEditModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.admin.bugReports.list.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error')
    },
  })

  function openEdit(report: (typeof reports)[number]) {
    setEditModal(report)
    setEditStatus(report.status)
    setEditNotes(report.resolutionNotes ?? '')
  }

  function handleUpdate() {
    if (!editModal) return
    updateMutation.mutate({
      id: editModal.id,
      status: editStatus,
      resolutionNotes: editNotes || null,
    })
  }

  if (loading || !user) return null

  return (
    <>
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
                    {r.reporterName && <span>· {r.reporterName}</span>}
                    <span>· {r.createdAt?.toLocaleDateString()}</span>
                    {r.pageUrl &&
                      (() => {
                        let path: string
                        try {
                          path = new URL(r.pageUrl).pathname + new URL(r.pageUrl).search
                        } catch {
                          path = r.pageUrl
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

              {r.resolutionNotes && (
                <p style={{ margin: '0 0 12px', fontSize: '0.875rem', fontStyle: 'italic' }}>
                  Resolution: {r.resolutionNotes}
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

              <div className="mb-5">
                <FilterDropdown
                  id="edit-status"
                  label="Status"
                  ariaLabel="Status"
                  value={editStatus}
                  options={STATUS_OPTIONS.filter((s) => s.value !== 'all')}
                  onChange={(v) => setEditStatus(v)}
                />
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
                <Button disabled={updateMutation.isPending} onClick={handleUpdate}>
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
