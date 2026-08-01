'use client'

import Link from 'next/link'
import { useRequireAdmin } from '@/lib/hooks/auth'
import { useQuery } from '@tanstack/react-query'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import { orpc } from '@/lib/orpc'
import { formatDate } from '@/lib/format-date'
import { Badge } from '@/components/Badge'
import {
  BUG_STATUS_OPTIONS,
  BUG_CATEGORY_OPTIONS,
  BUG_STATUS_VARIANT,
} from '@/lib/bug-report-labels'

const STATUS_OPTIONS = [{ value: 'all', label: 'All' }, ...BUG_STATUS_OPTIONS] as const
const CATEGORY_OPTIONS = [{ value: 'all', label: 'All' }, ...BUG_CATEGORY_OPTIONS] as const

export default function AdminBugsPage() {
  const { user, loading } = useRequireAdmin()
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
          <Link
            key={r.id}
            href={`/bugs/${r.id}`}
            className="card block bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word w-full"
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
                      return <span>· {path}</span>
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
          </Link>
        ))
      )}
    </main>
  )
}
