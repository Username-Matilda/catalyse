'use client'

import React, { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  id: number
  name: string
  category_name: string
  is_required: boolean | null
}

interface Task {
  id: number
  title: string
  status: string
  assigned_to_id: number | null
  assigned_to_name: string | null
}

interface Interest {
  id: number
  volunteer_id: number
  volunteer_name: string
  volunteer_bio: string | null
  volunteer_skills: Array<{ id: number; name: string }>
  interest_type: string
  message: string | null
  status: string
  response_message: string | null
}

interface MyInterest {
  id: number
  interest_type: string
  status: string
  response_message: string | null
}

interface Update {
  id: number
  content: string
  author_name: string | null
  created_at: string
}

interface Volunteer {
  id: number
  name: string
}

interface ProjectDetail {
  id: number
  title: string
  description: string
  status: string
  owner_id: number | null
  owner: { id: number; name: string } | null
  proposed_by_id: number | null
  is_org_proposed: boolean | null
  collaboration_link: string | null
  is_seeking_help: boolean | null
  is_seeking_owner: boolean | null
  outcome: string | null
  outcome_notes: string | null
  feedback_to_proposer: string | null
  skills: Skill[]
  tasks: Task[]
  updates: Update[]
  interests: Interest[] | undefined
  my_interest: MyInterest | null | undefined
}

const STATUS_LABELS: Record<string, string> = {
  seeking_owner: 'Seeking Owner',
  seeking_help: 'Seeking Help',
  needs_tasks: 'Needs Tasks',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
  pending_review: 'Pending Review',
  needs_discussion: 'Needs Discussion',
}

const OWNER_STATUSES = [
  { value: 'seeking_owner', label: 'Seeking Owner' },
  { value: 'seeking_help', label: 'Seeking Help' },
  { value: 'needs_tasks', label: 'Needs Tasks' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
]

const ADMIN_EXTRA_STATUSES = [
  { value: 'archived', label: 'Archived' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'needs_discussion', label: 'Needs Discussion' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)
  const [alert, setAlert] = useState<string | null>(null)

  // Task section
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [taskSubmitting, setTaskSubmitting] = useState(false)

  // Status section
  const [newStatus, setNewStatus] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)

  // Interest section
  const [interestType, setInterestType] = useState('want_to_contribute')
  const [interestMessage, setInterestMessage] = useState('')
  const [interestSubmitting, setInterestSubmitting] = useState(false)

  // Update section
  const [updateContent, setUpdateContent] = useState('')
  const [updateSubmitting, setUpdateSubmitting] = useState(false)

  // Transfer ownership
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [transferTo, setTransferTo] = useState('')
  const [transferSubmitting, setTransferSubmitting] = useState(false)

  // Direct assign
  const [assignTo, setAssignTo] = useState('')
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  // Record outcome
  const [outcomeValue, setOutcomeValue] = useState('')
  const [outcomeNotes, setOutcomeNotes] = useState('')
  const [outcomeSubmitting, setOutcomeSubmitting] = useState(false)

  // Review (triage)
  const [reviewStatus, setReviewStatus] = useState('approved')
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    loadProject()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, idParam])

  async function loadProject() {
    setLoadingProject(true)
    try {
      const data = await apiRequest<ProjectDetail>(`/api/projects/${idParam}`)
      setProject(data)
      setNewStatus(data.status)
    } catch {
      router.replace('/')
    } finally {
      setLoadingProject(false)
    }
  }

  useEffect(() => {
    if (!user?.is_admin || !project) return
    apiRequest<{ volunteers: Volunteer[] }>('/api/volunteers?limit=100')
      .then(d => setVolunteers(d.volunteers))
      .catch(() => {})
  }, [user, project])

  function showAlert(msg: string) {
    setAlert(msg)
    setTimeout(() => setAlert(null), 4000)
  }

  if (loading || !user) return null
  if (loadingProject) {
    return (
      <>
        <Header />
        <main className="container page">
          <div className="loading">Loading project…</div>
        </main>
      </>
    )
  }
  if (!project) return null

  const isOwner = project.owner_id != null && project.owner_id === user.id
  const isAdmin = user.is_admin
  const isOwnerOrAdmin = isOwner || isAdmin

  const canSeeInterest =
    !isOwnerOrAdmin &&
    (project.is_seeking_help || project.is_seeking_owner) &&
    !['completed', 'archived'].includes(project.status)

  const statusOptions = isAdmin
    ? [...OWNER_STATUSES, ...ADMIN_EXTRA_STATUSES]
    : OWNER_STATUSES

  // ── Task handlers ────────────────────────────────────────────────────────

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setTaskSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title: newTaskTitle.trim() }),
      })
      setNewTaskTitle('')
      setShowTaskForm(false)
      await loadProject()
      showAlert('Task added!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to add task')
    } finally {
      setTaskSubmitting(false)
    }
  }

  async function handleClaimTask(taskId: number) {
    try {
      await apiRequest(`/api/projects/${idParam}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'assigned', assigned_to_id: user!.id }),
      })
      await loadProject()
      showAlert('Task claimed!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to claim task')
    }
  }

  async function handleDoneTask(taskId: number) {
    try {
      await apiRequest(`/api/projects/${idParam}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'done' }),
      })
      await loadProject()
      showAlert('Task completed!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to complete task')
    }
  }

  async function handleDeleteTask(taskId: number) {
    if (!window.confirm('Delete this task?')) return
    try {
      await apiRequest(`/api/projects/${idParam}/tasks/${taskId}`, { method: 'DELETE' })
      await loadProject()
      showAlert('Task deleted!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  // ── Status handler ───────────────────────────────────────────────────────

  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault()
    setStatusSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      })
      await loadProject()
      showAlert('Status updated!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setStatusSubmitting(false)
    }
  }

  // ── Interest handlers ────────────────────────────────────────────────────

  async function handleExpressInterest(e: React.FormEvent) {
    e.preventDefault()
    setInterestSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}/interest`, {
        method: 'POST',
        body: JSON.stringify({
          interest_type: interestType,
          message: interestMessage.trim() || null,
        }),
      })
      await loadProject()
      showAlert('Interest expressed!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to express interest')
    } finally {
      setInterestSubmitting(false)
    }
  }

  async function handleWithdrawInterest() {
    if (!window.confirm('Withdraw your interest?')) return
    try {
      await apiRequest(`/api/projects/${idParam}/interest`, { method: 'DELETE' })
      await loadProject()
      showAlert('Interest withdrawn')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to withdraw interest')
    }
  }

  // ── Owner interest management ─────────────────────────────────────────────

  async function handleAcceptInterest(interestId: number) {
    try {
      await apiRequest(`/api/projects/${idParam}/interest/${interestId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'accepted' }),
      })
      await loadProject()
      showAlert('Interest accepted')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to accept interest')
    }
  }

  async function handleDeclineInterest(interestId: number) {
    const msg = window.prompt('Optional message for the volunteer:') ?? ''
    try {
      await apiRequest(`/api/projects/${idParam}/interest/${interestId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'declined', response_message: msg || null }),
      })
      await loadProject()
      showAlert('Interest declined')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to decline interest')
    }
  }

  // ── Assign handler ───────────────────────────────────────────────────────

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignTo) return
    setAssignSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}/assign`, {
        method: 'POST',
        body: JSON.stringify({ volunteer_id: parseInt(assignTo, 10) }),
      })
      await loadProject()
      showAlert('Volunteer assigned!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to assign volunteer')
    } finally {
      setAssignSubmitting(false)
    }
  }

  // ── Transfer ownership ────────────────────────────────────────────────────

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transferTo) return
    if (!window.confirm('Transfer ownership to this volunteer?')) return
    setTransferSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}`, {
        method: 'PUT',
        body: JSON.stringify({ owner_id: parseInt(transferTo, 10) }),
      })
      await loadProject()
      showAlert('Ownership transferred!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to transfer ownership')
    } finally {
      setTransferSubmitting(false)
    }
  }

  // ── Record outcome ────────────────────────────────────────────────────────

  async function handleRecordOutcome(e: React.FormEvent) {
    e.preventDefault()
    setOutcomeSubmitting(true)
    try {
      await apiRequest(`/api/admin/projects/${idParam}/outcome`, {
        method: 'PUT',
        body: JSON.stringify({ outcome: outcomeValue, outcome_notes: outcomeNotes.trim() || null }),
      })
      await loadProject()
      showAlert('Outcome recorded!')
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to record outcome')
    } finally {
      setOutcomeSubmitting(false)
    }
  }

  // ── Project update ────────────────────────────────────────────────────────

  async function handlePostUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!updateContent.trim()) return
    setUpdateSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}/updates`, {
        method: 'POST',
        body: JSON.stringify({ content: updateContent.trim() }),
      })
      setUpdateContent('')
      await loadProject()
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to post update')
    } finally {
      setUpdateSubmitting(false)
    }
  }

  // ── Admin triage (review) ─────────────────────────────────────────────────

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault()
    setReviewSubmitting(true)
    try {
      await apiRequest(`/api/admin/projects/${idParam}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: reviewStatus,
          ...(reviewStatus === 'needs_discussion' ? { feedback_to_proposer: reviewMessage } : {}),
          target_status: 'seeking_owner',
        }),
      })
      await loadProject()
      showAlert(reviewStatus === 'approved' ? 'Project approved!' : 'Project sent for discussion.')
      setReviewDone(true)
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to submit review')
    } finally {
      setReviewSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Header />
      <main className="container page">
        {alert && (
          <div role="alert" className="message success" style={{ position: 'sticky', top: 8, zIndex: 20, marginBottom: 16 }}>
            {alert}
          </div>
        )}

        <div id="projectContent">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <span
              aria-label="project status"
              className="badge"
              style={{ background: 'var(--primary-light, #e0f2fe)', color: 'var(--primary-dark, #0369a1)', padding: '4px 10px', borderRadius: 20, fontSize: '0.875rem', fontWeight: 600 }}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
            {isOwnerOrAdmin && (
              <Link href={`/projects/${idParam}/edit`} className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                Edit
              </Link>
            )}
          </div>

          <h1 role="heading" aria-level={1}>{project.title}</h1>

          {project.feedback_to_proposer && (
            <div className="message" style={{ marginBottom: 16, background: '#fffbeb', border: '1px solid #d97706', borderRadius: 8, padding: 12 }}>
              <strong>Feedback from review:</strong> {project.feedback_to_proposer}
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{project.description}</p>

            {project.skills.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>Skills needed:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {project.skills.map(s => (
                    <span key={s.id} className="badge" style={{ background: s.is_required ? 'var(--primary-light, #e0f2fe)' : 'var(--bg-secondary, #f1f5f9)', padding: '2px 8px', borderRadius: 12, fontSize: '0.8rem' }}>
                      {s.name}{s.is_required ? ' *' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {project.owner && (
              <p style={{ marginTop: 8, color: 'var(--text-light)' }}>
                Owner: <Link href={`/volunteers/${project.owner.id}`}>{project.owner.name}</Link>
              </p>
            )}

            {project.collaboration_link && (
              <p style={{ marginTop: 8 }}>
                <a href={project.collaboration_link} target="_blank" rel="noopener noreferrer" role="link">
                  Open Project Doc
                </a>
              </p>
            )}
          </div>

          {/* Outcome display */}
          {project.outcome && (
            <div role="status" className="card" style={{ marginBottom: 16, background: 'var(--success-bg, #f0fdf4)', border: '1px solid var(--success, #16a34a)' }}>
              <strong>Outcome: </strong>
              {project.outcome === 'successful' ? 'Successful' :
               project.outcome === 'partial' ? 'Partial' :
               project.outcome === 'not_completed' ? 'Not Completed' :
               project.outcome === 'ongoing' ? 'Ongoing' : project.outcome}
              {project.outcome_notes && <p style={{ marginTop: 4 }}>{project.outcome_notes}</p>}
            </div>
          )}

          {/* Interest section — shown to non-owners when project is accepting volunteers */}
          {canSeeInterest && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2>Interested in this project?</h2>
              {!project.my_interest ? (
                <form onSubmit={handleExpressInterest}>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                      <input
                        type="radio"
                        name="interest_type"
                        value="want_to_contribute"
                        checked={interestType === 'want_to_contribute'}
                        onChange={() => setInterestType('want_to_contribute')}
                      />
                      I want to help out / contribute to this project
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="interest_type"
                        value="want_to_own"
                        checked={interestType === 'want_to_own'}
                        onChange={() => setInterestType('want_to_own')}
                      />
                      I want to own / lead this project
                    </label>
                  </div>
                  <div className="form-group">
                    <label htmlFor="interest-message">Message (optional)</label>
                    <textarea
                      id="interest-message"
                      rows={3}
                      value={interestMessage}
                      onChange={e => setInterestMessage(e.target.value)}
                      placeholder="Tell them why you're interested…"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={interestSubmitting}>
                    {interestSubmitting ? 'Submitting…' : 'Express Interest'}
                  </button>
                </form>
              ) : (
                <div>
                  <p>
                    Your interest status:{' '}
                    <span aria-label="interest status" style={{ fontWeight: 600 }}>{project.my_interest.status}</span>
                  </p>
                  {project.my_interest.response_message && (
                    <p style={{ color: 'var(--text-light)' }}>{project.my_interest.response_message}</p>
                  )}
                  {project.my_interest.status === 'pending' && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleWithdrawInterest}
                      style={{ marginTop: 8 }}
                    >
                      Withdraw Interest
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tasks section */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Tasks</h2>
              {isOwnerOrAdmin && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowTaskForm(v => !v)}
                >
                  Add Task
                </button>
              )}
            </div>

            {showTaskForm && isOwnerOrAdmin && (
              <form onSubmit={handleAddTask} style={{ marginBottom: 16, padding: 12, background: 'var(--bg-secondary, #f8fafc)', borderRadius: 8 }}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label htmlFor="new-task-title">Task title</label>
                  <input
                    id="new-task-title"
                    type="text"
                    aria-label="Task title"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="Describe the task…"
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={taskSubmitting}>
                  {taskSubmitting ? 'Creating…' : 'Create Task'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaskForm(false)} style={{ marginLeft: 8 }}>
                  Cancel
                </button>
              </form>
            )}

            {project.tasks.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>No tasks yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {project.tasks.map(task => (
                  <li key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border, #e2e8f0)', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1 }}>{task.title}</span>
                    {task.status === 'done' && (
                      <span style={{ color: 'var(--success, #16a34a)', fontWeight: 600, fontSize: '0.875rem' }}>done</span>
                    )}
                    {task.assigned_to_name && task.status !== 'done' && (
                      <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>→ {task.assigned_to_name}</span>
                    )}
                    {task.status === 'open' && (
                      <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '4px 10px' }} onClick={() => handleClaimTask(task.id)}>
                        Claim
                      </button>
                    )}
                    {task.status === 'assigned' && task.assigned_to_id === user.id && (
                      <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '4px 10px' }} onClick={() => handleDoneTask(task.id)}>
                        Done
                      </button>
                    )}
                    {isOwnerOrAdmin && (
                      <button className="btn btn-danger" style={{ fontSize: '0.875rem', padding: '4px 10px' }} onClick={() => handleDeleteTask(task.id)}>
                        Delete task
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Manage status — owner or admin */}
          {isOwnerOrAdmin && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2>Manage Project Status</h2>
              <form onSubmit={handleUpdateStatus} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 160 }}>
                  <label htmlFor="change-status">Change Status</label>
                  <select
                    id="change-status"
                    aria-label="Change Status"
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={statusSubmitting}>
                  {statusSubmitting ? 'Updating…' : 'Update Status'}
                </button>
              </form>
            </div>
          )}

          {/* Interested Volunteers — owner or admin */}
          {isOwnerOrAdmin && Array.isArray(project.interests) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2>Interested Volunteers</h2>

              {project.interests.length === 0 ? (
                <p style={{ color: 'var(--text-light)' }}>No interests yet.</p>
              ) : (
                <div>
                  {project.interests.map(interest => (
                    <div key={interest.id} className="interest-card card" style={{ marginBottom: 12, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <strong>{interest.volunteer_name}</strong>
                          <span style={{ marginLeft: 8, color: 'var(--text-light)', fontSize: '0.875rem' }}>
                            {interest.interest_type === 'want_to_own' ? 'wants to own' : 'wants to help'}
                          </span>
                          <span style={{ marginLeft: 8, fontSize: '0.875rem', fontWeight: 600 }}>{interest.status}</span>
                          {interest.message && <p style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>{interest.message}</p>}
                        </div>
                        {interest.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '4px 10px' }} onClick={() => handleAcceptInterest(interest.id)}>
                              Accept
                            </button>
                            <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '4px 10px' }} onClick={() => handleDeclineInterest(interest.id)}>
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Direct assign */}
              {volunteers.length > 0 && (
                <form onSubmit={handleAssign} style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                    <label htmlFor="assign-volunteer">Volunteer to assign</label>
                    <select
                      id="assign-volunteer"
                      aria-label="Volunteer to assign"
                      value={assignTo}
                      onChange={e => setAssignTo(e.target.value)}
                    >
                      <option value="">— Select volunteer —</option>
                      {volunteers.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={!assignTo || assignSubmitting}>
                    {assignSubmitting ? 'Assigning…' : 'Assign'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Transfer Ownership — admin only */}
          {isAdmin && volunteers.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Transfer Ownership</h3>
              <form onSubmit={handleTransfer} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                  <label htmlFor="transfer-to">Transfer to</label>
                  <select
                    id="transfer-to"
                    aria-label="Transfer to"
                    value={transferTo}
                    onChange={e => setTransferTo(e.target.value)}
                  >
                    <option value="">— Select volunteer —</option>
                    {volunteers.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={!transferTo || transferSubmitting}>
                  {transferSubmitting ? 'Transferring…' : 'Transfer'}
                </button>
              </form>
            </div>
          )}

          {/* Record Outcome — admin, completed projects */}
          {isAdmin && project.status === 'completed' && !project.outcome && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2>Record Project Outcome</h2>
              <form onSubmit={handleRecordOutcome}>
                <div className="form-group">
                  <label htmlFor="outcome-select">Outcome</label>
                  <select
                    id="outcome-select"
                    aria-label="Outcome"
                    value={outcomeValue}
                    onChange={e => setOutcomeValue(e.target.value)}
                    required
                  >
                    <option value="">— Select outcome —</option>
                    <option value="successful">Successful</option>
                    <option value="partial">Partial</option>
                    <option value="not_completed">Not Completed</option>
                    <option value="ongoing">Ongoing</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="outcome-notes">Outcome Notes</label>
                  <textarea
                    id="outcome-notes"
                    aria-label="Outcome Notes"
                    rows={3}
                    value={outcomeNotes}
                    onChange={e => setOutcomeNotes(e.target.value)}
                    placeholder="Notes about the outcome…"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={!outcomeValue || outcomeSubmitting}>
                  {outcomeSubmitting ? 'Recording…' : 'Record Outcome'}
                </button>
              </form>
            </div>
          )}

          {/* Admin triage — pending_review projects */}
          {isAdmin && project.status === 'pending_review' && !reviewDone && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2>Review Project</h2>
              <form onSubmit={handleSubmitReview}>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                    <input
                      type="radio"
                      name="review_status"
                      value="approved"
                      checked={reviewStatus === 'approved'}
                      onChange={() => setReviewStatus('approved')}
                    />
                    Approve
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="review_status"
                      value="needs_discussion"
                      checked={reviewStatus === 'needs_discussion'}
                      onChange={() => setReviewStatus('needs_discussion')}
                    />
                    Needs Discussion
                  </label>
                </div>
                {reviewStatus === 'needs_discussion' && (
                  <div className="form-group">
                    <label htmlFor="review-message">Message to Proposer</label>
                    <textarea
                      id="review-message"
                      aria-label="Message to Proposer"
                      rows={3}
                      value={reviewMessage}
                      onChange={e => setReviewMessage(e.target.value)}
                      placeholder="What do you want to discuss?"
                    />
                  </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={reviewSubmitting}>
                  {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </form>
            </div>
          )}

          {/* Project Updates */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h2>Project Updates</h2>
            {isOwnerOrAdmin && (
              <form onSubmit={handlePostUpdate} style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label htmlFor="add-update">Add Update</label>
                  <textarea
                    id="add-update"
                    aria-label="Add Update"
                    rows={3}
                    value={updateContent}
                    onChange={e => setUpdateContent(e.target.value)}
                    placeholder="Share a progress update…"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={!updateContent.trim() || updateSubmitting}>
                  {updateSubmitting ? 'Posting…' : 'Post Update'}
                </button>
              </form>
            )}
            {project.updates.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>No updates yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {project.updates.map(u => (
                  <li key={u.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                    <p style={{ margin: 0 }}>{u.content}</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      {u.author_name} · {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
