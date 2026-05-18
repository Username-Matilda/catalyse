'use client'

import React, { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

// ── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  id: number
  name: string
  categoryName: string
  isRequired: boolean | null
}

interface Task {
  id: number
  title: string
  status: string
  assignedToId: number | null
  assignedToName: string | null
}

interface Interest {
  id: number
  volunteerId: number
  volunteerName: string
  volunteerBio: string | null
  volunteerSkills: Array<{ id: number; name: string }>
  interestType: string
  message: string | null
  status: string
  responseMessage: string | null
}

interface MyInterest {
  id: number
  interestType: string
  status: string
  responseMessage: string | null
}

interface Update {
  id: number
  content: string
  authorName: string | null
  createdAt: string
}

interface Volunteer {
  id: number
  name: string
}

interface MatchScore {
  requiredMatchPercent: number
  matchedRequiredCount: number
  totalRequired: number
  overallScore: number
}

interface ProjectDetail {
  id: number
  title: string
  description: string
  status: string
  ownerId: number | null
  owner: { id: number; name: string } | null
  proposedById: number | null
  isOrgProposed: boolean | null
  collaborationLink: string | null
  isSeekingHelp: boolean | null
  isSeekingOwner: boolean | null
  outcome: string | null
  outcomeNotes: string | null
  feedbackToProposer: string | null
  skills: Skill[]
  tasks: Task[]
  updates: Update[]
  interests: Interest[] | undefined
  myInterest: MyInterest | null | undefined
  match?: MatchScore
}

interface OwnerContact {
  discordHandle?: string | null
  signalNumber?: string | null
  whatsappNumber?: string | null
  contactPreference?: string | null
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

// ── Tailwind class constants ──────────────────────────────────────────────────

const card = 'bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word'

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    seeking_owner: 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]',
    seeking_help: 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]',
    needs_tasks: 'bg-[#FEF9C3] text-[#713F12] dark:bg-[#78350F] dark:text-[#FDE68A]',
    in_progress: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
    on_hold: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
    completed: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
    pending_review: 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]',
    needs_discussion: 'bg-[#FCE7F3] text-[#9D174D]',
  }
  return `inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${colors[status] ?? 'bg-[#F3F4F6] text-[#374151]'}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()

  const showToast = useToast()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)

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

  // Contact owner
  const [showContactModal, setShowContactModal] = useState(false)
  const [ownerContact, setOwnerContact] = useState<OwnerContact | null>(null)
  const [contactSubject, setContactSubject] = useState('')
  const [contactBody, setContactBody] = useState('')
  const [contactSubmitting, setContactSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  const loadProject = useCallback(async () => {
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
  }, [idParam, router])

  useEffect(() => {
    if (!user) return
    // False positive: setState calls inside loadProject are in async callbacks, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProject()
  }, [user, loadProject])

  useEffect(() => {
    if (!user?.isAdmin || !project) return
    apiRequest<{ volunteers: Volunteer[] }>('/api/volunteers?limit=100')
      .then((d) => setVolunteers(d.volunteers))
      .catch(() => {})
  }, [user, project])

  // Fetch owner contact info when contact modal opens
  useEffect(() => {
    if (!showContactModal || !project?.ownerId) return
    apiRequest<OwnerContact>(`/api/volunteers/${project.ownerId}`)
      .then((v) => setOwnerContact(v))
      .catch(() => setOwnerContact(null))
  }, [showContactModal, project?.ownerId])

  async function handleContactOwner(e: React.FormEvent) {
    e.preventDefault()
    if (!project?.ownerId) return
    setContactSubmitting(true)
    try {
      await apiRequest(`/api/contact/${project.ownerId}`, {
        method: 'POST',
        body: JSON.stringify({
          subject: contactSubject.trim(),
          message: contactBody.trim(),
          relatedProjectId: project.id,
        }),
      })
      setShowContactModal(false)
      setContactSubject('')
      setContactBody('')
      showToast(
        "Message sent! They'll receive it by email and can reply directly to you.",
        'success',
      )
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to send message', 'error')
    } finally {
      setContactSubmitting(false)
    }
  }

  if (loading || !user) return null
  if (loadingProject) {
    return (
      <>
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading project…</div>
        </main>
      </>
    )
  }
  if (!project) return null

  const isOwner = project.ownerId !== null && project.ownerId === user.id
  const isAdmin = user.isAdmin
  const isOwnerOrAdmin = isOwner || isAdmin

  const canSeeInterest =
    !isOwnerOrAdmin &&
    (project.isSeekingHelp || project.isSeekingOwner) &&
    !['completed', 'archived'].includes(project.status)

  const statusOptions = isAdmin ? [...OWNER_STATUSES, ...ADMIN_EXTRA_STATUSES] : OWNER_STATUSES

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
      showToast('Task added!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to add task', 'error')
    } finally {
      setTaskSubmitting(false)
    }
  }

  async function handleClaimTask(taskId: number) {
    try {
      await apiRequest(`/api/projects/${idParam}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'assigned', assignedToId: user!.id }),
      })
      await loadProject()
      showToast('Task claimed!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to claim task', 'error')
    }
  }

  async function handleDoneTask(taskId: number) {
    try {
      await apiRequest(`/api/projects/${idParam}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'done' }),
      })
      await loadProject()
      showToast('Task completed!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to complete task', 'error')
    }
  }

  async function handleDeleteTask(taskId: number) {
    if (!window.confirm('Delete this task?')) return
    try {
      await apiRequest(`/api/projects/${idParam}/tasks/${taskId}`, { method: 'DELETE' })
      await loadProject()
      showToast('Task deleted!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete task', 'error')
    }
  }

  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault()
    setStatusSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      })
      await loadProject()
      showToast('Status updated!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to update status', 'error')
    } finally {
      setStatusSubmitting(false)
    }
  }

  async function handleExpressInterest(e: React.FormEvent) {
    e.preventDefault()
    setInterestSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}/interest`, {
        method: 'POST',
        body: JSON.stringify({
          interestType,
          message: interestMessage.trim() || null,
        }),
      })
      await loadProject()
      showToast('Interest expressed!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to express interest', 'error')
    } finally {
      setInterestSubmitting(false)
    }
  }

  async function handleWithdrawInterest() {
    if (!window.confirm('Withdraw your interest?')) return
    try {
      await apiRequest(`/api/projects/${idParam}/interest`, { method: 'DELETE' })
      await loadProject()
      showToast('Interest withdrawn', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to withdraw interest', 'error')
    }
  }

  async function handleAcceptInterest(interestId: number) {
    try {
      await apiRequest(`/api/projects/${idParam}/interest/${interestId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'accepted' }),
      })
      await loadProject()
      showToast('Interest accepted', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to accept interest', 'error')
    }
  }

  async function handleDeclineInterest(interestId: number) {
    const msg = window.prompt('Optional message for the volunteer:') ?? ''
    try {
      await apiRequest(`/api/projects/${idParam}/interest/${interestId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'declined', responseMessage: msg || null }),
      })
      await loadProject()
      showToast('Interest declined', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to decline interest', 'error')
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignTo) return
    setAssignSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}/assign`, {
        method: 'POST',
        body: JSON.stringify({ volunteerId: parseInt(assignTo, 10) }),
      })
      await loadProject()
      showToast('Volunteer assigned!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to assign volunteer', 'error')
    } finally {
      setAssignSubmitting(false)
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transferTo) return
    if (!window.confirm('Transfer ownership to this volunteer?')) return
    setTransferSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}`, {
        method: 'PUT',
        body: JSON.stringify({ ownerId: parseInt(transferTo, 10) }),
      })
      await loadProject()
      showToast('Ownership transferred!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to transfer ownership', 'error')
    } finally {
      setTransferSubmitting(false)
    }
  }

  async function handleRecordOutcome(e: React.FormEvent) {
    e.preventDefault()
    setOutcomeSubmitting(true)
    try {
      await apiRequest(`/api/admin/projects/${idParam}/outcome`, {
        method: 'PUT',
        body: JSON.stringify({ outcome: outcomeValue, outcomeNotes: outcomeNotes.trim() || null }),
      })
      await loadProject()
      showToast('Outcome recorded!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to record outcome', 'error')
    } finally {
      setOutcomeSubmitting(false)
    }
  }

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
      showToast(err instanceof Error ? err.message : 'Failed to post update', 'error')
    } finally {
      setUpdateSubmitting(false)
    }
  }

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
      showToast(
        reviewStatus === 'approved' ? 'Project approved!' : 'Project sent for discussion.',
        'success',
      )
      setReviewDone(true)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to submit review', 'error')
    } finally {
      setReviewSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasDirectContact =
    ownerContact &&
    (ownerContact.discordHandle || ownerContact.signalNumber || ownerContact.whatsappNumber)

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        {/* [test hook] projectContent id used by action helpers to confirm page has loaded */}
        <div id="projectContent" className="flex items-center gap-3 flex-wrap mb-2">
          <span aria-label="project status" className={statusBadge(project.status)}>
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
          {isOwnerOrAdmin && (
            <Button href={`/projects/${idParam}/edit`} variant="secondary" size="sm">
              Edit
            </Button>
          )}
        </div>

        <h1 role="heading" aria-level={1}>
          {project.title}
        </h1>

        {project.feedbackToProposer && (
          <div className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] dark:bg-[#78350F] dark:text-[#FDE68A] dark:border-[#D97706]">
            <strong>Feedback from review:</strong> {project.feedbackToProposer}
          </div>
        )}

        {/* Main project card */}
        <div className={card}>
          <p className="whitespace-pre-wrap">{project.description}</p>

          {project.skills.length > 0 && (
            <div className="mt-3">
              <strong>Skills needed:</strong>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {project.skills.map((s) => (
                  <span
                    key={s.id}
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      s.isRequired
                        ? 'bg-secondary text-white dark:bg-[#4B5563]'
                        : 'bg-accent text-secondary-dark dark:bg-[#374151] dark:text-[#D1D5DB]'
                    }`}
                  >
                    {s.name}
                    {s.isRequired ? ' *' : ''}
                  </span>
                ))}
              </div>
              <p className="text-xs text-text-light mt-1">* Required</p>
            </div>
          )}

          {/* Match score */}
          {!isOwner && project.match && project.match.overallScore > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-text-light">Your skill match:</span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]">
                {project.match.overallScore}%
              </span>
            </div>
          )}

          {project.owner && (
            <p className="mt-2 text-text-light text-sm">
              Owner:{' '}
              <Link href={`/volunteers/${project.owner.id}`} className="underline">
                {project.owner.name}
              </Link>
            </p>
          )}

          {project.ownerId && !isOwner && !isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => setShowContactModal(true)}
            >
              Contact Owner
            </Button>
          )}

          {project.collaborationLink && (
            <p className="mt-2 text-sm">
              <a
                href={project.collaborationLink}
                target="_blank"
                rel="noopener noreferrer"
                role="link"
                className="underline text-primary-dark"
              >
                Open Project Doc →
              </a>
            </p>
          )}
        </div>

        {/* Outcome display */}
        {project.outcome && (
          <div
            role="status"
            className="bg-[#D1FAE5] dark:bg-[#064E3B] border border-[#6EE7B7] dark:border-[#059669] rounded-xl p-6 mb-4"
          >
            <strong>Outcome: </strong>
            {project.outcome === 'successful'
              ? 'Successful'
              : project.outcome === 'partial'
                ? 'Partial'
                : project.outcome === 'not_completed'
                  ? 'Not Completed'
                  : project.outcome === 'ongoing'
                    ? 'Ongoing'
                    : project.outcome}
            {project.outcomeNotes && <p className="mt-1 text-sm">{project.outcomeNotes}</p>}
          </div>
        )}

        {/* Interest section */}
        {canSeeInterest && (
          <div className={card}>
            <h2>Interested in this project?</h2>
            {!project.myInterest ? (
              <form onSubmit={handleExpressInterest}>
                <div className="mb-5">
                  <label
                    className="flex items-center gap-2 cursor-pointer mb-2"
                    style={{ fontWeight: 400 }}
                  >
                    <input
                      type="radio"
                      name="interest_type"
                      value="want_to_contribute"
                      checked={interestType === 'want_to_contribute'}
                      onChange={() => setInterestType('want_to_contribute')}
                    />
                    I want to help out / contribute to this project
                  </label>
                  <label
                    className="flex items-center gap-2 cursor-pointer"
                    style={{ fontWeight: 400 }}
                  >
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
                <div className="mb-5">
                  <label htmlFor="interest-message">Message (optional)</label>
                  <textarea
                    id="interest-message"
                    rows={3}
                    value={interestMessage}
                    onChange={(e) => setInterestMessage(e.target.value)}
                    placeholder="Tell them why you're interested…"
                  />
                </div>
                <Button type="submit" disabled={interestSubmitting}>
                  {interestSubmitting ? 'Submitting…' : 'Express Interest'}
                </Button>
              </form>
            ) : (
              <div>
                <p>
                  Your interest status:{' '}
                  <span aria-label="interest status" className="font-semibold">
                    {project.myInterest.status}
                  </span>
                </p>
                {project.myInterest.responseMessage && (
                  <p className="text-text-light text-sm">{project.myInterest.responseMessage}</p>
                )}
                {project.myInterest.status === 'pending' && (
                  <Button variant="secondary" className="mt-2" onClick={handleWithdrawInterest}>
                    Withdraw Interest
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tasks */}
        <div className={card}>
          <div className="flex justify-between items-center mb-3">
            <h2 style={{ margin: 0 }}>Tasks</h2>
            {isOwnerOrAdmin && (
              <Button variant="secondary" onClick={() => setShowTaskForm((v) => !v)}>
                Add Task
              </Button>
            )}
          </div>

          {showTaskForm && isOwnerOrAdmin && (
            <div className="bg-brand-bg rounded-lg p-3 mb-4 border border-brand-border">
              <form onSubmit={handleAddTask}>
                <div className="mb-3">
                  <label htmlFor="new-task-title">Task title</label>
                  <input
                    id="new-task-title"
                    type="text"
                    aria-label="Task title"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Describe the task…"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={taskSubmitting}>
                    {taskSubmitting ? 'Creating…' : 'Create Task'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowTaskForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}

          {project.tasks.length === 0 ? (
            <p className="text-text-light">No tasks yet.</p>
          ) : (
            <ul className="list-none p-0 m-0">
              {project.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-2 py-2 border-b border-brand-border last:border-0 flex-wrap"
                >
                  <span className="flex-1">{task.title}</span>
                  {task.status === 'done' && (
                    <span className="text-success text-sm font-semibold">done</span>
                  )}
                  {task.assignedToName && task.status !== 'done' && (
                    <span className="text-text-light text-sm">→ {task.assignedToName}</span>
                  )}
                  {task.status === 'open' && (
                    <Button variant="secondary" size="sm" onClick={() => handleClaimTask(task.id)}>
                      Claim
                    </Button>
                  )}
                  {task.status === 'assigned' && task.assignedToId === user.id && (
                    <Button variant="secondary" size="sm" onClick={() => handleDoneTask(task.id)}>
                      Done
                    </Button>
                  )}
                  {isOwnerOrAdmin && (
                    <Button variant="danger" size="sm" onClick={() => handleDeleteTask(task.id)}>
                      Delete task
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Manage status */}
        {isOwnerOrAdmin && (
          <div className={card}>
            <h2>Manage Project Status</h2>
            <form onSubmit={handleUpdateStatus} className="flex gap-2 items-end flex-wrap">
              <div className="mb-0 flex-1" style={{ minWidth: 160 }}>
                <FilterDropdown
                  id="change-status"
                  label="Change Status"
                  ariaLabel="Change Status"
                  value={newStatus}
                  options={statusOptions}
                  onChange={(v) => setNewStatus(v)}
                />
              </div>
              <Button type="submit" disabled={statusSubmitting}>
                {statusSubmitting ? 'Updating…' : 'Update Status'}
              </Button>
            </form>
          </div>
        )}

        {/* Interested Volunteers */}
        {isOwnerOrAdmin && Array.isArray(project.interests) && (
          <div className={card}>
            <h2>Interested Volunteers</h2>

            {project.interests.length === 0 ? (
              <p className="text-text-light">No interests yet.</p>
            ) : (
              <div>
                {project.interests.map((interest) => (
                  // [test hook] interest-card class used as test selector
                  <div
                    key={interest.id}
                    className="interest-card bg-brand-bg rounded-lg p-3 mb-3 border border-brand-border"
                  >
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div>
                        <strong>{interest.volunteerName}</strong>
                        <span className="ml-2 text-text-light text-sm">
                          {interest.interestType === 'want_to_own'
                            ? 'wants to own'
                            : 'wants to help'}
                        </span>
                        <span className={`ml-2 ${statusBadge(interest.status)}`}>
                          {interest.status}
                        </span>
                        {interest.message && (
                          <p className="text-sm mt-1 mb-0">{interest.message}</p>
                        )}
                      </div>
                      {interest.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAcceptInterest(interest.id)}>
                            Accept
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDeclineInterest(interest.id)}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {volunteers.length > 0 && (
              <form onSubmit={handleAssign} className="flex gap-2 items-end flex-wrap mt-4">
                <div className="flex-1" style={{ minWidth: 200 }}>
                  <FilterDropdown
                    id="assign-volunteer"
                    label="Assign volunteer directly"
                    ariaLabel="Volunteer to assign"
                    value={assignTo}
                    options={[
                      { value: '', label: '— Select volunteer —' },
                      ...volunteers.map((v) => ({ value: String(v.id), label: v.name })),
                    ]}
                    onChange={(v) => setAssignTo(v)}
                    searchable
                  />
                </div>
                <Button type="submit" disabled={!assignTo || assignSubmitting}>
                  {assignSubmitting ? 'Assigning…' : 'Assign'}
                </Button>
              </form>
            )}
          </div>
        )}

        {/* Transfer Ownership — admin only */}
        {isAdmin && volunteers.length > 0 && (
          <div className={card}>
            <h3>Transfer Ownership</h3>
            <form onSubmit={handleTransfer} className="flex gap-2 items-end flex-wrap">
              <div className="flex-1" style={{ minWidth: 200 }}>
                <FilterDropdown
                  id="transfer-to"
                  label="Transfer to"
                  ariaLabel="Transfer to"
                  value={transferTo}
                  options={[
                    { value: '', label: '— Select volunteer —' },
                    ...volunteers.map((v) => ({ value: String(v.id), label: v.name })),
                  ]}
                  onChange={(v) => setTransferTo(v)}
                  searchable
                />
              </div>
              <Button type="submit" disabled={!transferTo || transferSubmitting}>
                {transferSubmitting ? 'Transferring…' : 'Transfer'}
              </Button>
            </form>
          </div>
        )}

        {/* Record Outcome */}
        {isAdmin && project.status === 'completed' && !project.outcome && (
          <div className={card}>
            <h2>Record Project Outcome</h2>
            <form onSubmit={handleRecordOutcome}>
              <div className="mb-5">
                <FilterDropdown
                  id="outcome-select"
                  label="Outcome"
                  ariaLabel="Outcome"
                  value={outcomeValue}
                  options={[
                    { value: '', label: '— Select outcome —' },
                    { value: 'successful', label: 'Successful' },
                    { value: 'partial', label: 'Partial' },
                    { value: 'not_completed', label: 'Not Completed' },
                    { value: 'ongoing', label: 'Ongoing' },
                  ]}
                  onChange={(v) => setOutcomeValue(v)}
                />
              </div>
              <div className="mb-5">
                <label htmlFor="outcome-notes">Outcome Notes</label>
                <textarea
                  id="outcome-notes"
                  aria-label="Outcome Notes"
                  rows={3}
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  placeholder="Notes about the outcome…"
                />
              </div>
              <Button type="submit" disabled={!outcomeValue || outcomeSubmitting}>
                {outcomeSubmitting ? 'Recording…' : 'Record Outcome'}
              </Button>
            </form>
          </div>
        )}

        {/* Admin triage */}
        {isAdmin && project.status === 'pending_review' && !reviewDone && (
          <div className={card}>
            <h2>Review Project</h2>
            <form onSubmit={handleSubmitReview}>
              <div className="mb-5">
                <label
                  className="flex items-center gap-2 cursor-pointer mb-2"
                  style={{ fontWeight: 400 }}
                >
                  <input
                    type="radio"
                    name="review_status"
                    value="approved"
                    checked={reviewStatus === 'approved'}
                    onChange={() => setReviewStatus('approved')}
                  />
                  Approve
                </label>
                <label
                  className="flex items-center gap-2 cursor-pointer"
                  style={{ fontWeight: 400 }}
                >
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
                <div className="mb-5">
                  <label htmlFor="review-message">Message to Proposer</label>
                  <textarea
                    id="review-message"
                    aria-label="Message to Proposer"
                    rows={3}
                    value={reviewMessage}
                    onChange={(e) => setReviewMessage(e.target.value)}
                    placeholder="What do you want to discuss?"
                  />
                </div>
              )}
              <Button type="submit" disabled={reviewSubmitting}>
                {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
              </Button>
            </form>
          </div>
        )}

        {/* Project Updates */}
        <div className={card}>
          <h2>Project Updates</h2>
          {isOwnerOrAdmin && (
            <form onSubmit={handlePostUpdate} className="mb-4">
              <div className="mb-3">
                <label htmlFor="add-update">Add Update</label>
                <textarea
                  id="add-update"
                  aria-label="Add Update"
                  rows={3}
                  value={updateContent}
                  onChange={(e) => setUpdateContent(e.target.value)}
                  placeholder="Share a progress update…"
                />
              </div>
              <Button type="submit" disabled={!updateContent.trim() || updateSubmitting}>
                {updateSubmitting ? 'Posting…' : 'Post Update'}
              </Button>
            </form>
          )}
          {project.updates.length === 0 ? (
            <p className="text-text-light">No updates yet.</p>
          ) : (
            <ul className="list-none p-0 m-0">
              {project.updates.map((u) => (
                <li key={u.id} className="py-3 border-b border-brand-border last:border-0">
                  <p className="m-0 mb-1">{u.content}</p>
                  <span className="text-xs text-text-light">
                    {u.authorName} · {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* Contact Owner modal */}
      {showContactModal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowContactModal(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Contact Owner"
            className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Contact Owner</h2>
              <Button
                variant="ghost"
                icon
                onClick={() => setShowContactModal(false)}
                aria-label="Close"
              >
                ×
              </Button>
            </div>
            <div className="p-6">
              {/* Direct contact channels */}
              {hasDirectContact && (
                <div className="mb-5">
                  <p className="text-sm font-medium mb-2">Contact directly:</p>
                  <div className="flex flex-col gap-2">
                    {ownerContact!.discordHandle && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-text-light">Discord:</span>
                        <span className="font-medium">{ownerContact!.discordHandle}</span>
                      </div>
                    )}
                    {ownerContact!.signalNumber && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-text-light">Signal:</span>
                        <span className="font-medium">{ownerContact!.signalNumber}</span>
                      </div>
                    )}
                    {ownerContact!.whatsappNumber && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-text-light">WhatsApp:</span>
                        <span className="font-medium">{ownerContact!.whatsappNumber}</span>
                      </div>
                    )}
                  </div>
                  <hr className="my-4 border-brand-border" />
                  <p className="text-sm text-text-light mb-3">
                    Or send a message via the platform:
                  </p>
                </div>
              )}

              <form onSubmit={handleContactOwner}>
                <div className="mb-5">
                  <label htmlFor="contact-subject">Subject</label>
                  <input
                    id="contact-subject"
                    type="text"
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    value={contactBody}
                    onChange={(e) => setContactBody(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" onClick={() => setShowContactModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={contactSubmitting}>
                    {contactSubmitting ? 'Sending…' : 'Send Message'}
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
