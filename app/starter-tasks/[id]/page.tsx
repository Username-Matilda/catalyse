'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRequireApproved } from '@/lib/hooks/auth'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import Button from '@/components/Button'
import { Badge } from '@/components/Badge'
import CommentThread from '@/components/CommentThread'
import { STARTER_TASK_STATUS_LABELS } from '@/components/ProjectCard'
import { StarterTaskStatus } from '@/generated/prisma/enums'

const REVIEW_RATING_LABELS: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_improvement: 'Needs Improvement',
  unsatisfactory: 'Unsatisfactory',
}

function statusVariant(status: string) {
  if (status === StarterTaskStatus.completed) return 'success'
  if (status === StarterTaskStatus.under_review) return 'warning'
  return 'neutral'
}

export default function StarterTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = parseInt(idStr, 10)
  const { user, loading } = useRequireApproved()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const { data: task, isLoading } = useQuery({
    ...orpc.starterTasks.get.queryOptions({ input: { id } }),
    enabled: !!user && !isNaN(id),
  })

  const submitMutation = useMutation({
    ...orpc.starterTasks.submit.mutationOptions(),
    onSuccess: () => {
      showToast('Task submitted for review!', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.get.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.my.starterTasks.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to submit task', 'error')
    },
  })

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
        <Link href="/starter-tasks">
          <Button variant="secondary" size="sm">
            Back to My Tasks
          </Button>
        </Link>
      </main>
    )
  }

  return (
    <main className="container py-5 pb-15">
      <Link href="/starter-tasks" className="text-sm text-primary-text underline block mb-4">
        ← Back to My Tasks
      </Link>

      <div className="bg-surface rounded-xl shadow p-6 overflow-hidden wrap-break-word">
        <div className="flex justify-between items-start mb-3 gap-4">
          <h1 className="m-0">{task.title}</h1>
          <Badge variant={statusVariant(task.status)}>
            {STARTER_TASK_STATUS_LABELS[task.status] ?? task.status}
          </Badge>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          {task.skillName && (
            <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-gray-700 dark:text-gray-300">
              {task.skillName}
            </span>
          )}
          {task.estimatedHours && (
            <span className="text-text-light text-sm self-center">
              ~{task.estimatedHours}h estimated
            </span>
          )}
          {task.projectTitle && task.projectId && (
            <Link href={`/projects/${task.projectId}`} className="text-sm self-center">
              Related project: {task.projectTitle}
            </Link>
          )}
        </div>

        {task.description && <p className="whitespace-pre-wrap mb-6">{task.description}</p>}

        {task.status === StarterTaskStatus.completed && (
          <div className="bg-brand-bg rounded-lg p-4 mb-4 border border-brand-border">
            <h3 className="m-0 mb-2 text-base">Review</h3>
            {task.reviewRating && (
              <p className="mb-1">
                <span className="font-medium">Rating: </span>
                {REVIEW_RATING_LABELS[task.reviewRating] ?? task.reviewRating}
              </p>
            )}
            {task.reviewNotes && <p className="mb-0 text-text-light">{task.reviewNotes}</p>}
          </div>
        )}

        {task.status === StarterTaskStatus.in_progress && (
          <Button
            onClick={() => submitMutation.mutate({ id: task.id })}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? 'Submitting…' : 'Mark as Complete'}
          </Button>
        )}

        {task.status === StarterTaskStatus.under_review && (
          <p className="text-text-light text-sm">Your submission is awaiting review.</p>
        )}
      </div>

      <div className="bg-surface rounded-xl shadow p-6">
        <h2 className="text-lg mb-4">Comments</h2>
        <CommentThread workItemId={task.id} />
      </div>
    </main>
  )
}
