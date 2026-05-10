'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface StarterTask {
  id: number
  title: string
  description: string
  skill_name: string | null
  project_title: string | null
  status: string
  review_notes: string | null
  feedback_to_volunteer: string | null
  estimated_hours: number | null
}

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  submitted: 'Submitted — awaiting review',
  completed: 'Completed',
  reviewed: 'Reviewed',
}

export default function StarterTasksPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [tasks, setTasks] = useState<StarterTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [submitting, setSubmitting] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<StarterTask[]>('/api/my/starter-tasks')
      .then(data => {
        setTasks(data)
        setLoadingTasks(false)
      })
      .catch(() => setLoadingTasks(false))
  }, [user])

  async function submitTask(taskId: number) {
    setSubmitting(taskId)
    try {
      await apiRequest(`/api/starter-tasks/${taskId}/submit`, { method: 'PUT' })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'submitted' } : t))
      showToast('Task submitted for review!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to submit task', 'error')
    } finally {
      setSubmitting(null)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>My Starter Tasks</h1>
        <p className="text-text-light mb-6">
          Small, self-contained tasks to help you get started and demonstrate your skills.
        </p>

        {loadingTasks ? (
          <div className="text-center py-10 text-text-light">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
            <h3>No tasks assigned yet</h3>
            <p className="text-text-light">
              Check back soon, or browse <Link href="/">projects</Link> to find other ways to contribute.
            </p>
          </div>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
              <div className="flex justify-between items-start mb-2">
                <h3 className="m-0">{task.title}</h3>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${task.status === 'completed' || task.status === 'reviewed' ? 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]' : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]'}`}
                >
                  {STATUS_LABELS[task.status] ?? task.status}
                </span>
              </div>

              <div className="flex gap-2 mb-3 flex-wrap">
                {task.skill_name && <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]">{task.skill_name}</span>}
                {task.estimated_hours && (
                  <span className="text-text-light text-sm">~{task.estimated_hours}h</span>
                )}
                {task.project_title && (
                  <span className="text-text-light text-sm">
                    Related: {task.project_title}
                  </span>
                )}
              </div>

              <p className="whitespace-pre-wrap mb-4">{task.description}</p>

              {task.feedback_to_volunteer && (
                <div className="bg-surface rounded-lg p-3 mb-3">
                  <strong className="text-sm">Feedback:</strong>
                  <p className="mt-1 italic text-text-light">
                    &ldquo;{task.feedback_to_volunteer}&rdquo;
                  </p>
                </div>
              )}

              {task.status === 'assigned' && (
                <Button
                  onClick={() => submitTask(task.id)}
                  disabled={submitting === task.id}
                >
                  {submitting === task.id ? 'Submitting…' : 'Mark as Complete'}
                </Button>
              )}
            </div>
          ))
        )}
      </main>
    </>
  )
}
