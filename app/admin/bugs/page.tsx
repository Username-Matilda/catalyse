'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAdmin } from '@/lib/hooks/auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'
import { formatDate } from '@/lib/format-date'
import { useToast } from '@/lib/toast'
import { Badge } from '@/components/Badge'
import {
  BUG_STATUS_OPTIONS,
  BUG_CATEGORY_OPTIONS,
  BUG_STATUS_VARIANT,
  bugReportPagePath,
} from '@/lib/bug-report-labels'

const STATUS_OPTIONS = [{ value: 'all', label: 'All' }, ...BUG_STATUS_OPTIONS] as const
const CATEGORY_OPTIONS = [{ value: 'all', label: 'All' }, ...BUG_CATEGORY_OPTIONS] as const

export default function AdminBugsPage() {
  const { user, loading } = useRequireAdmin()
  const router = useRouter()
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

  const listQuery = orpc.admin.bugReports.list.queryOptions({
    input: {
      status: statusFilter !== 'all' ? statusFilter : undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
    },
  })
  const { data: reports = [], isLoading: loadingData } = useQuery({
    ...listQuery,
    enabled: !!user?.isAdmin,
  })

  const { data: volunteersData } = useQuery({
    ...orpc.volunteers.list.queryOptions({ input: { limit: 100 } }),
    enabled: !!user?.isAdmin,
  })
  const volunteers = volunteersData?.volunteers ?? []

  const [assignSelections, setAssignSelections] = useState<Record<number, string>>({})

  const updateMutation = useMutation({
    ...orpc.admin.bugReports.update.mutationOptions(),
    onSuccess: () => {
      showToast('Marked in progress', 'success')
      void queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error')
    },
  })

  const assignMutation = useMutation({
    ...orpc.admin.bugReports.assign.mutationOptions(),
    onSuccess: (_, variables) => {
      showToast('Bug report assigned', 'success')
      setAssignSelections((s) => {
        const next = { ...s }
        delete next[variables.id]
        return next
      })
      void queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to assign', 'error')
    },
  })

  if (loading || !user) return null

  return (
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
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/bugs/${r.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') router.push(`/bugs/${r.id}`)
            }}
            className="card block bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word w-full cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="mt-0 mx-0 mb-1">{r.title}</h3>
                <div className="text-text-light flex gap-2 flex-wrap text-[0.8rem]">
                  {r.category && <span>{r.category}</span>}
                  {r.severity && <span>· {r.severity}</span>}
                  {r.reporterName && <span>· {r.reporterName}</span>}
                  <span>· {r.createdAt ? formatDate(r.createdAt) : ''}</span>
                  {r.pageUrl && <span>· {bugReportPagePath(r.pageUrl) ?? r.pageUrl}</span>}
                  {r.assigneeName && <span>· Assigned to: {r.assigneeName}</span>}
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

            <div
              className="flex gap-2 items-end flex-wrap pt-3 border-t border-brand-border"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {r.status === 'open' && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: r.id, status: 'in_progress' })}
                >
                  Mark In Progress
                </Button>
              )}

              <div className="flex-1 min-w-50 max-w-75">
                <FilterDropdown
                  id={`assign-bug-${r.id}`}
                  label="Assign to"
                  ariaLabel={`Assign volunteer to ${r.title}`}
                  value={assignSelections[r.id] ?? ''}
                  options={[
                    { value: '', label: 'Select volunteer…' },
                    ...volunteers.map((v) => ({ value: String(v.id), label: v.name })),
                  ]}
                  onChange={(v) => setAssignSelections((s) => ({ ...s, [r.id]: v }))}
                  searchable
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!assignSelections[r.id] || assignMutation.isPending}
                onClick={() =>
                  assignMutation.mutate({
                    id: r.id,
                    volunteerId: parseInt(assignSelections[r.id]!, 10),
                  })
                }
              >
                Assign
              </Button>
            </div>
          </div>
        ))
      )}
    </main>
  )
}
