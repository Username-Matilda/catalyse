'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAdmin } from '@/lib/hooks/auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import VolunteerSelect from '@/components/VolunteerSelect'
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
  bugStatusLabel,
} from '@/lib/bug-report-labels'
import type { InferRouterOutputs } from '@orpc/server'
import type { AppRouter } from '@/server/router'

type BugReports = InferRouterOutputs<AppRouter>['admin']['bugReports']['list']

function exportReportsAsMarkdown(reports: BugReports): void {
  const baseUrl = window.location.origin
  const lines: string[] = [
    `# Bug Reports`,
    '',
    `Exported: ${new Date().toISOString()}`,
    `Total: ${reports.length}`,
    '',
    '---',
  ]

  for (const r of reports) {
    lines.push('')
    lines.push(`## [#${r.id} — ${r.title}](${baseUrl}/bugs/${r.id})`)
    lines.push('')
    lines.push(`- **Status:** ${bugStatusLabel(r.status)}`)
    if (r.category) lines.push(`- **Category:** ${r.category}`)
    if (r.severity) lines.push(`- **Severity:** ${r.severity}`)
    if (r.reporterName) lines.push(`- **Reporter:** ${r.reporterName}`)
    if (r.assigneeName) lines.push(`- **Assignee:** ${r.assigneeName}`)
    if (r.pageUrl) lines.push(`- **Page URL:** ${bugReportPagePath(r.pageUrl) ?? r.pageUrl}`)
    if (r.createdAt) lines.push(`- **Created:** ${formatDate(r.createdAt)}`)
    lines.push('')
    lines.push('**Description:**')
    lines.push('')
    lines.push(r.description)
    if (r.resolutionNotes) {
      lines.push('')
      lines.push('**Resolution notes:**')
      lines.push('')
      lines.push(r.resolutionNotes)
    }
    lines.push('')
    lines.push('---')
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bug-reports-${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

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

      <div className="mb-6 flex gap-4 flex-wrap items-end">
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
        <Button
          variant="secondary"
          size="sm"
          disabled={reports.length === 0}
          onClick={() => exportReportsAsMarkdown(reports)}
        >
          Export as Markdown
        </Button>
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
                <VolunteerSelect
                  id={`assign-bug-${r.id}`}
                  label="Assign to"
                  ariaLabel={`Assign volunteer to ${r.title}`}
                  value={assignSelections[r.id] ?? ''}
                  onChange={(v) => setAssignSelections((s) => ({ ...s, [r.id]: v }))}
                  placeholder="Select volunteer…"
                  enabled={!!user?.isAdmin}
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
