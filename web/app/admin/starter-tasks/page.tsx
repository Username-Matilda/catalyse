'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

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
  estimated_hours: number | null
  created_at: string
}

interface Volunteer {
  id: number
  name: string
}

export default function AdminStarterTasksPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [tasks, setTasks] = useState<StarterTask[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())

  // Create form
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createSkillId, setCreateSkillId] = useState('')
  const [createHours, setCreateHours] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Assign modal
  const [assignModal, setAssignModal] = useState<StarterTask | null>(null)
  const [assignVolunteerId, setAssignVolunteerId] = useState('')

  // Review modal
  const [reviewModal, setReviewModal] = useState<StarterTask | null>(null)
  const [reviewRating, setReviewRating] = useState<'excellent' | 'good' | 'needs_improvement'>('good')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter])

  async function loadAll() {
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
      setAlert({ text: 'Failed to load data', type: 'error' })
    } finally {
      setLoadingData(false)
    }
  }

  function toggleCard(id: number) {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
      setAlert({ text: 'Task created!', type: 'success' })
      setCreateTitle(''); setCreateDesc(''); setCreateSkillId(''); setCreateHours('')
      setShowCreate(false)
      await loadAll()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to create task', type: 'error' })
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
      setAlert({ text: 'Task assigned!', type: 'success' })
      setAssignModal(null)
      await loadAll()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to assign', type: 'error' })
    } finally {
      setSubmitting(false)
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
      setAlert({ text: 'Task reviewed!', type: 'success' })
      setReviewModal(null)
      await loadAll()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to review', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  const STATUS_OPTS = ['', 'open', 'assigned', 'submitted', 'completed', 'reviewed']

  const RATING_LABELS: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    needs_improvement: 'Needs improvement',
  }

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1>Starter Tasks</h1>
          <Button onClick={() => setShowCreate(s => !s)}>
            {showCreate ? 'Cancel' : 'Create Task'}
          </Button>
        </div>

        {alert && (
          <div role="alert" className={alert.type === 'success'
            ? 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] dark:bg-[#064E3B] dark:text-[#6EE7B7] dark:border-[#059669]'
            : 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]'}>
            {alert.text}
          </div>
        )}

        {showCreate && (
          <div role="dialog" aria-labelledby="create-dialog-title" className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" style={{ marginBottom: 24 }}>
            <h2 id="create-dialog-title">Create Starter Task</h2>
            <form onSubmit={createTask}>
              <div className="mb-5">
                <label htmlFor="ct-title">Title</label>
                <input id="ct-title" type="text" value={createTitle} onChange={e => setCreateTitle(e.target.value)} required />
              </div>
              <div className="mb-5">
                <label htmlFor="ct-desc">Description</label>
                <textarea id="ct-desc" rows={4} value={createDesc} onChange={e => setCreateDesc(e.target.value)} required style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="mb-5">
                  <label htmlFor="ct-skill">Skill Being Tested</label>
                  <select id="ct-skill" value={createSkillId} onChange={e => setCreateSkillId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">No skill</option>
                    {skills.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.category_name})</option>
                    ))}
                  </select>
                </div>
                <div className="mb-5">
                  <label htmlFor="ct-hours">Estimated Hours</label>
                  <input id="ct-hours" type="number" min="0.5" step="0.5" value={createHours} onChange={e => setCreateHours(e.target.value)} />
                </div>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Task'}
              </Button>
            </form>
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          {STATUS_OPTS.map(s => (
            <Button
              key={s || 'all'}
              variant={statusFilter === s ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s || 'All'}
            </Button>
          ))}
        </div>

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : tasks.length === 0 ? (
          <p>No tasks found.</p>
        ) : (
          /* [test hook] card, card-header classes used as test selectors */
          tasks.map(task => (
            <div key={task.id} className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
              <div
                className="card-header flex justify-between items-start mb-3 gap-3 min-w-0"
                style={{ cursor: 'pointer' }}
                onClick={() => toggleCard(task.id)}
              >
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>{task.title}</h3>
                  <div className="text-text-light" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    {task.skill_name && <span>{task.skill_name}</span>}
                    {task.estimated_hours && <span>~{task.estimated_hours}h</span>}
                    {task.assigned_to_id && task.assigned_to_name && (
                      <span>Assigned to: <Link href={`/admin/volunteers/${task.assigned_to_id}`}>{task.assigned_to_name}</Link></span>
                    )}
                  </div>
                </div>
                {/* [test hook] status-badge class used as test selector */}
                <span className="status-badge" style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.8rem', background: 'var(--bg-secondary, #f8fafc)', whiteSpace: 'nowrap' }}>
                  {task.status}
                </span>
              </div>

              {expandedCards.has(task.id) && (
                <>
                  <p className="text-text-light text-sm" style={{ margin: '0 0 12px' }}>
                    {task.description}
                  </p>

                  <div className="flex gap-2">
                    {(task.status === 'open' || !task.assigned_to_id) && (
                      <Button variant="secondary" size="sm" onClick={() => { setAssignModal(task); setAssignVolunteerId('') }}>
                        Assign
                      </Button>
                    )}
                    {task.status === 'submitted' && (
                      <Button size="sm" onClick={() => { setReviewModal(task); setReviewRating('good'); setReviewFeedback(''); setReviewNotes('') }}>
                        Review
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </main>

      {assignModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={e => { if (e.target === e.currentTarget) setAssignModal(null) }}
        >
          <div role="dialog" aria-labelledby="assign-dialog-title" className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 id="assign-dialog-title">Assign Task</h2>
            </div>
            <div className="p-6">
              <p className="text-text-light mb-4">{assignModal.title}</p>
              <form onSubmit={assignTask}>
                <div className="mb-5">
                  <label htmlFor="assign-vol">Volunteer</label>
                  <select id="assign-vol" value={assignVolunteerId} onChange={e => setAssignVolunteerId(e.target.value)} required style={{ width: '100%' }}>
                    <option value="">Select a volunteer…</option>
                    {volunteers.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setAssignModal(null)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>Assign</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {reviewModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={e => { if (e.target === e.currentTarget) setReviewModal(null) }}
        >
          <div role="dialog" aria-labelledby="review-dialog-title" className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 id="review-dialog-title">Review Task</h2>
            </div>
            <div className="p-6">
              <p className="text-text-light mb-4">{reviewModal.title}</p>
              <form onSubmit={reviewTask}>
                <div className="mb-5">
                  <label>Rating</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {(['excellent', 'good', 'needs_improvement'] as const).map(r => (
                      <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="radio" value={r} checked={reviewRating === r} onChange={() => setReviewRating(r)} />
                        {RATING_LABELS[r]}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mb-5">
                  <label htmlFor="rv-feedback">{"Feedback to Volunteer (they'll see this)"}</label>
                  <textarea id="rv-feedback" rows={3} value={reviewFeedback} onChange={e => setReviewFeedback(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div className="mb-5">
                  <label htmlFor="rv-notes">Internal Notes</label>
                  <textarea id="rv-notes" rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setReviewModal(null)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>Submit Review</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
