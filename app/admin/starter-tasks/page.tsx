'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRequireAdmin } from '@/lib/hooks/auth'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { StarterTaskStatus } from '@/generated/prisma/enums'

interface Skill {
  id: number
  name: string
  categoryName: string
}

interface StarterTask {
  id: number
  title: string
  description: string
  skillId: number | null
  skillName: string | null
  projectTitle: string | null
  assignedToId: number | null
  assignedToName: string | null
  status: string
  reviewRating: string | null
  reviewNotes: string | null
  feedbackToVolunteer: string | null
  estimatedHours: number | null
  createdAt: string
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
  const { user, loading } = useRequireAdmin()
  const queryClient = useQueryClient()
  const {
    value: statusFilter,
    onChange: setStatusFilter,
    options: statusFilterOptions,
  } = useFilterOptions(
    [
      { value: '', label: 'All' },
      { value: 'open', label: 'Open' },
      { value: 'assigned', label: 'Assigned' },
      { value: 'submitted', label: 'Submitted (needs review)' },
      { value: 'reviewed', label: 'Reviewed' },
      { value: 'completed', label: 'Completed' },
    ],
    '',
  )
  const toast = useToast()
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())
  // useRef so the hash is captured client-side in a useEffect (useState initializer runs on server)
  const deepLinkHash = useRef('')

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

  const [unassignModal, setUnassignModal] = useState<StarterTask | null>(null)

  const { data: tasksRaw = [], isPending: loadingData } = useQuery({
    ...orpc.starterTasks.list.queryOptions({
      input: statusFilter ? { status: statusFilter } : {},
    }),
    enabled: !!user?.isAdmin,
  })
  const tasks = tasksRaw as unknown as StarterTask[]

  const { data: skillCats = [] } = useQuery({
    ...orpc.skills.list.queryOptions(),
    enabled: !!user?.isAdmin,
  })
  const skills: Skill[] = skillCats.flatMap((cat) =>
    cat.skills.map((s) => ({ ...s, categoryName: cat.name })),
  )

  const { data: volunteersData } = useQuery({
    ...orpc.volunteers.list.queryOptions({ input: { limit: 100 } }),
    enabled: !!user?.isAdmin,
  })
  const volunteers: Volunteer[] = (volunteersData?.volunteers ?? []) as Volunteer[]

  useEffect(() => {
    function expandFromHash(hash: string) {
      if (!hash.startsWith('#task-')) return
      const taskId = parseInt(hash.slice('#task-'.length), 10)
      if (isNaN(taskId)) return
      setExpandedCards((prev) => new Set(prev).add(taskId))
    }
    deepLinkHash.current = window.location.hash
    const onHashChange = () => {
      deepLinkHash.current = window.location.hash
      // Tasks are already loaded when a hashchange fires mid-session
      expandFromHash(deepLinkHash.current)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // When tasks first load, apply any hash that was present on initial page load
  useEffect(() => {
    const hash = deepLinkHash.current
    if (!hash.startsWith('#task-') || tasks.length === 0) return
    const taskId = parseInt(hash.slice('#task-'.length), 10)
    if (isNaN(taskId)) return
    setExpandedCards((prev) => new Set(prev).add(taskId))
  }, [tasks])

  function toggleCard(id: number) {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createTaskMutation = useMutation({
    ...orpc.starterTasks.create.mutationOptions(),
    onSuccess: () => {
      toast('Task created!', 'success')
      setShowCreate(false)
      setCreateTitle('')
      setCreateDesc('')
      setCreateSkillId('')
      setCreateHours('')
      void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to create task', 'error'),
  })

  const editTaskMutation = useMutation({
    ...orpc.starterTasks.update.mutationOptions(),
    onSuccess: () => {
      toast('Task updated!', 'success')
      setEditModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to update task', 'error'),
  })

  const assignTaskMutation = useMutation({
    ...orpc.starterTasks.assign.mutationOptions(),
    onSuccess: () => {
      toast('Task assigned!', 'success')
      setAssignModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to assign', 'error'),
  })

  const unassignTaskMutation = useMutation({
    ...orpc.starterTasks.unassign.mutationOptions(),
    onSuccess: () => {
      toast('Assignee removed', 'success')
      setUnassignModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to unassign', 'error'),
  })

  const deleteTaskMutation = useMutation({
    ...orpc.starterTasks.delete.mutationOptions(),
    onSuccess: () => {
      toast('Task deleted', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to delete task', 'error'),
  })

  const reviewTaskMutation = useMutation({
    ...orpc.starterTasks.review.mutationOptions(),
    onSuccess: () => {
      toast('Task reviewed!', 'success')
      setReviewModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to review', 'error'),
  })

  function openEdit(task: StarterTask) {
    setEditModal(task)
    setEditTitle(task.title)
    setEditDesc(task.description)
    setEditSkillId(task.skillId ? String(task.skillId) : '')
    setEditHours(task.estimatedHours ? String(task.estimatedHours) : '')
  }

  function createTask(e: React.FormEvent) {
    e.preventDefault()
    createTaskMutation.mutate({
      title: createTitle.trim(),
      description: createDesc.trim(),
      skillId: createSkillId ? parseInt(createSkillId) : null,
      estimatedHours: createHours ? parseFloat(createHours) : null,
    })
  }

  function editTask(e: React.FormEvent) {
    e.preventDefault()
    if (!editModal) return
    editTaskMutation.mutate({
      id: editModal.id,
      title: editTitle.trim(),
      description: editDesc.trim(),
      skillId: editSkillId ? parseInt(editSkillId) : null,
      estimatedHours: editHours ? parseFloat(editHours) : null,
    })
  }

  function assignTask(e: React.FormEvent) {
    e.preventDefault()
    if (!assignModal) return
    assignTaskMutation.mutate({
      id: assignModal.id,
      volunteerId: parseInt(assignVolunteerId),
    })
  }

  function unassignTask() {
    if (!unassignModal) return
    unassignTaskMutation.mutate({ id: unassignModal.id })
  }

  function deleteTask(task: StarterTask) {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return
    deleteTaskMutation.mutate({ id: task.id })
  }

  function copyLink(taskId: number) {
    const url = `${window.location.origin}/starter-tasks#task-${taskId}`
    navigator.clipboard.writeText(url)
    toast('Link copied!', 'success')
  }

  function reviewTask(e: React.FormEvent) {
    e.preventDefault()
    if (!reviewModal) return
    reviewTaskMutation.mutate({
      id: reviewModal.id,
      reviewRating,
      feedbackToVolunteer: reviewFeedback || null,
      reviewNotes: reviewNotes || null,
    })
  }

  if (loading || !user) return null

  return (
    <>
      <main className="max-w-350 w-full mx-auto px-6 py-5 pb-15">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h1>Quick Tasks</h1>
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
            options={statusFilterOptions}
            onChange={setStatusFilter}
          />
        </div>

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="bg-surface rounded-xl shadow p-6 text-center">
            <h3>No quick tasks</h3>
            <p className="text-text-light">
              Create one to verify a volunteer&apos;s skills before giving them a bigger project.
            </p>
          </div>
        ) : (
          tasks.map((task) => {
            const expanded = expandedCards.has(task.id)
            return (
              <div
                key={task.id}
                role="article"
                id={`task-${task.id}`}
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
                        {task.skillName && <span>Skill: {task.skillName}</span>}
                        {task.estimatedHours !== null && <span>~{task.estimatedHours}h</span>}
                        {task.assignedToId && task.assignedToName && (
                          <span>
                            Assigned to:{' '}
                            <Link
                              href={`/admin/volunteers/${task.assignedToId}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {task.assignedToName}
                            </Link>
                          </span>
                        )}
                        {task.reviewRating && (
                          <span style={{ color: RATING_COLORS[task.reviewRating] }}>
                            {RATING_LABELS[task.reviewRating]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span
                    role="status"
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

                    {task.reviewRating && (
                      <p
                        style={{
                          marginBottom: 8,
                          fontWeight: 500,
                          color: RATING_COLORS[task.reviewRating],
                        }}
                      >
                        Rating: {RATING_LABELS[task.reviewRating]}
                      </p>
                    )}
                    {task.reviewNotes && (
                      <p
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-light)',
                          marginBottom: 8,
                        }}
                      >
                        Notes: {task.reviewNotes}
                      </p>
                    )}
                    {task.feedbackToVolunteer && (
                      <div
                        style={{
                          background: 'var(--accent)',
                          borderRadius: 'var(--radius)',
                          padding: '10px 14px',
                          marginBottom: 12,
                          fontSize: '0.875rem',
                        }}
                      >
                        <strong>Feedback to volunteer:</strong> {task.feedbackToVolunteer}
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
                        Created {formatDate(task.createdAt)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            copyLink(task.id)
                          }}
                        >
                          Copy share link
                        </Button>
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
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteTask(task)
                          }}
                        >
                          Delete
                        </Button>
                        {task.status === StarterTaskStatus.open && (
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
                        {task.assignedToId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setUnassignModal(task)
                            }}
                          >
                            Unassign
                          </Button>
                        )}
                        {task.status === StarterTaskStatus.submitted && (
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
              <h2 id="create-dialog-title">Create Quick Task</h2>
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
                        ...skills.map((s) => ({
                          value: String(s.id),
                          label: `${s.name} (${s.categoryName})`,
                        })),
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
                  <Button type="submit" disabled={createTaskMutation.isPending}>
                    {createTaskMutation.isPending ? 'Creating…' : 'Create Task'}
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
              <h2 id="edit-dialog-title">Edit Quick Task</h2>
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
                        ...skills.map((s) => ({
                          value: String(s.id),
                          label: `${s.name} (${s.categoryName})`,
                        })),
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
                  <Button type="submit" disabled={editTaskMutation.isPending}>
                    {editTaskMutation.isPending ? 'Saving…' : 'Save Changes'}
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
                  <Button type="submit" disabled={assignTaskMutation.isPending}>
                    Assign
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Review Task Modal */}
      {reviewModal !== null && (
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
              {reviewModal.assignedToName && (
                <p className="text-text-light mb-4">Submitted by: {reviewModal.assignedToName}</p>
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
                  <Button type="submit" disabled={reviewTaskMutation.isPending}>
                    Submit Review
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Unassign Confirm Modal */}
      {unassignModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUnassignModal(null)
          }}
        >
          <div
            role="dialog"
            aria-labelledby="unassign-dialog-title"
            className="bg-surface rounded-xl shadow-lg max-w-125 w-full"
          >
            <div className="px-6 py-5 border-b border-brand-border">
              <h2 id="unassign-dialog-title">Unassign Volunteer?</h2>
            </div>
            <div className="p-6">
              <p className="text-text-light mb-6">
                Remove{' '}
                <Link href={`/admin/volunteers/${unassignModal.assignedToId}`}>
                  {unassignModal.assignedToName}
                </Link>{' '}
                from &ldquo;{unassignModal.title}&rdquo;? The task will return to open.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setUnassignModal(null)}>
                  Cancel
                </Button>
                <Button onClick={unassignTask} disabled={unassignTaskMutation.isPending}>
                  {unassignTaskMutation.isPending ? 'Removing…' : 'Unassign'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
