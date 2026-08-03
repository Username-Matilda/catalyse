'use client'

import { useRequireApproved } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import { Badge } from '@/components/Badge'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { StarterTaskStatus, TaskStatus } from '@/generated/prisma/enums'

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'Assigned',
  under_review: 'Submitted — awaiting review',
  completed: 'Completed',
}

export default function StarterTasksPage() {
  const { user, loading } = useRequireApproved()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    ...orpc.my.starterTasks.queryOptions(),
    enabled: !!user,
  })

  const { data: availableTasks = [], isLoading: loadingAvailable } = useQuery({
    ...orpc.starterTasks.available.queryOptions(),
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

  const invalidateAvailable = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.starterTasks.available.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.my.starterTasks.key() })
  }

  const claimStarterMutation = useMutation({
    ...orpc.starterTasks.claim.mutationOptions(),
    onSuccess: () => {
      showToast('Task claimed!', 'success')
      invalidateAvailable()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to claim task', 'error'),
  })

  // A claimed project task doesn't join "My Quick Tasks" below — that list is starter
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

  if (loading || !user) return null

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
                  <Link href={`/starter-tasks/${task.id}`}>{task.title}</Link>
                </h3>
                <Badge
                  role="status"
                  variant={task.status === StarterTaskStatus.completed ? 'success' : 'warning'}
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

              {task.status === StarterTaskStatus.in_progress && (
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
            task.kind === 'starter' ? (
              <div
                key={`starter-${task.id}`}
                role="article"
                className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              >
                <h3 className="m-0 mb-2">
                  <Link href={`/starter-tasks/${task.id}`}>{task.title}</Link>
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
                  onClick={() => claimStarterMutation.mutate({ id: task.id })}
                  disabled={
                    claimStarterMutation.isPending && claimStarterMutation.variables?.id === task.id
                  }
                >
                  {claimStarterMutation.isPending && claimStarterMutation.variables?.id === task.id
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
