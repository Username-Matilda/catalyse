'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRequireApproved } from '@/lib/hooks/auth'
import { orpc } from '@/lib/orpc'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import { Badge } from '@/components/Badge'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/lib/toast'
import { formatDate } from '@/lib/format-date'
import { TaskStatus } from '@/generated/prisma/enums'

const TASK_STATUS_LABELS: Record<string, string> = {
  [TaskStatus.open]: 'Open',
  [TaskStatus.in_progress]: 'In Progress',
  [TaskStatus.completed]: 'Completed',
}

function statusVariant(status: string) {
  if (status === TaskStatus.completed) return 'success'
  if (status === TaskStatus.in_progress) return 'warning'
  return 'neutral'
}

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>
}) {
  const { id: projectIdStr, taskId: taskIdStr } = use(params)
  const projectId = parseInt(projectIdStr, 10)
  const taskId = parseInt(taskIdStr, 10)
  const { user, loading } = useRequireApproved()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const { data: task, isLoading } = useQuery({
    ...orpc.projects.getTask.queryOptions({ input: { projectId, taskId } }),
    enabled: !!user && !isNaN(projectId) && !isNaN(taskId),
  })

  const canEdit = !!user && !!task && (user.isAdmin || task.projectOwnerId === user.id)

  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editEstimatedHours, setEditEstimatedHours] = useState('')
  const [editDeadline, setEditDeadline] = useState('')
  const [editFeatured, setEditFeatured] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!task || initialized) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true)
    setEditTitle(task.title)
    setEditDescription(task.description ?? '')
    setEditEstimatedHours(task.estimatedHours !== null ? String(task.estimatedHours) : '')
    setEditDeadline(task.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : '')
    setEditFeatured(task.featuredAsQuickTask)
  }, [task, initialized])

  const updateMutation = useMutation({
    ...orpc.projects.updateTask.mutationOptions(),
    onSuccess: () => {
      showToast('Task updated!', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.projects.getTask.key() })
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to update task', 'error'),
  })

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTitle.trim()) return
    updateMutation.mutate({
      projectId,
      taskId,
      data: {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        estimatedHours: editEstimatedHours ? parseFloat(editEstimatedHours) : null,
        deadline: editDeadline ? new Date(editDeadline) : null,
        featuredAsQuickTask: editFeatured,
      },
    })
  }

  function handleClaimTask() {
    if (!user) return
    updateMutation.mutate({
      projectId,
      taskId,
      data: { status: TaskStatus.in_progress, assigneeId: user.id },
    })
  }

  if (loading || !user) return null

  if (isLoading) {
    return (
      <main className="container py-5">
        <div className="text-center py-10 text-text-light">Loading…</div>
      </main>
    )
  }

  if (!task) {
    return (
      <main className="container py-5">
        <p className="text-text-light">Task not found.</p>
        <Link href={`/projects/${projectIdStr}`}>
          <Button variant="secondary" size="sm">
            Back to Project
          </Button>
        </Link>
      </main>
    )
  }

  return (
    <main className="container py-5 pb-15">
      <Link
        href={`/projects/${projectId}`}
        className="text-sm text-primary-text underline block mb-4"
      >
        ← Back to {task.projectTitle}
      </Link>

      <div className="bg-surface rounded-xl shadow p-6 overflow-hidden wrap-break-word mb-5">
        <div className="flex justify-between items-start mb-3 gap-4">
          <h1 className="m-0">{task.title}</h1>
          <Badge variant={statusVariant(task.status)}>
            {TASK_STATUS_LABELS[task.status] ?? task.status}
          </Badge>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          {task.assignedToName && (
            <span className="text-text-light text-sm self-center">
              Assigned to {task.assignedToName}
            </span>
          )}
          {task.estimatedHours !== null && (
            <span className="text-text-light text-sm self-center">
              ~{task.estimatedHours}h estimated
            </span>
          )}
          {task.deadline && (
            <span className="text-text-light text-sm self-center">
              Due {formatDate(task.deadline)}
            </span>
          )}
        </div>

        {task.description && <p className="whitespace-pre-wrap mb-0">{task.description}</p>}

        {task.status === TaskStatus.open && task.canClaim && (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={updateMutation.isPending}
              onClick={handleClaimTask}
            >
              Claim
            </Button>
          </div>
        )}

        {canEdit && (
          <form
            onSubmit={handleSaveEdit}
            className="mt-5 pt-5 border-t border-brand-border max-w-xl"
          >
            <div className="mb-5">
              <label htmlFor="edit-task-title">Task title</label>
              <input
                id="edit-task-title"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>

            <div className="mb-5">
              <label htmlFor="edit-task-description">Description</label>
              <textarea
                id="edit-task-description"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional details…"
              />
            </div>

            <div className="flex gap-3 flex-wrap mb-5">
              <div>
                <label htmlFor="edit-task-hours">Estimated hours</label>
                <input
                  id="edit-task-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={editEstimatedHours}
                  onChange={(e) => setEditEstimatedHours(e.target.value)}
                  placeholder="e.g. 3"
                  className="w-30"
                />
              </div>
              <div>
                <label htmlFor="edit-task-deadline">Deadline</label>
                <input
                  id="edit-task-deadline"
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-5">
              <Checkbox checked={editFeatured} onChange={(e) => setEditFeatured(e.target.checked)}>
                Add this task to the Quick Tasks page so volunteers can find and claim it without
                first clicking into this project
              </Checkbox>
            </div>

            <Button type="submit" disabled={updateMutation.isPending || !editTitle.trim()}>
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </form>
        )}
      </div>

      <div className="bg-surface rounded-xl shadow p-6">
        <h2 className="text-lg mb-4">Comments</h2>
        <CommentThread workItemId={task.id} />
      </div>
    </main>
  )
}
