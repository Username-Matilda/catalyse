'use client'

import React, { use, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { formatDate } from '@/lib/format-date'
import { InterestStatus, ProjectStatus, TaskStatus } from '@/generated/prisma/enums'
import type { InferRouterOutputs } from '@orpc/server'
import type { AppRouter } from '@/server/router'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ────────────────────────────────────────────────────────────────────

type ProjectTask = InferRouterOutputs<AppRouter>['projects']['getById']['tasks'][number]

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

// ── Task list item ──────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function TaskAvatar({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span
        aria-label="Unassigned"
        title="Unassigned"
        className="w-6 h-6 rounded-full border border-dashed border-brand-border shrink-0"
      />
    )
  }
  return (
    <span
      aria-label={`Assigned to ${name}`}
      title={name}
      className="w-6 h-6 rounded-full bg-secondary text-white text-xs font-semibold flex items-center justify-center shrink-0"
    >
      {initials(name)}
    </span>
  )
}

function ActionMenu({
  ariaLabel,
  children,
}: {
  ariaLabel: string
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      // A nested FilterDropdown's listbox portals to document.body too, so a
      // click on one of its options looks like an outside click — ignore it.
      if (target instanceof Element && target.closest('[role="listbox"]')) return
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          const r = triggerRef.current!.getBoundingClientRect()
          setPos({ top: r.bottom + window.scrollY + 6, left: r.right + window.scrollX - 256 })
          setOpen((o) => !o)
        }}
        className="w-7 h-7 flex items-center justify-center rounded-md text-base font-bold text-brand-text bg-brand-bg hover:bg-brand-border transition-colors cursor-pointer"
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{
              position: 'absolute',
              top: pos.top,
              left: pos.left,
              width: 256,
              zIndex: 9999,
            }}
            className="bg-surface border border-brand-border rounded-lg shadow-lg py-2"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  )
}

function SortableTaskItem({
  task,
  draggable,
  title,
  chips,
  assigneeName,
  primaryAction,
  menu,
}: {
  task: ProjectTask
  draggable: boolean
  title: React.ReactNode
  chips: React.ReactNode
  assigneeName: string | null
  primaryAction: React.ReactNode
  menu: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  return (
    <li
      ref={setNodeRef}
      className="group flex items-center gap-2 py-2 border-b border-brand-border last:border-0"
      style={{
        // dynamic: drag transform/transition/opacity
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <span
        {...(draggable ? attributes : {})}
        {...(draggable ? listeners : {})}
        className={`w-4 shrink-0 leading-none text-text-light text-center text-base opacity-60 group-hover:opacity-100 transition-opacity ${draggable ? 'cursor-grab' : ''}`}
        title={draggable ? 'Drag to reorder' : undefined}
      >
        {draggable ? '⠿' : ''}
      </span>
      <span className="flex-1 min-w-0 truncate">{title}</span>
      <div className="flex items-center gap-2 shrink-0">{chips}</div>
      {primaryAction}
      <TaskAvatar name={assigneeName} />
      {menu && (
        <div className="opacity-60 group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100 transition-opacity">
          {menu}
        </div>
      )}
    </li>
  )
}

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
  const [newTaskEstimatedHours, setNewTaskEstimatedHours] = useState('')
  const [newTaskDeadline, setNewTaskDeadline] = useState('')
  const [orderedTasks, setOrderedTasks] = useState<ProjectTask[]>([])
  const [taskAssignSelections, setTaskAssignSelections] = useState<Record<number, string>>({})
  const taskDragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

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

  // Sync orderedTasks when project data loads/changes
  useEffect(() => {
    if (project?.tasks) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrderedTasks(project.tasks)
    }
  }, [project?.tasks])

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
    enabled: !!project && (!!user?.isAdmin || project.ownerId === user?.id),
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
      setNewTaskEstimatedHours('')
      setNewTaskDeadline('')
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

  const reorderTasksMutation = useMutation({
    ...orpc.projects.reorderTasks.mutationOptions(),
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to reorder tasks', 'error')
      void invalidateProject()
    },
  })

  const assignTaskMutation = useMutation({
    ...orpc.projects.assignTask.mutationOptions(),
    onSuccess: (_data, variables) => {
      showToast('Task assigned!', 'success')
      setTaskAssignSelections((s) => {
        const next = { ...s }
        delete next[variables.taskId]
        return next
      })
      void invalidateProject()
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to assign task', 'error'),
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

  // Excludes the current owner — they're already shown in the Owner box above.
  const volunteerInterests = (project.interests ?? []).filter(
    (i) => i.volunteerId !== project.ownerId,
  )
  const interestedVolunteers = volunteerInterests.filter(
    (i) => i.status !== InterestStatus.declined && i.status !== InterestStatus.withdrawn,
  )
  const interestedVolunteerIds = new Set(interestedVolunteers.map((i) => i.volunteerId))
  const assignVolunteerOptions = [
    { value: '', label: '— Select volunteer —' },
    ...(interestedVolunteers.length > 0
      ? [
          { value: '__interested_header', label: 'Interested in this project', header: true },
          ...interestedVolunteers.map((i) => ({
            value: String(i.volunteerId),
            label: i.volunteerName,
          })),
          { value: '__all_header', label: 'All volunteers', header: true },
        ]
      : []),
    ...volunteers
      .filter((v) => !interestedVolunteerIds.has(v.id))
      .map((v) => ({ value: String(v.id), label: v.name })),
  ]

  // ── Task handlers ────────────────────────────────────────────────────────

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    createTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      title: newTaskTitle.trim(),
      estimatedHours: newTaskEstimatedHours ? parseFloat(newTaskEstimatedHours) : null,
      deadline: newTaskDeadline ? new Date(newTaskDeadline) : null,
    })
  }

  function handleAssignTask(taskId: number) {
    const selected = taskAssignSelections[taskId]
    if (!selected) return
    assignTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      taskId,
      assigneeId: parseInt(selected, 10),
    })
  }

  function handleTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedTasks.findIndex((t) => t.id === active.id)
    const newIndex = orderedTasks.findIndex((t) => t.id === over.id)
    const reordered = arrayMove(orderedTasks, oldIndex, newIndex)
    setOrderedTasks(reordered)
    reorderTasksMutation.mutate({
      projectId: parseInt(idParam, 10),
      items: reordered.map((t, i) => ({ id: t.id, sortOrder: i + 1 })),
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Main column */}
          <div className="lg:col-span-2 min-w-0">
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
                    <div className="flex gap-3 flex-wrap mb-3">
                      <div>
                        <label htmlFor="new-task-hours">Estimated hours</label>
                        <input
                          id="new-task-hours"
                          type="number"
                          min="0"
                          step="0.5"
                          aria-label="Estimated hours"
                          value={newTaskEstimatedHours}
                          onChange={(e) => setNewTaskEstimatedHours(e.target.value)}
                          placeholder="e.g. 3"
                          className="w-30"
                        />
                      </div>
                      <div>
                        <label htmlFor="new-task-deadline">Deadline</label>
                        <input
                          id="new-task-deadline"
                          type="date"
                          aria-label="Deadline"
                          value={newTaskDeadline}
                          onChange={(e) => setNewTaskDeadline(e.target.value)}
                        />
                      </div>
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

              {orderedTasks.length === 0 ? (
                <p className="text-text-light">No tasks yet.</p>
              ) : (
                <DndContext
                  sensors={taskDragSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={isOwnerOrAdmin ? handleTaskDragEnd : undefined}
                >
                  <SortableContext
                    items={orderedTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="list-none p-0 m-0">
                      {orderedTasks.map((task) => {
                        const isOverdue =
                          task.deadline &&
                          task.status !== TaskStatus.completed &&
                          // eslint-disable-next-line react-hooks/purity -- wall-clock comparison for overdue display
                          new Date(task.deadline).getTime() < Date.now()
                        const canAssign =
                          isOwnerOrAdmin &&
                          task.status !== TaskStatus.completed &&
                          volunteers.length > 0

                        return (
                          <SortableTaskItem
                            key={task.id}
                            task={task}
                            draggable={isOwnerOrAdmin}
                            title={task.title}
                            assigneeName={
                              task.status !== TaskStatus.completed ? task.assignedToName : null
                            }
                            chips={
                              <>
                                {task.status === TaskStatus.completed && (
                                  <span className="text-success text-sm font-semibold">done</span>
                                )}
                                {isOverdue && <Badge variant="danger">Overdue</Badge>}
                                {task.estimatedHours !== null && (
                                  <span className="text-text-light text-xs whitespace-nowrap">
                                    ~{task.estimatedHours}h
                                  </span>
                                )}
                                {task.deadline && (
                                  <span className="text-text-light text-xs whitespace-nowrap">
                                    Due {formatDate(task.deadline)}
                                  </span>
                                )}
                              </>
                            }
                            primaryAction={
                              <>
                                {task.status === TaskStatus.open && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleClaimTask(task.id)}
                                  >
                                    Claim
                                  </Button>
                                )}
                                {task.status === TaskStatus.in_progress &&
                                  task.assignedToId === user.id && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleDoneTask(task.id)}
                                    >
                                      Done
                                    </Button>
                                  )}
                              </>
                            }
                            menu={
                              (canAssign || isOwnerOrAdmin) && (
                                <ActionMenu ariaLabel={`Task actions for ${task.title}`}>
                                  {(close) => (
                                    <>
                                      {canAssign && (
                                        <div className="px-3 py-2 flex flex-col gap-2">
                                          <FilterDropdown
                                            id={`assign-task-${task.id}`}
                                            label="Assign to"
                                            ariaLabel={`Assign volunteer to ${task.title}`}
                                            value={taskAssignSelections[task.id] ?? ''}
                                            options={assignVolunteerOptions}
                                            onChange={(v) =>
                                              setTaskAssignSelections((s) => ({
                                                ...s,
                                                [task.id]: v,
                                              }))
                                            }
                                            searchable
                                          />
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={
                                              !taskAssignSelections[task.id] ||
                                              assignTaskMutation.isPending
                                            }
                                            onClick={() => {
                                              handleAssignTask(task.id)
                                              close()
                                            }}
                                          >
                                            Assign
                                          </Button>
                                        </div>
                                      )}
                                      {isOwnerOrAdmin && (
                                        <button
                                          role="menuitem"
                                          className={`w-full text-left px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-accent transition-colors cursor-pointer ${canAssign ? 'border-t border-brand-border mt-1' : ''}`}
                                          onClick={() => {
                                            handleDeleteTask(task.id)
                                            close()
                                          }}
                                        >
                                          Delete task
                                        </button>
                                      )}
                                    </>
                                  )}
                                </ActionMenu>
                              )
                            }
                          />
                        )
                      })}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* Project Updates */}
            <div className={card}>
              <h2>Project Updates</h2>
              <CommentThread
                workItemId={project.id}
                emptyText="No updates yet."
                placeholder="Share a progress update…"
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 min-w-0 flex flex-col gap-4">
            {/* Admin triage */}
            {isAdmin &&
              (project.status === ProjectStatus.pending_review ||
                project.status === ProjectStatus.needs_discussion) &&
              !reviewDone && (
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

            {/* Manage status */}
            {isOwnerOrAdmin && (
              <div className={card}>
                <h2>Manage Project Status</h2>
                <form onSubmit={handleUpdateStatus} className="flex gap-2 items-end flex-wrap">
                  <div className="mb-0 flex-1 min-w-40">
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

            {/* Ownership */}
            <div className={card}>
              <h2>Owner</h2>
              <div className="flex items-center justify-between gap-2">
                {project.owner ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <TaskAvatar name={project.owner.name} />
                    <Link href={`/volunteers/${project.owner.id}`} className="underline truncate">
                      {project.owner.name}
                    </Link>
                  </div>
                ) : (
                  <p className="text-text-light text-sm m-0">No owner yet.</p>
                )}
                {isAdmin && volunteers.length > 0 && (
                  <ActionMenu ariaLabel="Ownership actions">
                    {(close) => (
                      <>
                        <div className="px-3 py-2 flex flex-col gap-2">
                          <h3 className="m-0 text-sm">Transfer Ownership</h3>
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
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!transferTo || updateProjectMutation.isPending}
                            onClick={() => {
                              if (!transferTo) return
                              if (!window.confirm('Transfer ownership to this volunteer?')) return
                              updateProjectMutation.mutate({
                                id: parseInt(idParam, 10),
                                assigneeId: parseInt(transferTo, 10),
                              })
                              close()
                            }}
                          >
                            {updateProjectMutation.isPending ? 'Transferring…' : 'Transfer'}
                          </Button>
                        </div>
                        {project.owner && (
                          <button
                            role="menuitem"
                            className="w-full text-left px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-accent transition-colors cursor-pointer border-t border-brand-border mt-1"
                            onClick={() => {
                              if (!window.confirm('Remove the current owner from this project?'))
                                return
                              updateProjectMutation.mutate({
                                id: parseInt(idParam, 10),
                                assigneeId: null,
                              })
                              close()
                            }}
                          >
                            Remove ownership
                          </button>
                        )}
                      </>
                    )}
                  </ActionMenu>
                )}
              </div>
              {project.ownerId && !isOwner && !isAdmin && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowContactModal(true)}
                >
                  Contact Owner
                </Button>
              )}

              {isOwnerOrAdmin && Array.isArray(project.interests) && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <h3 className="text-sm mb-2">Volunteers</h3>

                  {volunteerInterests.length === 0 ? (
                    <p className="text-text-light text-sm">No interests yet.</p>
                  ) : (
                    <ul className="list-none p-0 m-0">
                      {volunteerInterests.map((interest) => (
                        // [test hook] interest-card class used as test selector
                        <li
                          key={interest.id}
                          className="interest-card flex items-center gap-2 py-2 border-b border-brand-border last:border-0 flex-wrap"
                        >
                          <TaskAvatar name={interest.volunteerName} />
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{interest.volunteerName}</div>
                            <div className="text-text-light text-xs">
                              {interest.status === InterestStatus.accepted
                                ? interest.interestType === 'want_to_own'
                                  ? 'Owner'
                                  : 'Helper'
                                : interest.status === InterestStatus.pending
                                  ? interest.interestType === 'want_to_own'
                                    ? 'wants to own'
                                    : 'wants to help'
                                  : interest.interestType === 'want_to_own'
                                    ? 'wanted to own'
                                    : 'wanted to help'}
                            </div>
                          </div>
                          {interest.status === InterestStatus.pending ? (
                            <div className="flex gap-2 shrink-0">
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
                          ) : interest.status === InterestStatus.accepted ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant={projectStatusVariant(interest.status)}>
                                {interest.status}
                              </Badge>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleDeclineInterest(interest.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          ) : (
                            <Badge variant={projectStatusVariant(interest.status)}>
                              {interest.status}
                            </Badge>
                          )}
                          {interest.message && interest.status !== InterestStatus.accepted && (
                            <p className="text-sm text-text-light w-full m-0">{interest.message}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {volunteers.length > 0 && (
                    <form
                      onSubmit={handleAssign}
                      className="flex gap-2 items-center flex-wrap mt-3 pt-3 border-t border-brand-border"
                    >
                      <span className="text-text-light text-sm shrink-0">+ Add</span>
                      <div className="flex-1 min-w-40">
                        <FilterDropdown
                          id="assign-volunteer"
                          label=""
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
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!assignTo || assignMutation.isPending}
                      >
                        {assignMutation.isPending ? 'Assigning…' : 'Assign'}
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>

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
                      <p className="text-text-light text-sm">
                        {project.myInterest.responseMessage}
                      </p>
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
          </div>
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
