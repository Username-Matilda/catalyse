'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRequireApproved } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge, type BadgeVariant } from '@/components/Badge'
import Button from '@/components/Button'
import CommentThread from '@/components/CommentThread'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { formatDate } from '@/lib/format-date'
import { QuickTaskStatus, TaskStatus } from '@/generated/prisma/enums'

interface Skill {
  id: number
  name: string
  categoryName: string
}

interface AdminQuickTask {
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
  estimatedHours: number | null
  createdAt: string
}

interface Volunteer {
  id: number
  name: string
}

interface FeaturedProjectTask {
  id: number
  projectId: number
  projectTitle: string | null
  title: string
  status: string
  assignedToId: number | null
  assignedToName: string | null
  estimatedHours: number | null
  createdAt: string
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  open: 'warning',
  in_progress: 'info',
  under_review: 'caution',
  completed: 'success',
}

// Project tasks use TaskStatus (open/in_progress/completed), not QuickTaskStatus —
// no under_review here, since submitting for review is a quick-task-only concept.
const PROJECT_TASK_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  open: 'warning',
  in_progress: 'info',
  completed: 'success',
}

const RATING_CLASSES: Record<string, string> = {
  excellent: 'text-success',
  good: 'text-secondary',
  needs_improvement: 'text-error',
}

const RATING_LABELS: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_improvement: 'Needs improvement',
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'Assigned',
  under_review: 'Submitted — awaiting review',
  completed: 'Completed',
}

export default function QuickTasksPage() {
  const { user, loading } = useRequireApproved()

  if (loading || !user) return null

  return user.isAdmin ? <AdminQuickTasksView /> : <VolunteerQuickTasksView />
}

function VolunteerQuickTasksView() {
  const { user } = useRequireApproved()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    ...orpc.my.quickTasks.queryOptions(),
    enabled: !!user,
  })

  const { data: availableTasks = [], isLoading: loadingAvailable } = useQuery({
    ...orpc.quickTasks.available.queryOptions(),
    enabled: !!user,
  })

  const submitMutation = useMutation({
    ...orpc.quickTasks.submit.mutationOptions(),
    onSuccess: () => {
      showToast('Task submitted for review!', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.my.quickTasks.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to submit task', 'error')
    },
  })

  const invalidateAvailable = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.available.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.my.quickTasks.key() })
  }

  const claimQuickMutation = useMutation({
    ...orpc.quickTasks.claim.mutationOptions(),
    onSuccess: () => {
      showToast('Task claimed!', 'success')
      invalidateAvailable()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to claim task', 'error'),
  })

  // A claimed project task doesn't join "My Quick Tasks" below — that list is quick
  // tasks only — so send the volunteer to the task itself rather than leaving them on a
  // page where the thing they just claimed has silently vanished.
  const claimProjectTaskMutation = useMutation({
    ...orpc.projects.updateTask.mutationOptions(),
    onSuccess: (_data, variables) => {
      showToast('Task claimed!', 'success')
      invalidateAvailable()
      router.push(`/projects/${variables.projectId}/tasks/${variables.taskId}`)
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to claim task', 'error'),
  })

  if (!user) return null

  return (
    <>
      <main className="container py-5 pb-15">
        <h1>My Quick Tasks</h1>
        <p className="text-text-light mb-6">
          Small, self-contained tasks to help you get started and demonstrate your skills.
        </p>

        {loadingTasks ? (
          <div className="text-center py-10 text-text-light">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
            <h3>No tasks assigned yet</h3>
            <p className="text-text-light">
              Check back soon, or browse <Link href="/projects">projects</Link> to find other ways
              to contribute.
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              id={`task-${task.id}`}
              role="article"
              className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="m-0">
                  <Link href={`/quick-tasks/${task.id}`}>{task.title}</Link>
                </h3>
                <Badge
                  role="status"
                  variant={task.status === QuickTaskStatus.completed ? 'success' : 'warning'}
                >
                  {STATUS_LABELS[task.status] ?? task.status}
                </Badge>
              </div>

              <div className="flex gap-2 mb-3 flex-wrap">
                {task.skillName && (
                  <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-gray-700 dark:text-gray-300">
                    {task.skillName}
                  </span>
                )}
                {task.estimatedHours && (
                  <span className="text-text-light text-sm">~{task.estimatedHours}h</span>
                )}
                {task.projectTitle && (
                  <span className="text-text-light text-sm">Related: {task.projectTitle}</span>
                )}
              </div>

              <p className="whitespace-pre-wrap mb-4">{task.description}</p>

              {task.status === QuickTaskStatus.in_progress && (
                <Button
                  onClick={() => submitMutation.mutate({ id: task.id })}
                  disabled={submitMutation.isPending && submitMutation.variables?.id === task.id}
                >
                  {submitMutation.isPending && submitMutation.variables?.id === task.id
                    ? 'Submitting…'
                    : 'Mark as Complete'}
                </Button>
              )}
            </div>
          ))
        )}

        <h2 className="mt-8">Browse Quick Tasks</h2>
        <p className="text-text-light mb-6">
          Open tasks anyone approved can pick up right now — no need to browse projects first.
        </p>

        {loadingAvailable ? (
          <div className="text-center py-10 text-text-light">Loading tasks…</div>
        ) : availableTasks.length === 0 ? (
          <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
            <h3>No open Quick Tasks right now</h3>
            <p className="text-text-light">Check back soon.</p>
          </div>
        ) : (
          availableTasks.map((task) =>
            task.kind === 'quick' ? (
              <div
                key={`quick-${task.id}`}
                role="article"
                className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              >
                <h3 className="m-0 mb-2">
                  <Link href={`/quick-tasks/${task.id}`}>{task.title}</Link>
                </h3>
                <div className="flex gap-2 mb-3 flex-wrap">
                  {task.skillName && (
                    <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-gray-700 dark:text-gray-300">
                      {task.skillName}
                    </span>
                  )}
                  {task.estimatedHours !== null && (
                    <span className="text-text-light text-sm">~{task.estimatedHours}h</span>
                  )}
                </div>
                {task.description && <p className="whitespace-pre-wrap mb-4">{task.description}</p>}
                <Button
                  onClick={() => claimQuickMutation.mutate({ id: task.id })}
                  disabled={
                    claimQuickMutation.isPending && claimQuickMutation.variables?.id === task.id
                  }
                >
                  {claimQuickMutation.isPending && claimQuickMutation.variables?.id === task.id
                    ? 'Claiming…'
                    : 'Claim'}
                </Button>
              </div>
            ) : (
              <div
                key={`project-task-${task.id}`}
                role="article"
                className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              >
                <h3 className="m-0 mb-2">
                  <Link href={`/projects/${task.projectId}/tasks/${task.id}`}>{task.title}</Link>
                </h3>
                <div className="flex gap-2 mb-3 flex-wrap items-center">
                  {task.estimatedHours !== null && (
                    <span className="text-text-light text-sm">~{task.estimatedHours}h</span>
                  )}
                  {task.projectTitle && (
                    <span className="text-text-light text-sm">
                      Part of Project:{' '}
                      <Link href={`/projects/${task.projectId}`} className="underline">
                        {task.projectTitle}
                      </Link>
                    </span>
                  )}
                </div>
                {task.description && <p className="whitespace-pre-wrap mb-4">{task.description}</p>}
                <Button
                  onClick={() =>
                    claimProjectTaskMutation.mutate({
                      projectId: task.projectId,
                      taskId: task.id,
                      data: { status: TaskStatus.in_progress, assigneeId: user.id },
                    })
                  }
                  disabled={
                    claimProjectTaskMutation.isPending &&
                    claimProjectTaskMutation.variables?.taskId === task.id
                  }
                >
                  {claimProjectTaskMutation.isPending &&
                  claimProjectTaskMutation.variables?.taskId === task.id
                    ? 'Claiming…'
                    : 'Claim'}
                </Button>
              </div>
            ),
          )
        )}
      </main>
    </>
  )
}

function AdminQuickTasksView() {
  const { user } = useRequireApproved()
  const queryClient = useQueryClient()
  const {
    value: statusFilter,
    onChange: setStatusFilter,
    options: statusFilterOptions,
  } = useFilterOptions(
    [
      { value: '', label: 'All' },
      { value: 'open', label: 'Open' },
      { value: 'in_progress', label: 'In progress' },
      { value: 'under_review', label: 'Submitted (needs review)' },
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
  const [editModal, setEditModal] = useState<AdminQuickTask | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSkillId, setEditSkillId] = useState('')
  const [editHours, setEditHours] = useState('')

  // Assign — inline dropdown per task, matching the project-task assign pattern
  const [taskAssignSelections, setTaskAssignSelections] = useState<Record<number, string>>({})

  // Review modal
  const [reviewModal, setReviewModal] = useState<AdminQuickTask | null>(null)
  const [reviewRating, setReviewRating] = useState<'excellent' | 'good' | 'needs_improvement'>(
    'good',
  )
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  const { data: tasksRaw = [], isPending: loadingData } = useQuery({
    ...orpc.quickTasks.list.queryOptions({
      input: statusFilter ? { status: statusFilter as QuickTaskStatus } : {},
    }),
    enabled: !!user?.isAdmin,
  })
  const tasks = tasksRaw as unknown as AdminQuickTask[]

  const { data: featuredProjectTasksRaw = [] } = useQuery({
    ...orpc.quickTasks.featuredProjectTasks.queryOptions(),
    enabled: !!user?.isAdmin,
  })
  const featuredProjectTasks = featuredProjectTasksRaw as unknown as FeaturedProjectTask[]

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
    ...orpc.quickTasks.create.mutationOptions(),
    onSuccess: () => {
      toast('Task created!', 'success')
      setShowCreate(false)
      setCreateTitle('')
      setCreateDesc('')
      setCreateSkillId('')
      setCreateHours('')
      void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to create task', 'error'),
  })

  const editTaskMutation = useMutation({
    ...orpc.quickTasks.update.mutationOptions(),
    onSuccess: () => {
      toast('Task updated!', 'success')
      setEditModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to update task', 'error'),
  })

  const assignTaskMutation = useMutation({
    ...orpc.quickTasks.assign.mutationOptions(),
    onSuccess: (_data, variables) => {
      toast('Task assigned!', 'success')
      setTaskAssignSelections((s) => {
        const next = { ...s }
        delete next[variables.id]
        return next
      })
      void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to assign', 'error'),
  })

  const unassignTaskMutation = useMutation({
    ...orpc.quickTasks.unassign.mutationOptions(),
    onSuccess: () => {
      toast('Assignee removed', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to unassign', 'error'),
  })

  const deleteTaskMutation = useMutation({
    ...orpc.quickTasks.delete.mutationOptions(),
    onSuccess: () => {
      toast('Task deleted', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to delete task', 'error'),
  })

  const reviewTaskMutation = useMutation({
    ...orpc.quickTasks.review.mutationOptions(),
    onSuccess: () => {
      toast('Task reviewed!', 'success')
      setReviewModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.list.key() })
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : 'Failed to review', 'error'),
  })

  function openEdit(task: AdminQuickTask) {
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

  function handleAssignTask(taskId: number) {
    const selected = taskAssignSelections[taskId]
    if (!selected) return
    assignTaskMutation.mutate({ id: taskId, volunteerId: parseInt(selected, 10) })
  }

  function handleUnassignTask(taskId: number) {
    unassignTaskMutation.mutate({ id: taskId })
  }

  function deleteTask(task: AdminQuickTask) {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return
    deleteTaskMutation.mutate({ id: task.id })
  }

  async function copyLink(taskId: number) {
    const url = `${window.location.origin}/quick-tasks/${taskId}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied!', 'success')
    } catch {
      toast('Could not copy the link', 'error')
    }
  }

  function reviewTask(e: React.FormEvent) {
    e.preventDefault()
    if (!reviewModal) return
    reviewTaskMutation.mutate({
      id: reviewModal.id,
      reviewRating,
      comment: reviewFeedback || null,
      reviewNotes: reviewNotes || null,
    })
  }

  if (!user) return null

  return (
    <>
      <main className="container py-5 pb-15">
        <div className="flex justify-between items-center mb-3">
          <h1>Quick Tasks</h1>
          <Button onClick={() => setShowCreate(true)}>Create Task</Button>
        </div>

        <p className="text-text-light mb-6">
          Small, scoped tasks to verify volunteer skills before assigning bigger projects.
        </p>

        <div className="mb-6 max-w-[240px]">
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
                  className={`card-header flex justify-between items-start gap-3 min-w-0 cursor-pointer ${expanded ? 'mb-3' : 'mb-0'}`}
                  onClick={() => toggleCard(task.id)}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className="inline-block transition-transform shrink-0 mt-1 text-text-light text-xs"
                      // dynamic: transform rotates based on expanded state
                      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▶
                    </span>
                    <div className="min-w-0">
                      <h3 className="mb-1">{task.title}</h3>
                      <div className="text-text-light flex gap-2 flex-wrap text-[0.8rem]">
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
                          <span className={RATING_CLASSES[task.reviewRating]}>
                            {RATING_LABELS[task.reviewRating]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge
                    role="status"
                    variant={STATUS_VARIANTS[task.status] ?? 'neutral'}
                    className="whitespace-nowrap shrink-0"
                  >
                    {task.status}
                  </Badge>
                </div>

                {expanded && (
                  <>
                    <p className="whitespace-pre-wrap mb-3 text-[0.9rem]">{task.description}</p>

                    {task.reviewRating && (
                      <p className={`mb-2 font-medium ${RATING_CLASSES[task.reviewRating]}`}>
                        Rating: {RATING_LABELS[task.reviewRating]}
                      </p>
                    )}
                    {task.reviewNotes && (
                      <p className="text-sm text-text-light mb-2">Notes: {task.reviewNotes}</p>
                    )}

                    <div className="mb-3">
                      <strong className="text-sm">Comments</strong>
                      <CommentThread workItemId={task.id} />
                    </div>

                    {task.status === QuickTaskStatus.open && (
                      <div
                        className="flex gap-2 items-end mb-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex-1 max-w-75">
                          <FilterDropdown
                            id={`assign-task-${task.id}`}
                            label="Assign to"
                            ariaLabel={`Assign volunteer to ${task.title}`}
                            value={taskAssignSelections[task.id] ?? ''}
                            options={[
                              { value: '', label: 'Select volunteer…' },
                              ...volunteers.map((v) => ({ value: String(v.id), label: v.name })),
                            ]}
                            onChange={(v) =>
                              setTaskAssignSelections((s) => ({ ...s, [task.id]: v }))
                            }
                            searchable
                          />
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!taskAssignSelections[task.id] || assignTaskMutation.isPending}
                          onClick={() => handleAssignTask(task.id)}
                        >
                          Assign
                        </Button>
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-brand-border">
                      <span className="text-sm text-text-light">
                        Created {formatDate(task.createdAt)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            void copyLink(task.id)
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
                        {task.assignedToId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={unassignTaskMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnassignTask(task.id)
                            }}
                          >
                            Unassign
                          </Button>
                        )}
                        {task.status === QuickTaskStatus.under_review && (
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

        {featuredProjectTasks.length > 0 && (
          <>
            <h2 className="mt-8">Featured project tasks</h2>
            <p className="text-text-light mb-6">
              Project tasks flagged to also appear on this page for volunteers. Manage them (edit,
              assign, unassign) from their own project — this list is for visibility only.
            </p>
            {featuredProjectTasks.map((task) => (
              <div
                key={`project-task-${task.id}`}
                role="article"
                className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              >
                <div className="flex justify-between items-start gap-3 min-w-0 mb-2">
                  <div className="min-w-0">
                    <h3 className="mb-1">
                      <Link href={`/projects/${task.projectId}/tasks/${task.id}`}>
                        {task.title}
                      </Link>
                    </h3>
                    <div className="text-text-light flex gap-2 flex-wrap text-[0.8rem]">
                      {task.projectTitle && (
                        <span>
                          Part of:{' '}
                          <Link href={`/projects/${task.projectId}`}>{task.projectTitle}</Link>
                        </span>
                      )}
                      {task.estimatedHours !== null && <span>~{task.estimatedHours}h</span>}
                      {task.assignedToId && task.assignedToName && (
                        <span>
                          Assigned to:{' '}
                          <Link href={`/admin/volunteers/${task.assignedToId}`}>
                            {task.assignedToName}
                          </Link>
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    role="status"
                    variant={PROJECT_TASK_STATUS_VARIANTS[task.status] ?? 'neutral'}
                    className="whitespace-nowrap shrink-0"
                  >
                    {task.status}
                  </Badge>
                </div>
              </div>
            ))}
          </>
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
                <div className="grid grid-cols-2 gap-4 mb-5">
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
                <div className="grid grid-cols-2 gap-4 mb-5">
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
              <h3 className="mb-1">{reviewModal.title}</h3>
              {reviewModal.assignedToName && (
                <p className="text-text-light mb-4">Submitted by: {reviewModal.assignedToName}</p>
              )}
              <form onSubmit={reviewTask}>
                <div className="mb-5">
                  <label>Rating</label>
                  <div className="flex flex-col gap-2 mt-2">
                    {(['excellent', 'good', 'needs_improvement'] as const).map((r) => (
                      <label key={r} className="flex items-center gap-2 cursor-pointer">
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
    </>
  )
}
