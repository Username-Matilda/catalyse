'use client'

import React, { use, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import { Badge } from '@/components/Badge'
import { STATUS_LABELS, projectStatusVariant } from '@/components/ProjectCard'
import CommentThread from '@/components/CommentThread'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { InterestStatus, ProjectStatus, TaskStatus } from '@/generated/prisma/enums'

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useRequireAuth()
  const queryClient = useQueryClient()

  const showToast = useToast()

  // Task section
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  // Status section
  const [newStatus, setNewStatus] = useState('')

  // Interest section
  const [interestType, setInterestType] = useState('want_to_contribute')
  const [interestMessage, setInterestMessage] = useState('')

  // Transfer ownership
  const [transferTo, setTransferTo] = useState('')

  // Direct assign
  const [assignTo, setAssignTo] = useState('')

  // Record outcome
  const {
    value: outcomeValue,
    onChange: setOutcomeValue,
    options: outcomeOptions,
  } = useFilterOptions(
    [
      { value: '', label: '— Select outcome —' },
      { value: 'successful', label: 'Successful' },
      { value: 'partial', label: 'Partial' },
      { value: 'not_completed', label: 'Not Completed' },
      { value: 'ongoing', label: 'Ongoing' },
    ],
    '',
  )
  const [outcomeNotes, setOutcomeNotes] = useState('')

  // Review (triage)
  const [reviewStatus, setReviewStatus] = useState('approved')
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewDone, setReviewDone] = useState(false)

  // Contact owner
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactSubject, setContactSubject] = useState('')
  const [contactBody, setContactBody] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: projectRaw, isPending: loadingProject } = useQuery({
    ...orpc.projects.getById.queryOptions({ input: { id: parseInt(idParam, 10) } }),
    enabled: !!user,
  })
  const project = projectRaw

  // Sync newStatus when project data first loads
  useEffect(() => {
    if (project?.status) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewStatus(project.status)
    }
  }, [project?.status])

  // Redirect to home if project not found
  useEffect(() => {
    if (!loadingProject && !project && user) {
      router.replace('/')
    }
  }, [loadingProject, project, user, router])

  const { data: volunteersData } = useQuery({
    ...orpc.volunteers.list.queryOptions({ input: { limit: 100 } }),
    enabled: !!user?.isAdmin && !!project,
  })
  const volunteers = volunteersData?.volunteers ?? []

  const ownerId = project?.ownerId ?? 0
  const { data: ownerContactData } = useQuery({
    ...orpc.volunteers.getById.queryOptions({ input: { id: ownerId } }),
    enabled: !!project?.ownerId && showContactModal,
  })
  const ownerContact = ownerContactData

  // ── Mutations ────────────────────────────────────────────────────────────

  const invalidateProject = () =>
    queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })

  const createTaskMutation = useMutation({
    ...orpc.projects.createTask.mutationOptions(),
    onSuccess: () => {
      setNewTaskTitle('')
      setShowTaskForm(false)
      showToast('Task added!', 'success')
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to add task', 'error'),
  })

  const updateTaskMutation = useMutation({
    ...orpc.projects.updateTask.mutationOptions(),
    onSuccess: (_data, variables) => {
      if (variables.data.status === TaskStatus.in_progress) {
        showToast('Task claimed!', 'success')
      } else if (variables.data.status === TaskStatus.completed) {
        showToast('Task completed!', 'success')
      }
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to update task', 'error'),
  })

  const deleteTaskMutation = useMutation({
    ...orpc.projects.deleteTask.mutationOptions(),
    onSuccess: () => {
      showToast('Task deleted!', 'success')
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to delete task', 'error'),
  })

  const updateProjectMutation = useMutation({
    ...orpc.projects.update.mutationOptions(),
    onSuccess: (_data, variables) => {
      if ('status' in variables) {
        showToast('Status updated!', 'success')
      } else {
        showToast('Ownership transferred!', 'success')
      }
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to update project', 'error'),
  })

  const expressInterestMutation = useMutation({
    ...orpc.projects.expressInterest.mutationOptions(),
    onSuccess: () => {
      showToast('Interest expressed!', 'success')
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to express interest', 'error'),
  })

  const withdrawInterestMutation = useMutation({
    ...orpc.projects.withdrawInterest.mutationOptions(),
    onSuccess: () => {
      showToast('Interest withdrawn', 'success')
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to withdraw interest', 'error'),
  })

  const respondToInterestMutation = useMutation({
    ...orpc.projects.respondToInterest.mutationOptions(),
    onSuccess: (_data, variables) => {
      showToast(
        variables.status === InterestStatus.accepted ? 'Interest accepted' : 'Interest declined',
        'success',
      )
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to respond to interest', 'error'),
  })

  const assignMutation = useMutation({
    ...orpc.projects.assign.mutationOptions(),
    onSuccess: () => {
      showToast('Volunteer assigned!', 'success')
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to assign volunteer', 'error'),
  })

  const setOutcomeMutation = useMutation({
    ...orpc.admin.projects.setOutcome.mutationOptions(),
    onSuccess: () => {
      showToast('Outcome recorded!', 'success')
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to record outcome', 'error'),
  })

  const reviewMutation = useMutation({
    ...orpc.admin.projects.review.mutationOptions(),
    onSuccess: (_data, variables) => {
      showToast(
        variables.status === 'approved' ? 'Project approved!' : 'Project sent for discussion.',
        'success',
      )
      setReviewDone(true)
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to submit review', 'error'),
  })

  const sendMessageMutation = useMutation({
    ...orpc.messages.send.mutationOptions(),
    onSuccess: () => {
      setShowContactModal(false)
      setContactSubject('')
      setContactBody('')
      showToast(
        "Message sent! They'll receive it by email and can reply directly to you.",
        'success',
      )
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to send message', 'error'),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleContactOwner(e: React.FormEvent) {
    e.preventDefault()
    if (!project?.ownerId) return
    sendMessageMutation.mutate({
      recipientId: project.ownerId,
      subject: contactSubject.trim(),
      message: contactBody.trim(),
      relatedProjectId: project.id,
    })
  }

  if (loading || !user) return null
  if (loadingProject) {
    return (
      <>
        <main className="container py-5 pb-15">
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

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    createTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      title: newTaskTitle.trim(),
    })
  }

  function handleClaimTask(taskId: number) {
    updateTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      taskId,
      data: { status: TaskStatus.in_progress, assigneeId: user!.id },
    })
  }

  function handleDoneTask(taskId: number) {
    updateTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      taskId,
      data: { status: TaskStatus.completed },
    })
  }

  function handleDeleteTask(taskId: number) {
    if (!window.confirm('Delete this task?')) return
    deleteTaskMutation.mutate({ projectId: parseInt(idParam, 10), taskId })
  }

  function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault()
    const validStatuses = Object.values(ProjectStatus)
    const status = validStatuses.find((s) => s === newStatus)
    if (!status) return
    updateProjectMutation.mutate({ id: parseInt(idParam, 10), status })
  }

  function handleExpressInterest(e: React.FormEvent) {
    e.preventDefault()
    expressInterestMutation.mutate({
      projectId: parseInt(idParam, 10),
      interestType: interestType as 'want_to_contribute' | 'want_to_own',
      message: interestMessage.trim() || null,
    })
  }

  function handleWithdrawInterest() {
    if (!window.confirm('Withdraw your interest?')) return
    withdrawInterestMutation.mutate({ projectId: parseInt(idParam, 10) })
  }

  function handleAcceptInterest(interestId: number) {
    respondToInterestMutation.mutate({
      projectId: parseInt(idParam, 10),
      interestId,
      status: InterestStatus.accepted,
    })
  }

  function handleDeclineInterest(interestId: number) {
    const msg = window.prompt('Optional message for the volunteer:') ?? ''
    respondToInterestMutation.mutate({
      projectId: parseInt(idParam, 10),
      interestId,
      status: 'declined',
      responseMessage: msg || null,
    })
  }

  function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignTo) return
    assignMutation.mutate({
      projectId: parseInt(idParam, 10),
      volunteerId: parseInt(assignTo, 10),
    })
  }

  function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transferTo) return
    if (!window.confirm('Transfer ownership to this volunteer?')) return
    updateProjectMutation.mutate({
      id: parseInt(idParam, 10),
      assigneeId: parseInt(transferTo, 10),
    })
  }

  function handleRecordOutcome(e: React.FormEvent) {
    e.preventDefault()
    if (!outcomeValue) return
    setOutcomeMutation.mutate({
      id: parseInt(idParam, 10),
      outcome: outcomeValue,
      outcomeNotes: outcomeNotes.trim() || null,
    })
  }

  function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault()
    reviewMutation.mutate({
      id: parseInt(idParam, 10),
      status: reviewStatus as 'approved' | 'needs_discussion',
      ...(reviewStatus === 'needs_discussion' ? { comment: reviewMessage } : {}),
      targetStatus: 'seeking_owner',
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasDirectContact =
    ownerContact &&
    (ownerContact.discordHandle || ownerContact.signalNumber || ownerContact.whatsappNumber)

  return (
    <>
      <main className="container py-5 pb-15">
        {/* [test hook] projectContent id used by action helpers to confirm page has loaded */}
        <div id="projectContent" className="flex items-center gap-3 flex-wrap mb-2">
          <Badge variant={projectStatusVariant(project.status)} aria-label="project status">
            {STATUS_LABELS[project.status] ?? project.status}
          </Badge>
          {isOwnerOrAdmin && (
            <Button href={`/projects/${idParam}/edit`} variant="secondary" size="sm">
              Edit
            </Button>
          )}
        </div>

        <h1 role="heading" aria-level={1}>
          {project.title}
        </h1>

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
                        ? 'bg-secondary text-white dark:bg-gray-600'
                        : 'bg-accent text-secondary-dark dark:bg-gray-700 dark:text-gray-300'
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
              <Badge variant="success" className="text-sm">
                {project.match.overallScore}%
              </Badge>
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
            className="bg-emerald-100 dark:bg-emerald-900 border border-emerald-300 dark:border-emerald-600 rounded-xl p-6 mb-4"
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
                  <label className="flex items-center gap-2 cursor-pointer mb-2 font-normal">
                    <input
                      type="radio"
                      name="interest_type"
                      value="want_to_contribute"
                      checked={interestType === 'want_to_contribute'}
                      onChange={() => setInterestType('want_to_contribute')}
                    />
                    I want to help out / contribute to this project
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-normal">
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
                <Button type="submit" disabled={expressInterestMutation.isPending}>
                  {expressInterestMutation.isPending ? 'Submitting…' : 'Express Interest'}
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
                {project.myInterest.status === InterestStatus.pending && (
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
            <h2 className="m-0">Tasks</h2>
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
                  <Button type="submit" disabled={createTaskMutation.isPending}>
                    {createTaskMutation.isPending ? 'Creating…' : 'Create Task'}
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
                  {task.status === TaskStatus.completed && (
                    <span className="text-success text-sm font-semibold">done</span>
                  )}
                  {task.assignedToName && task.status !== TaskStatus.completed && (
                    <span className="text-text-light text-sm">→ {task.assignedToName}</span>
                  )}
                  {task.status === TaskStatus.open && (
                    <Button variant="secondary" size="sm" onClick={() => handleClaimTask(task.id)}>
                      Claim
                    </Button>
                  )}
                  {task.status === TaskStatus.in_progress && task.assignedToId === user.id && (
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
              <div className="mb-0 flex-1 min-w-[160px]">
                <FilterDropdown
                  id="change-status"
                  label="Change Status"
                  ariaLabel="Change Status"
                  value={newStatus}
                  options={statusOptions}
                  onChange={(v) => setNewStatus(v)}
                />
              </div>
              <Button type="submit" disabled={updateProjectMutation.isPending}>
                {updateProjectMutation.isPending ? 'Updating…' : 'Update Status'}
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
                        <Badge variant={projectStatusVariant(interest.status)} className="ml-2">
                          {interest.status}
                        </Badge>
                        {interest.message && (
                          <p className="text-sm mt-1 mb-0">{interest.message}</p>
                        )}
                      </div>
                      {interest.status === InterestStatus.pending && (
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
                <div className="flex-1 min-w-[200px]">
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
                <Button type="submit" disabled={!assignTo || assignMutation.isPending}>
                  {assignMutation.isPending ? 'Assigning…' : 'Assign'}
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
              <div className="flex-1 min-w-[200px]">
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
              <Button type="submit" disabled={!transferTo || updateProjectMutation.isPending}>
                {updateProjectMutation.isPending ? 'Transferring…' : 'Transfer'}
              </Button>
            </form>
          </div>
        )}

        {/* Record Outcome */}
        {isAdmin && project.status === ProjectStatus.completed && !project.outcome && (
          <div className={card}>
            <h2>Record Project Outcome</h2>
            <form onSubmit={handleRecordOutcome}>
              <div className="mb-5">
                <FilterDropdown
                  id="outcome-select"
                  label="Outcome"
                  ariaLabel="Outcome"
                  value={outcomeValue}
                  options={outcomeOptions}
                  onChange={setOutcomeValue}
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
              <Button type="submit" disabled={!outcomeValue || setOutcomeMutation.isPending}>
                {setOutcomeMutation.isPending ? 'Recording…' : 'Record Outcome'}
              </Button>
            </form>
          </div>
        )}

        {/* Admin triage */}
        {isAdmin && project.status === ProjectStatus.pending_review && !reviewDone && (
          <div className={card}>
            <h2>Review Project</h2>
            <form onSubmit={handleSubmitReview}>
              <div className="mb-5">
                <label className="flex items-center gap-2 cursor-pointer mb-2 font-normal">
                  <input
                    type="radio"
                    name="review_status"
                    value="approved"
                    checked={reviewStatus === 'approved'}
                    onChange={() => setReviewStatus('approved')}
                  />
                  Approve
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-normal">
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
              <Button type="submit" disabled={reviewMutation.isPending}>
                {reviewMutation.isPending ? 'Submitting…' : 'Submit Review'}
              </Button>
            </form>
          </div>
        )}

        {/* Project Updates */}
        <div className={card}>
          <h2>Project Updates</h2>
          <CommentThread
            workItemId={project.id}
            emptyText="No updates yet."
            placeholder="Share a progress update…"
          />
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
              <h2 className="m-0 text-xl">Contact Owner</h2>
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
                  <Button type="submit" disabled={sendMessageMutation.isPending}>
                    {sendMessageMutation.isPending ? 'Sending…' : 'Send Message'}
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
