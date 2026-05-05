'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface StarterTask {
  id: number
  title: string
  description: string
  skill_name: string | null
  project_title: string | null
  status: string
  review_rating: string | null
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
  const [tasks, setTasks] = useState<StarterTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [submitting, setSubmitting] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

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
    setMessage(null)
    try {
      await apiRequest(`/api/starter-tasks/${taskId}/submit`, { method: 'PUT' })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'submitted' } : t))
      setMessage({ text: 'Task submitted for review!', type: 'success' })
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Failed to submit task', type: 'error' })
    } finally {
      setSubmitting(null)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <h1>My Starter Tasks</h1>
        <p style={{ color: 'var(--text-light)', marginBottom: 24 }}>
          Small, self-contained tasks to help you get started and demonstrate your skills.
        </p>

        {message && (
          <div role="alert" className={`message ${message.type}`} style={{ marginBottom: 16 }}>
            {message.text}
          </div>
        )}

        {loadingTasks ? (
          <div className="loading">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <h3>No tasks assigned yet</h3>
            <p style={{ color: 'var(--text-light)' }}>
              Check back soon, or browse <a href="/">projects</a> to find other ways to contribute.
            </p>
          </div>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>{task.title}</h3>
                <span
                  className="status-badge"
                  style={{
                    background: task.status === 'completed' || task.status === 'reviewed' ? 'var(--success-bg, #d1fae5)' : 'var(--warning-bg, #fffbeb)',
                    color: task.status === 'completed' || task.status === 'reviewed' ? 'var(--success)' : 'var(--warning)',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {STATUS_LABELS[task.status] ?? task.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {task.skill_name && <span className="skill-tag">{task.skill_name}</span>}
                {task.estimated_hours && (
                  <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>~{task.estimated_hours}h</span>
                )}
                {task.project_title && (
                  <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>
                    Related: {task.project_title}
                  </span>
                )}
              </div>

              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{task.description}</p>

              {task.feedback_to_volunteer && (
                <div style={{ background: 'var(--bg-secondary, #f8fafc)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <strong style={{ fontSize: '0.875rem' }}>Feedback:</strong>
                  <p style={{ margin: '4px 0 0', fontStyle: 'italic', color: 'var(--text-light)' }}>
                    &ldquo;{task.feedback_to_volunteer}&rdquo;
                  </p>
                  {task.review_rating && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-light)' }}>
                      Rating: <strong>{task.review_rating}</strong>
                    </p>
                  )}
                </div>
              )}

              {task.status === 'assigned' && (
                <button
                  className="btn btn-primary"
                  onClick={() => submitTask(task.id)}
                  disabled={submitting === task.id}
                >
                  {submitting === task.id ? 'Submitting…' : 'Mark as Complete'}
                </button>
              )}
            </div>
          ))
        )}
      </main>
    </>
  )
}
