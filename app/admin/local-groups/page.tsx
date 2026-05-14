'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import Radio from '@/components/Radio'
import FilterDropdown from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { COUNTRY_OPTIONS } from '@/lib/filter-options'
import { useToast } from '@/lib/toast'

type StatusFilter = 'all' | 'active' | 'pending' | 'on_hold' | 'declined'
type ReviewAction = 'accept' | 'merge' | 'on_hold' | 'decline'

interface LocalGroup {
  id: number
  name: string
  country: string
}

interface Suggestion {
  id: number
  name: string
  country: string
  status: 'pending' | 'on_hold' | 'declined'
  admin_notes: string | null
  created_at: string
  suggested_by: { id: number; name: string; email: string }
  merged_into: { id: number; name: string } | null
}

type DisplayGroup = { kind: 'group' } & LocalGroup
type DisplaySuggestion = { kind: 'suggestion' } & Suggestion
type DisplayItem = DisplayGroup | DisplaySuggestion

const SUGGESTION_COUNTRIES = COUNTRY_OPTIONS.filter(
  (o) => o.value && o.value !== 'Remote' && o.value !== 'Other',
)

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'declined', label: 'Declined' },
]

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  on_hold: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  declined: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  pending: 'Pending',
  on_hold: 'On Hold',
  declined: 'Declined',
}

export default function AdminLocalGroupsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [countryFilter, setCountryFilter] = useState('')
  const [items, setItems] = useState<DisplayItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)

  const [allGroups, setAllGroups] = useState<LocalGroup[]>([])
  const [deleteTarget, setDeleteTarget] = useState<DisplayItem | null>(null)
  const [deleteTargetProjects, setDeleteTargetProjects] = useState<{ id: number; title: string }[]>([])
  const [loadingDeleteProjects, setLoadingDeleteProjects] = useState(false)

  // Add group modal
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addCountry, setAddCountry] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Edit group modal
  const [editGroup, setEditGroup] = useState<LocalGroup | null>(null)
  const [editName, setEditName] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Review suggestion modal
  const [reviewSuggestion, setReviewSuggestion] = useState<Suggestion | null>(null)
  const [reviewAction, setReviewAction] = useState<ReviewAction>('accept')
  const [reviewEditName, setReviewEditName] = useState('')
  const [reviewEditCountry, setReviewEditCountry] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState<number | ''>('')
  const [adminNotes, setAdminNotes] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    apiRequest<{ groups: LocalGroup[] }>('/api/local-groups')
      .then((data) => setAllGroups(data.groups))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (!user?.is_admin) return

    setLoadingItems(true)

    async function fetchItems() {
      const groups: DisplayGroup[] = []
      const suggestions: DisplaySuggestion[] = []

      const fetchGroups = statusFilter === 'all' || statusFilter === 'active'
      const suggestionStatuses: ('pending' | 'on_hold' | 'declined')[] =
        statusFilter === 'all'
          ? ['pending', 'on_hold', 'declined']
          : statusFilter === 'pending' || statusFilter === 'on_hold' || statusFilter === 'declined'
            ? [statusFilter]
            : []

      await Promise.all([
        fetchGroups
          ? apiRequest<{ groups: LocalGroup[] }>('/api/admin/local-groups').then((d) => {
              groups.push(...d.groups.map((g) => ({ kind: 'group' as const, ...g })))
            })
          : Promise.resolve(),
        ...suggestionStatuses.map((s) =>
          apiRequest<{ suggestions: Suggestion[] }>(
            `/api/admin/local-groups/suggestions?status=${s}`,
          ).then((d) => {
            suggestions.push(
              ...d.suggestions.map((sg) => ({ kind: 'suggestion' as const, ...sg })),
            )
          }),
        ),
      ])

      const merged: DisplayItem[] = [
        ...groups,
        ...suggestions,
      ].sort((a, b) => {
        const cc = a.country.localeCompare(b.country)
        if (cc !== 0) return cc
        return a.name.localeCompare(b.name)
      })

      setItems(merged)
    }

    fetchItems()
      .catch(() => {})
      .finally(() => setLoadingItems(false))
  }, [user, statusFilter])

  useEffect(() => {
    if (!deleteTarget || deleteTarget.kind !== 'group') {
      setDeleteTargetProjects([])
      return
    }
    setLoadingDeleteProjects(true)
    apiRequest<{ projects: { id: number; title: string }[]; total: number }>(
      `/api/projects?local_group=${encodeURIComponent(deleteTarget.name)}&limit=100`,
    )
      .then((d) => setDeleteTargetProjects(d.projects))
      .catch(() => setDeleteTargetProjects([]))
      .finally(() => setLoadingDeleteProjects(false))
  }, [deleteTarget])

  const displayItems = countryFilter
    ? items.filter((i) => i.country === countryFilter)
    : items

  const countryOptions = [
    { value: '', label: 'All countries' },
    ...Array.from(new Set(items.map((i) => i.country)))
      .sort()
      .map((c) => ({ value: c, label: c })),
  ]

  const mergeOptions = [
    { value: '', label: 'Select an existing group…' },
    ...allGroups.map((g) => ({ value: String(g.id), label: `${g.country} — ${g.name}` })),
  ]

  function openEdit(group: LocalGroup) {
    setEditGroup(group)
    setEditName(group.name)
    setEditCountry(group.country)
  }

  function openReview(suggestion: Suggestion) {
    setReviewSuggestion(suggestion)
    setReviewAction('accept')
    setReviewEditName(suggestion.name)
    setReviewEditCountry(suggestion.country)
    setMergeTargetId('')
    setAdminNotes('')
  }

  function openAdd() {
    setAddName('')
    setAddCountry('')
    setShowAdd(true)
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddSubmitting(true)
    try {
      const group = await apiRequest<LocalGroup>('/api/admin/local-groups', {
        method: 'POST',
        body: JSON.stringify({ name: addName.trim(), country: addCountry }),
      })
      const newItem: DisplayGroup = { kind: 'group', ...group }
      setItems((prev) => {
        if (statusFilter === 'active' || statusFilter === 'all') {
          return [newItem, ...prev].sort((a, b) => {
            const cc = a.country.localeCompare(b.country)
            return cc !== 0 ? cc : a.name.localeCompare(b.name)
          })
        }
        return prev
      })
      setAllGroups((prev) => [...prev, group])
      showToast('Local group added', 'success')
      setShowAdd(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add group', 'error')
    } finally {
      setAddSubmitting(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editGroup) return
    setEditSubmitting(true)
    try {
      const group = await apiRequest<LocalGroup>(`/api/admin/local-groups/${editGroup.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName.trim(), country: editCountry }),
      })
      setItems((prev) =>
        prev.map((item) =>
          item.kind === 'group' && item.id === group.id ? { kind: 'group', ...group } : item,
        ),
      )
      setAllGroups((prev) => prev.map((g) => (g.id === group.id ? group : g)))
      showToast('Local group updated', 'success')
      setEditGroup(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update group', 'error')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault()
    if (!reviewSuggestion) return
    setReviewSubmitting(true)
    try {
      const body: Record<string, unknown> = { action: reviewAction }
      if (reviewAction === 'accept') {
        body.name = reviewEditName.trim()
        body.country = reviewEditCountry.trim()
      } else if (reviewAction === 'merge') {
        body.merged_into_id = mergeTargetId
      }
      if (adminNotes.trim()) body.admin_notes = adminNotes.trim()

      await apiRequest(`/api/admin/local-groups/suggestions/${reviewSuggestion.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })

      setItems((prev) => prev.filter((i) => !(i.kind === 'suggestion' && i.id === reviewSuggestion.id)))

      if (reviewAction === 'accept') {
        const newGroup: DisplayGroup = {
          kind: 'group',
          id: Date.now(),
          name: reviewEditName.trim(),
          country: reviewEditCountry.trim(),
        }
        setAllGroups((prev) => [...prev, { id: newGroup.id, name: newGroup.name, country: newGroup.country }])
        if (statusFilter === 'active' || statusFilter === 'all') {
          setItems((prev) =>
            [...prev, newGroup].sort((a, b) => {
              const cc = a.country.localeCompare(b.country)
              return cc !== 0 ? cc : a.name.localeCompare(b.name)
            }),
          )
        }
      }

      const actionLabels: Record<ReviewAction, string> = {
        accept: 'accepted',
        merge: 'merged',
        on_hold: 'put on hold',
        decline: 'declined',
      }
      showToast(`Suggestion ${actionLabels[reviewAction]}`, 'success')
      setReviewSuggestion(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update suggestion', 'error')
    } finally {
      setReviewSubmitting(false)
    }
  }

  async function deleteItem() {
    if (!deleteTarget) return
    const item = deleteTarget
    const url =
      item.kind === 'group'
        ? `/api/admin/local-groups/${item.id}`
        : `/api/admin/local-groups/suggestions/${item.id}`
    try {
      await apiRequest(url, { method: 'DELETE' })
      setItems((prev) => prev.filter((i) => !(i.kind === item.kind && i.id === item.id)))
      if (item.kind === 'group') {
        setAllGroups((prev) => prev.filter((g) => g.id !== item.id))
      }
      showToast('Deleted', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  function itemStatus(item: DisplayItem): string {
    return item.kind === 'group' ? 'active' : item.status
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <div className="flex items-center justify-between mb-2">
          <h1 className="m-0">Local Groups</h1>
          <Button size="sm" onClick={openAdd}>
            Add Local Group
          </Button>
        </div>
        <p className="text-text-light mb-6">
          Manage active local groups and review volunteer suggestions.
        </p>

        <div className="flex flex-wrap gap-4 mb-6">
          <FilterDropdown
            id="status-filter"
            label="Status"
            ariaLabel="Status filter"
            value={statusFilter}
            options={STATUS_FILTER_OPTIONS}
            onChange={(v) => setStatusFilter((v || 'all') as StatusFilter)}
          />
          <FilterDropdown
            id="country-filter"
            label="Country"
            ariaLabel="Country filter"
            value={countryFilter}
            options={countryOptions}
            onChange={(v) => setCountryFilter(v)}
          />
        </div>

        {loadingItems ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : displayItems.length === 0 ? (
          <p className="text-text-light">No local groups found.</p>
        ) : (
          <div className="space-y-4">
            {displayItems.map((item) => {
              const status = itemStatus(item)
              return (
                <article
                  key={`${item.kind}-${item.id}`}
                  className="bg-surface rounded-xl shadow px-5 py-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {item.country} — {item.name}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[status] ?? ''}`}
                      >
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    </div>
                    {item.kind === 'suggestion' && (
                      <p className="text-sm text-text-light m-0 mt-1">
                        Suggested by{' '}
                        <Link
                          href={`/admin/volunteers/${item.suggested_by.id}`}
                          className="text-secondary-dark no-underline hover:text-primary"
                        >
                          {item.suggested_by.name}
                        </Link>
                        {' · '}
                        {new Date(item.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                    {item.kind === 'suggestion' && item.admin_notes && (
                      <p className="text-sm text-text-light mt-2 mb-0 italic">{item.admin_notes}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {item.kind === 'group' && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                        Edit
                      </Button>
                    )}
                    {item.kind === 'suggestion' &&
                      (item.status === 'pending' || item.status === 'on_hold') && (
                        <Button size="sm" onClick={() => openReview(item)}>
                          Review
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setDeleteTarget(item)}
                    >
                      Delete
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      {/* Add Group Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAdd(false)
          }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">Add Local Group</h2>
              <Button variant="ghost" icon onClick={() => setShowAdd(false)} aria-label="Close">
                ×
              </Button>
            </div>
            <div className="p-6">
              <form onSubmit={submitAdd}>
                <div className="mb-5">
                  <FilterDropdown
                    id="add-country"
                    label="Country"
                    ariaLabel="Select country"
                    value={addCountry}
                    options={SUGGESTION_COUNTRIES}
                    onChange={setAddCountry}
                    searchable
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="add-name">Group Name</label>
                  <input
                    id="add-name"
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g., Bristol, Edinburgh"
                  />
                </div>
                <div className="pt-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={addSubmitting || !addCountry || !addName.trim()}
                  >
                    {addSubmitting ? 'Saving…' : 'Add Group'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editGroup && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditGroup(null)
          }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">Edit Local Group</h2>
              <Button variant="ghost" icon onClick={() => setEditGroup(null)} aria-label="Close">
                ×
              </Button>
            </div>
            <div className="p-6">
              <form onSubmit={submitEdit}>
                <div className="mb-5">
                  <FilterDropdown
                    id="edit-country"
                    label="Country"
                    ariaLabel="Select country"
                    value={editCountry}
                    options={SUGGESTION_COUNTRIES}
                    onChange={setEditCountry}
                    searchable
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="edit-name">Group Name</label>
                  <input
                    id="edit-name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g., Bristol, Edinburgh"
                  />
                </div>
                <div className="pt-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setEditGroup(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={editSubmitting || !editCountry || !editName.trim()}
                  >
                    {editSubmitting ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Review Suggestion Modal */}
      {reviewSuggestion && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewSuggestion(null)
          }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">Review Suggestion</h2>
              <Button
                variant="ghost"
                icon
                onClick={() => setReviewSuggestion(null)}
                aria-label="Close"
              >
                ×
              </Button>
            </div>

            <div className="p-6">
              <p className="text-text-light mb-1 text-sm">
                Suggested by {reviewSuggestion.suggested_by.name}
              </p>
              <p className="font-semibold mb-5">
                {reviewSuggestion.country} — {reviewSuggestion.name}
              </p>

              <form onSubmit={submitReview}>
                <div className="mb-5">
                  <label>Action</label>
                  <div className="flex flex-col gap-3 mt-2">
                    {(
                      [
                        { value: 'accept', label: 'Accept', desc: 'Add as a new local group' },
                        { value: 'merge', label: 'Merge', desc: 'Link to an existing local group' },
                        { value: 'on_hold', label: 'On Hold', desc: 'Keep for later review' },
                        { value: 'decline', label: 'Decline', desc: 'Not adding at this time' },
                      ] as { value: ReviewAction; label: string; desc: string }[]
                    ).map((opt) => (
                      <Radio
                        key={opt.value}
                        name="action"
                        value={opt.value}
                        checked={reviewAction === opt.value}
                        onChange={() => setReviewAction(opt.value)}
                      >
                        <span>
                          <strong>{opt.label}</strong> — {opt.desc}
                        </span>
                      </Radio>
                    ))}
                  </div>
                </div>

                {reviewAction === 'accept' && (
                  <>
                    <div className="mb-4">
                      <label htmlFor="review-name">Group Name</label>
                      <input
                        id="review-name"
                        type="text"
                        value={reviewEditName}
                        onChange={(e) => setReviewEditName(e.target.value)}
                        placeholder="Group name"
                      />
                      <p className="text-sm text-text-light mt-1">
                        Adjust capitalisation or spelling if needed.
                      </p>
                    </div>
                    <div className="mb-5">
                      <label htmlFor="review-country">Country</label>
                      <input
                        id="review-country"
                        type="text"
                        value={reviewEditCountry}
                        onChange={(e) => setReviewEditCountry(e.target.value)}
                        placeholder="Country"
                      />
                    </div>
                  </>
                )}

                {reviewAction === 'merge' && (
                  <div className="mb-5">
                    <FilterDropdown
                      id="merge-target"
                      label="Merge into existing group"
                      ariaLabel="Select existing group to merge into"
                      value={mergeTargetId === '' ? '' : String(mergeTargetId)}
                      options={mergeOptions}
                      onChange={(v) => setMergeTargetId(v ? Number(v) : '')}
                      searchable
                    />
                  </div>
                )}

                {(reviewAction === 'on_hold' || reviewAction === 'decline') && (
                  <div className="mb-5">
                    <label htmlFor="admin-notes">
                      Note for volunteer{' '}
                      <span className="text-text-light font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="admin-notes"
                      rows={3}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder={{
                        on_hold: "e.g., We're looking into existing groups in this area first…",
                        decline: "e.g., Thanks for the suggestion. This area isn't something we're able to support at the moment.",
                      }[reviewAction] ?? ''}
                      style={{ width: '100%' }}
                    />
                    <p className="text-sm text-text-light mt-1">
                      This note will be shared with the volunteer.
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setReviewSuggestion(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      reviewSubmitting ||
                      (reviewAction === 'accept' &&
                        (!reviewEditName.trim() || !reviewEditCountry.trim())) ||
                      (reviewAction === 'merge' && !mergeTargetId)
                    }
                    variant={reviewAction === 'decline' ? 'danger' : 'primary'}
                  >
                    {reviewSubmitting ? 'Saving…' : 'Confirm'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null)
          }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-md w-full">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">Confirm Delete</h2>
              <Button variant="ghost" icon onClick={() => setDeleteTarget(null)} aria-label="Close">
                ×
              </Button>
            </div>
            <div className="p-6">
              <p>
                Delete <strong>{deleteTarget.country} — {deleteTarget.name}</strong>? This cannot be undone.
              </p>
              {deleteTarget.kind === 'group' && (
                loadingDeleteProjects ? (
                  <p className="text-sm text-text-light">Checking affected projects…</p>
                ) : deleteTargetProjects.length > 0 ? (
                  <div className="mt-3 mb-1">
                    <p className="text-sm font-medium mb-2">
                      The following projects will have their local group removed:
                    </p>
                    <ul className="text-sm space-y-1 pl-4 list-disc">
                      {deleteTargetProjects.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/projects/${p.id}`}
                            className="text-secondary-dark no-underline hover:text-primary"
                            target="_blank"
                          >
                            {p.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              )}
              <div className="pt-4 border-t border-brand-border flex gap-3 justify-end mt-4">
                <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={deleteItem}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
