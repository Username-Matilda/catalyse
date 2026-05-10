// TODO: review the full starter tasks workflow end-to-end — how tasks are created/assigned by admins,
// how volunteers see and submit them (app/starter-tasks/page.tsx), and how admins review submissions
// here. Check the rating/notes fields, status transitions, and what feedback is shown to volunteers.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface Skill {
  id: number
  name: string
  category_name: string
}

interface StarterTask {
  id: number
  title: string
  description: string
  skill_id: number | null
  skill_name: string | null
  project_title: string | null
  assigned_to_id: number | null
  assigned_to_name: string | null
  status: string
  review_rating: string | null
  review_notes: string | null
  feedback_to_volunteer: string | null
  estimated_hours: number | null
  created_at: string
}

interface Volunteer {
  id: number
  name: string
}

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  open: { background: '#FED7AA', color: '#9A3412' },
  assigned: { background: '#DBEAFE', color: '#1E40AF' },
  submitted: { background: '#FEF3C7', color: '#92400E' },
  reviewed: { background: '#E9D5FF', color: '#6B21A8' },
  completed: { background: '#D1FAE5', color: '#065F46' },
}

const RATING_COLORS: Record<string, string> = {
  excellent: 'var(--success, #059669)',
  good: 'var(--secondary, #1D3557)',
  needs_improvement: 'var(--error, #DC2626)',
}

const RATING_LABELS: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_improvement: 'Needs improvement',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function AdminStarterTasksPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [tasks, setTasks] = useState<StarterTask[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createSkillId, setCreateSkillId] = useState('')
  const [createHours, setCreateHours] = useState('')

  // Edit modal
  const [editModal, setEditModal] = useState<StarterTask | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSkillId, setEditSkillId] = useState('')
  const [editHours, setEditHours] = useState('')

  // Assign modal
  const [assignModal, setAssignModal] = useState<StarterTask | null>(null)
  const [assignVolunteerId, setAssignVolunteerId] = useState('')

  // Review modal
  const [reviewModal, setReviewModal] = useState<StarterTask | null>(null)
  const [reviewRating, setReviewRating] = useState<'excellent' | 'good' | 'needs_improvement'>(
    'good',
  )
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  const loadAll = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const [t, s, v] = await Promise.all([
        apiRequest<StarterTask[]>(`/api/starter-tasks${params}`),
        apiRequest<Skill[]>('/api/skills/flat'),
        apiRequest<{ volunteers: Volunteer[] }>('/api/volunteers'),
      ])
      setTasks(t)
      setSkills(s)
      setVolunteers(v.volunteers)
    } catch {
      toast('Failed to load data', 'error')
    } finally {
      setLoadingData(false)
    }
  }, [statusFilter, toast])

  useEffect(() => {
    if (!user?.is_admin) return
    // False positive: setState calls inside loadAll are in async callbacks, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [user, loadAll])

  function toggleCard(id: number) {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openEdit(task: StarterTask) {
    setEditModal(task)
    setEditTitle(task.title)
    setEditDesc(task.description)
    setEditSkillId(task.skill_id ? String(task.skill_id) : '')
    setEditHours(task.estimated_hours ? String(task.estimated_hours) : '')
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest('/api/starter-tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDesc.trim(),
          skill_id: createSkillId ? parseInt(createSkillId) : null,
          estimated_hours: createHours ? parseFloat(createHours) : null,
        }),
      })
      toast('Task created!', 'success')
      setCreateTitle('')
      setCreateDesc('')
      setCreateSkillId('')
      setCreateHours('')
      setShowCreate(false)
      await loadAll()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to create task', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function editTask(e: React.FormEvent) {
    e.preventDefault()
    if (!editModal) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/starter-tasks/${editModal.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim(),
          skill_id: editSkillId ? parseInt(editSkillId) : null,
          estimated_hours: editHours ? parseFloat(editHours) : null,
        }),
      })
      toast('Task updated!', 'success')
      setEditModal(null)
      await loadAll()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update task', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function assignTask(e: React.FormEvent) {
    e.preventDefault()
    if (!assignModal) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/starter-tasks/${assignModal.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ volunteer_id: parseInt(assignVolunteerId) }),
      })
      toast('Task assigned!', 'success')
      setAssignModal(null)
      await loadAll()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to assign', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function unassignTask(taskId: number) {
    try {
      await apiRequest(`/api/starter-tasks/${taskId}/unassign`, { method: 'POST' })
      toast('Assignee removed', 'success')
      await loadAll()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to unassign', 'error')
    }
  }

  async function reviewTask(e: React.FormEvent) {
    e.preventDefault()
    if (!reviewModal) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/starter-tasks/${reviewModal.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          review_rating: reviewRating,
          feedback_to_volunteer: reviewFeedback || null,
          review_notes: reviewNotes || null,
        }),
      })
      toast('Task reviewed!', 'success')
      setReviewModal(null)
      await loadAll()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to review', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-350 w-full mx-auto px-6 py-5 pb-15">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h1>Starter Tasks</h1>
          <Button onClick={() => setShowCreate(true)}>Create Task</Button>
        </div>

        <p className="text-text-light mb-6">
          Small, scoped tasks to verify volunteer skills before assigning bigger projects.
        </p>

        <div className="mb-6" style={{ maxWidth: 240 }}>
          <FilterDropdown
            id="status-filter"
            label="Status"
            ariaLabel="Status"
            value={statusFilter}
            options={[
              { value: '', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'submitted', label: 'Submitted (needs review)' },
              { value: 'reviewed', label: 'Reviewed' },
              { value: 'completed', label: 'Completed' },
            ]}
            onChange={(v) => setStatusFilter(v)}
          />
        </div>

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="bg-surface rounded-xl shadow p-6 text-center">
            <h3>No starter tasks</h3>
            <p className="text-text-light">
              Create one to verify a volunteer&apos;s skills before giving them a bigger project.
            </p>
          </div>
        ) : (
          /* [test hook] card, card-header classes used as test selectors */
          tasks.map((task) => {
            const expanded = expandedCards.has(task.id)
            return (
              <div
                key={task.id}
                className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              >
                <div
                  className="card-header flex justify-between items-start gap-3 min-w-0"
                  style={{ cursor: 'pointer', marginBottom: expanded ? 12 : 0 }}
                  onClick={() => toggleCard(task.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        transition: 'transform 0.2s',
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        flexShrink: 0,
                        marginTop: 4,
                        color: 'var(--text-light)',
                        fontSize: '0.75rem',
                      }}
                    >
                      ▶
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 4px' }}>{task.title}</h3>
                      <div
                        className="text-text-light"
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}
                      >
                        {task.skill_name && <span>Skill: {task.skill_name}</span>}
                        {task.estimated_hours != null && <span>~{task.estimated_hours}h</span>}
                        {task.assigned_to_id && task.assigned_to_name && (
                          <span>
                            Assigned to:{' '}
                            <Link
                              href={`/admin/volunteers/${task.assigned_to_id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {task.assigned_to_name}
                            </Link>
                          </span>
                        )}
                        {task.review_rating && (
                          <span style={{ color: RATING_COLORS[task.review_rating] }}>
                            {RATING_LABELS[task.review_rating]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* [test hook] status-badge class used as test selector */}
                  <span
                    className="status-badge"
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      ...STATUS_STYLES[task.status],
                    }}
                  >
                    {task.status}
                  </span>
                </div>

                {expanded && (
                  <>
                    <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 12px', fontSize: '0.9rem' }}>
                      {task.description}
                    </p>

                    {task.review_rating && (
                      <p
                        style={{
                          marginBottom: 8,
                          fontWeight: 500,
                          color: RATING_COLORS[task.review_rating],
                        }}
                      >
                        Rating: {RATING_LABELS[task.review_rating]}
                      </p>
                    )}
                    {task.review_notes && (
                      <p
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-light)',
                          marginBottom: 8,
                        }}
                      >
                        Notes: {task.review_notes}
                      </p>
                    )}
                    {task.feedback_to_volunteer && (
                      <div
                        style={{
                          background: 'var(--accent)',
                          borderRadius: 'var(--radius)',
                          padding: '10px 14px',
                          marginBottom: 12,
                          fontSize: '0.875rem',
                        }}
                      >
                        <strong>Feedback to volunteer:</strong> {task.feedback_to_volunteer}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                        Created {formatDate(task.created_at)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEdit(task)
                          }}
                        >
                          Edit
                        </Button>
                        {task.status === 'open' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setAssignModal(task)
                              setAssignVolunteerId('')
                            }}
                          >
                            Assign
                          </Button>
                        )}
                        {task.assigned_to_id &&
                          task.status !== 'open' &&
                          task.status !== 'completed' &&
                          task.status !== 'reviewed' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                unassignTask(task.id)
                              }}
                            >
                              Unassign
                            </Button>
                          )}
                        {task.status === 'submitted' && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setReviewModal(task)
                              setReviewRating('good')
                              setReviewFeedback('')
                              setReviewNotes('')
                            }}
                          >
                            Review
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </main>

      {/* Create Task Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false)
          }}
        >
          <div
            role="dialog"
            aria-labelledby="create-dialog-title"
            className="bg-surface rounded-xl shadow-lg max-w-150 w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 id="create-dialog-title">Create Starter Task</h2>
            </div>
            <div className="p-6">
              <form onSubmit={createTask}>
                <div className="mb-5">
                  <label htmlFor="ct-title">Title</label>
                  <input
                    id="ct-title"
                    type="text"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    required
                    autoFocus
                    placeholder="e.g., Draft 3 social media posts about AI safety"
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="ct-desc">Description</label>
                  <textarea
                    id="ct-desc"
                    rows={4}
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    required
                    placeholder="What should the volunteer do? Include any context, examples, or guidelines."
                  />
                </div>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
                  className="mb-5"
                >
                  <div>
                    <FilterDropdown
                      id="ct-skill"
                      label="Skill Being Tested"
                      ariaLabel="Skill Being Tested"
                      value={createSkillId}
                      options={[
                        { value: '', label: 'None specific' },
                        ...skills.map((s) => ({ value: String(s.id), label: `${s.name} (${s.category_name})` })),
                      ]}
                      onChange={(v) => setCreateSkillId(v)}
                      searchable
                    />
                  </div>
                  <div>
                    <label htmlFor="ct-hours">Estimated Hours</label>
                    <input
                      id="ct-hours"
                      type="number"
                      min="0.5"
                      max="20"
                      step="0.5"
                      value={createHours}
                      onChange={(e) => setCreateHours(e.target.value)}
                      placeholder="e.g., 2"
                    />
                  </div>
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create Task'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditModal(null)
          }}
        >
          <div
            role="dialog"
            aria-labelledby="edit-dialog-title"
            className="bg-surface rounded-xl shadow-lg max-w-150 w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 id="edit-dialog-title">Edit Starter Task</h2>
            </div>
            <div className="p-6">
              <form onSubmit={editTask}>
                <div className="mb-5">
                  <label htmlFor="et-title">Title</label>
                  <input
                    id="et-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="et-desc">Description</label>
                  <textarea
                    id="et-desc"
                    rows={4}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    required
                  />
                </div>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
                  className="mb-5"
                >
                  <div>
                    <FilterDropdown
                      id="et-skill"
                      label="Skill Being Tested"
                      ariaLabel="Skill Being Tested"
                      value={editSkillId}
                      options={[
                        { value: '', label: 'None specific' },
                        ...skills.map((s) => ({ value: String(s.id), label: `${s.name} (${s.category_name})` })),
                      ]}
                      onChange={(v) => setEditSkillId(v)}
                      searchable
                    />
                  </div>
                  <div>
                    <label htmlFor="et-hours">Estimated Hours</label>
                    <input
                      id="et-hours"
                      type="number"
                      min="0.5"
                      max="20"
                      step="0.5"
                      value={editHours}
                      onChange={(e) => setEditHours(e.target.value)}
                    />
                  </div>
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setEditModal(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Assign Task Modal */}
      {assignModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAssignModal(null)
          }}
        >
          <div
            role="dialog"
            aria-labelledby="assign-dialog-title"
            className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 id="assign-dialog-title">Assign Task</h2>
            </div>
            <div className="p-6">
              <p className="text-text-light mb-4">{assignModal.title}</p>
              <form onSubmit={assignTask}>
                <div className="mb-5">
                  <FilterDropdown
                    id="assign-vol"
                    label="Volunteer"
                    ariaLabel="Volunteer"
                    value={assignVolunteerId}
                    options={[
                      { value: '', label: 'Select volunteer…' },
                      ...volunteers.map((v) => ({ value: String(v.id), label: v.name })),
                    ]}
                    onChange={(v) => setAssignVolunteerId(v)}
                    searchable
                  />
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setAssignModal(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    Assign
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Review Task Modal */}
      {reviewModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewModal(null)
          }}
        >
          <div
            role="dialog"
            aria-labelledby="review-dialog-title"
            className="bg-surface rounded-xl shadow-lg max-w-150 w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 id="review-dialog-title">Review Task</h2>
            </div>
            <div className="p-6">
              <h3 style={{ marginBottom: 4 }}>{reviewModal.title}</h3>
              {reviewModal.assigned_to_name && (
                <p className="text-text-light mb-4">Submitted by: {reviewModal.assigned_to_name}</p>
              )}
              <form onSubmit={reviewTask}>
                <div className="mb-5">
                  <label>Rating</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {(['excellent', 'good', 'needs_improvement'] as const).map((r) => (
                      <label
                        key={r}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      >
                        <input
                          type="radio"
                          value={r}
                          checked={reviewRating === r}
                          onChange={() => setReviewRating(r)}
                        />
                        <span>
                          <strong>{RATING_LABELS[r]}</strong>
                          {r === 'excellent'
                            ? ' — Exceeded expectations'
                            : r === 'good'
                              ? ' — Met expectations'
                              : ' — Not quite there yet'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mb-5">
                  <label htmlFor="rv-notes">Internal Notes (admin only)</label>
                  <textarea
                    id="rv-notes"
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Your assessment…"
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="rv-feedback">{"Feedback to Volunteer (they'll see this)"}</label>
                  <textarea
                    id="rv-feedback"
                    rows={3}
                    value={reviewFeedback}
                    onChange={(e) => setReviewFeedback(e.target.value)}
                    placeholder="Constructive feedback…"
                  />
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setReviewModal(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    Submit Review
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
