'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useRequireApproved } from '@/lib/hooks/auth'
import { orpc } from '@/lib/orpc'
import Button from '@/components/Button'
import { Badge } from '@/components/Badge'
import CommentThread from '@/components/CommentThread'
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

  const { data: task, isLoading } = useQuery({
    ...orpc.projects.getTask.queryOptions({ input: { projectId, taskId } }),
    enabled: !!user && !isNaN(projectId) && !isNaN(taskId),
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
      </div>

      <div className="bg-surface rounded-xl shadow p-6">
        <h2 className="text-lg mb-4">Comments</h2>
        <CommentThread workItemId={task.id} />
      </div>
    </main>
  )
}
