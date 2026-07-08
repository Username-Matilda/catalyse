'use client'

import { useState } from 'react'
import { useRequireAdmin } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { formatDate } from '@/lib/format-date'
import { Badge, type BadgeVariant } from '@/components/Badge'

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

const BUG_STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'caution',
  in_progress: 'info',
  resolved: 'success',
  wont_fix: 'neutral',
}

export default function AdminBugsPage() {
  const { user, loading } = useRequireAdmin()
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
      <main className="container py-5 pb-15">
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
              className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word w-full cursor-pointer"
              onClick={() => openEdit(r)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="mt-0 mx-0 mb-1">{r.title}</h3>
                  <div className="text-text-light flex gap-2 flex-wrap text-[0.8rem]">
                    {r.category && <span>{r.category}</span>}
                    {r.severity && <span>· {r.severity}</span>}
                    {r.reporterName && <span>· {r.reporterName}</span>}
                    <span>· {r.createdAt ? formatDate(r.createdAt) : ''}</span>
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
                <Badge variant={BUG_STATUS_VARIANT[r.status] ?? 'neutral'}>
                  {STATUS_OPTIONS.find((s) => s.value === r.status)?.label ?? r.status}
                </Badge>
              </div>

              <p className="text-text-light mt-0 mx-0 mb-3 whitespace-pre-wrap">{r.description}</p>

              {r.resolutionNotes && (
                <p className="mt-0 mx-0 mb-3 text-sm italic">Resolution: {r.resolutionNotes}</p>
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
              <h2 className="mb-1">{editModal.title}</h2>
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
                  className="w-full"
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
