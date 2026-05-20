'use client'

import { useRequireAuth } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { StarterTaskStatus } from '@/generated/prisma/enums'

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  submitted: 'Submitted — awaiting review',
  completed: 'Completed',
  reviewed: 'Reviewed',
}

export default function StarterTasksPage() {
  const { user, loading } = useRequireAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    ...orpc.my.starterTasks.queryOptions(),
    enabled: !!user,
  })

  const submitMutation = useMutation({
    ...orpc.starterTasks.submit.mutationOptions(),
    onSuccess: () => {
      showToast('Task submitted for review!', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.my.starterTasks.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to submit task', 'error')
    },
  })

  if (loading || !user) return null

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
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
              Check back soon, or browse <Link href="/">projects</Link> to find other ways to
              contribute.
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              id={`task-${task.id}`}
              className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="m-0">{task.title}</h3>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${task.status === StarterTaskStatus.completed || task.status === StarterTaskStatus.reviewed ? 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]' : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]'}`}
                >
                  {STATUS_LABELS[task.status] ?? task.status}
                </span>
              </div>

              <div className="flex gap-2 mb-3 flex-wrap">
                {task.skillName && (
                  <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]">
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

              {task.feedbackToVolunteer && (
                <div className="bg-surface rounded-lg p-3 mb-3">
                  <strong className="text-sm">Feedback:</strong>
                  <p className="mt-1 italic text-text-light">
                    &ldquo;{task.feedbackToVolunteer}&rdquo;
                  </p>
                </div>
              )}

              {task.status === StarterTaskStatus.assigned && (
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
      </main>
    </>
  )
}
