'use client'

import React, { use, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRequireApproved } from '@/lib/hooks/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import { Badge, badgeClasses, badgeColorClasses } from '@/components/Badge'
import Tooltip from '@/components/Tooltip'
import { INTEREST_STATUS_LABELS, projectStatusVariant } from '@/components/ProjectCard'
import CommentThread from '@/components/CommentThread'
import Modal from '@/components/ui/Modal'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import VolunteerSelect from '@/components/VolunteerSelect'
import Tabs from '@/components/Tabs'
import GanttChart from '@/components/gantt/GanttChart'
import type { GanttRow as GanttRowData } from '@/components/gantt/types'
import GanttItemPanel from '@/components/gantt/GanttItemPanel'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { formatDate, formatDateShort, fromDateInputValue } from '@/lib/format-date'
import BaselineDialog from '@/components/gantt/BaselineDialog'
import ProjectPorting from '@/components/ProjectPorting'
import SaveAsTemplateButton from '@/components/SaveAsTemplateButton'
import { scheduleWithPatches } from '@/components/gantt/optimistic'
import { startOfUtcDay } from '@/lib/schedule'
import { projectLocationParts } from '@/lib/filter-options'
import {
  ADMIN_ONLY_STATUSES,
  OWNER_ALLOWED_STATUSES,
  TERMINAL_STATUSES,
  projectStatusLabel,
  proposerDisplay,
} from '@/lib/project-status'
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

// Both lists come from lib/project-status.ts, which the server's permission check reads
// too — they used to be hand-synced copies.
const toOptions = (statuses: string[]) =>
  statuses.map((value) => ({ value, label: projectStatusLabel(value) }))
const OWNER_STATUSES = toOptions(OWNER_ALLOWED_STATUSES)
const ADMIN_EXTRA_STATUSES = toOptions(ADMIN_ONLY_STATUSES)

// ── Tailwind class constants ──────────────────────────────────────────────────

const card = 'bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word'

// The status select's trigger is colored like a Badge, but as a full-width, clickable pill.
function statusTriggerClasses(status: string) {
  return `w-full flex items-center justify-between gap-2 px-3 py-2 rounded-full text-sm font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-secondary transition-colors ${badgeColorClasses(projectStatusVariant(status))}`
}

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
    <Tooltip content={name}>
      <span
        aria-label={`Assigned to ${name}`}
        className="w-6 h-6 rounded-full bg-secondary text-white text-xs font-semibold flex items-center justify-center shrink-0"
      >
        {initials(name)}
      </span>
    </Tooltip>
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
      className="group flex items-start gap-2 py-2 border-b border-brand-border last:border-0"
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
        className={`w-4 shrink-0 leading-none text-text-light text-center text-base opacity-60 group-hover:opacity-100 transition-opacity mt-1 ${draggable ? 'cursor-grab' : ''}`}
        title={draggable ? 'Drag to reorder' : undefined}
      >
        {draggable ? '⠿' : ''}
      </span>
      <span className="flex-1 min-w-0 break-words">{title}</span>
      <div className="flex items-center gap-2 shrink-0 mt-1">
        {chips}
        {primaryAction}
        <TaskAvatar name={assigneeName} />
        {menu && (
          <div className="opacity-60 group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100 transition-opacity">
            {menu}
          </div>
        )}
      </div>
    </li>
  )
}

type TimelineData = InferRouterOutputs<AppRouter>['projects']['listTasks']

/**
 * The Timeline tab. Splits the project's tasks into those placed on the calendar and those
 * still unscheduled (no dates, no predecessor): the first render as a draggable Gantt chart,
 * the rest as a tray. Clicking a bar opens a panel with the same edits, for keyboard users.
 */
function TaskTimeline({
  timeline,
  projectId,
  loading,
  canAssignTasks,
  canClaimTasks,
  assignOptions,
  onAssignTask,
  onClaimTask,
  onUnassignTask,
}: {
  timeline: TimelineData | undefined
  projectId: number
  loading: boolean
  canAssignTasks: boolean
  canClaimTasks: boolean
  assignOptions: { value: string; label: string; header?: boolean }[]
  onAssignTask: (taskId: number, volunteerId: number) => void
  onClaimTask: (taskId: number) => void
  onUnassignTask: (taskId: number) => void
}) {
  const queryClient = useQueryClient()
  const showToast = useToast()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.projects.listTasks.key() })

  const onErr = (verb: string) => (err: unknown) =>
    showToast(err instanceof Error ? err.message : `Failed to ${verb}`, 'error')

  // The exact key the timeline query writes to, so the optimistic patch lands on the same entry.
  const timelineKey = orpc.projects.listTasks.queryOptions({ input: { projectId } }).queryKey

  const reschedule = useMutation({
    ...orpc.schedule.rescheduleItems.mutationOptions(),
    // Place the drag immediately, using the same scheduler the server will run. Without this the
    // bar snaps back the instant the pointer is released and only jumps forward on the refetch.
    onMutate: async (vars: {
      items: { id: number; startDate: Date | null; durationDays?: number | null }[]
    }) => {
      await queryClient.cancelQueries({ queryKey: timelineKey })
      const previous = queryClient.getQueryData<TimelineData>(timelineKey)
      if (!previous) return { previous }

      const patched = previous.tasks.map((t) => {
        const patch = vars.items.find((i) => i.id === t.id)
        if (!patch) return t
        return {
          ...t,
          startDate: patch.startDate,
          ...(patch.durationDays !== undefined ? { durationDays: patch.durationDays } : {}),
        }
      })
      const scheduled = scheduleWithPatches(
        previous.tasks,
        previous.dependencies,
        previous.scopeOrigin,
        vars.items,
      )
      const starts = scheduled.map((s) => s.start.getTime())
      const ends = scheduled.map((s) => s.end.getTime())

      queryClient.setQueryData<TimelineData>(timelineKey, {
        ...previous,
        tasks: patched,
        scheduled,
        // The axis has to grow with a bar dragged past either end of the old scope.
        scopeStart: new Date(Math.min(...starts, new Date(previous.scopeOrigin).getTime())),
        scopeEnd: new Date(Math.max(...ends)),
      } as TimelineData)

      return { previous }
    },
    onError: (err: unknown, _vars, context) => {
      // The server refused the move, so the bar belongs back where it was.
      if (context?.previous) queryClient.setQueryData(timelineKey, context.previous)
      onErr('reschedule')(err)
    },
    onSettled: () => void invalidate(),
  })
  const addDep = useMutation({
    ...orpc.dependencies.add.mutationOptions(),
    onSuccess: () => {
      showToast('Dependency added', 'success')
      void invalidate()
    },
    onError: onErr('add dependency'),
  })
  const removeDep = useMutation({
    ...orpc.dependencies.remove.mutationOptions(),
    onSuccess: () => void invalidate(),
    onError: onErr('remove dependency'),
  })
  const updateLag = useMutation({
    ...orpc.dependencies.updateLag.mutationOptions(),
    onSuccess: () => void invalidate(),
    onError: onErr('update lag'),
  })
  const setAnchor = useMutation({
    ...orpc.projects.updateTask.mutationOptions(),
    onSuccess: () => void invalidate(),
    onError: onErr('update the anchor'),
  })

  if (loading || !timeline) {
    return <p className="text-text-light">Loading timeline…</p>
  }
  if (timeline.tasks.length === 0) {
    return <p className="text-text-light">No tasks yet.</p>
  }

  const canManage = timeline.canManageTasks
  const placementById = new Map(timeline.scheduled.map((p) => [p.id, p]))
  const hasPredecessor = new Set(timeline.dependencies.map((d) => d.successorId))
  const titleById = new Map(timeline.tasks.map((t) => [t.id, t.title]))

  const scheduledRows: GanttRowData[] = []
  const unscheduled: { id: number; title: string }[] = []
  for (const task of timeline.tasks) {
    const isUnscheduled =
      task.startDate === null && task.durationDays === null && !hasPredecessor.has(task.id)
    const placement = placementById.get(task.id)
    if (isUnscheduled || !placement) {
      unscheduled.push({ id: task.id, title: task.title })
    } else {
      scheduledRows.push({
        id: task.id,
        label: task.title,
        href: `/projects/${projectId}/tasks/${task.id}`,
        status: task.status,
        placement,
      })
    }
  }

  const selectedRow = scheduledRows.find((r) => r.id === selectedId) ?? null
  const selectedTask = selectedRow
    ? (timeline.tasks.find((t) => t.id === selectedRow.id) ?? null)
    : null
  /**
   * An unscheduled task has no bar, so there is nothing to drag — this is the way onto the
   * chart. It lands as a one-day bar at the start of the plan rather than anywhere cleverer:
   * a guessed duration looks like a decision someone made, and stacking them all on the same
   * day makes it obvious they still need placing.
   */
  function addToTimeline(ids: number[]) {
    const start = startOfUtcDay(new Date(timeline!.scopeOrigin))
    reschedule.mutate({ items: ids.map((id) => ({ id, startDate: start, durationDays: 1 })) })
  }

  function addAllToTimeline() {
    addToTimeline(unscheduled.map((t) => t.id))
  }

  const busy =
    reschedule.isPending ||
    addDep.isPending ||
    removeDep.isPending ||
    updateLag.isPending ||
    setAnchor.isPending

  return (
    <div>
      {scheduledRows.length === 0 ? (
        <p className="text-text-light mb-4">
          No tasks have dates yet. Add them to the timeline below, then drag each bar to when it
          happens — or set a start date on an individual task from its own page.
        </p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1">
            <GanttChart
              rows={scheduledRows}
              edges={timeline.dependencies}
              rangeStart={new Date(timeline.scopeStart)}
              rangeEnd={new Date(timeline.scopeEnd)}
              editable={canManage}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              onReschedule={(patch) =>
                reschedule.mutate({
                  items: [
                    {
                      id: patch.id,
                      startDate: patch.startDate,
                      ...(patch.durationDays !== undefined
                        ? { durationDays: patch.durationDays }
                        : {}),
                    },
                  ],
                })
              }
              onLink={(predecessorId, successorId) =>
                addDep.mutate({ predecessorId, successorId, lagDays: 0 })
              }
              onUnlink={(dependencyId) => removeDep.mutate({ dependencyId })}
              busy={busy}
            />
          </div>

          {/* Sticky so the panel stays beside the bars on a long chart rather than scrolling off
              the top; it gets its own scrollbar if the contents outgrow the viewport. */}
          {selectedRow && selectedTask && (
            <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-96 lg:shrink-0 lg:self-start lg:overflow-y-auto">
              <GanttItemPanel
                row={selectedRow}
                startDate={selectedTask.startDate ? new Date(selectedTask.startDate) : null}
                durationDays={selectedTask.durationDays}
                description={selectedTask.description}
                assigneeName={selectedTask.assignedToName}
                deadline={selectedTask.deadline}
                estimatedHours={selectedTask.estimatedHours}
                canManage={canManage}
                busy={busy}
                siblings={timeline.tasks.map((t) => ({ id: t.id, title: t.title }))}
                predecessors={timeline.dependencies
                  .filter((d) => d.successorId === selectedRow.id)
                  .map((d) => ({
                    dependencyId: d.id,
                    predecessorId: d.predecessorId,
                    predecessorTitle: titleById.get(d.predecessorId) ?? `#${d.predecessorId}`,
                    lagDays: d.lagDays,
                  }))}
                onClose={() => setSelectedId(null)}
                onSaveDates={(p) =>
                  reschedule.mutate({
                    items: [
                      { id: selectedRow.id, startDate: p.startDate, durationDays: p.durationDays },
                    ],
                  })
                }
                onAddDependency={(predecessorId, lagDays) =>
                  addDep.mutate({ predecessorId, successorId: selectedRow.id, lagDays })
                }
                onRemoveDependency={(dependencyId) => removeDep.mutate({ dependencyId })}
                onUpdateLag={(dependencyId, lagDays) => updateLag.mutate({ dependencyId, lagDays })}
                onSetAnchor={(isAnchor) =>
                  setAnchor.mutate({ projectId, taskId: selectedRow.id, data: { isAnchor } })
                }
                assignment={{
                  canAssign: canAssignTasks,
                  // Claiming is only offered while the task is genuinely free.
                  canClaim: canClaimTasks && selectedTask.assignedToId === null,
                  options: assignOptions,
                  onAssign: (volunteerId) => onAssignTask(selectedRow.id, volunteerId),
                  onClaim: () => onClaimTask(selectedRow.id),
                  onUnassign: () => onUnassignTask(selectedRow.id),
                }}
              />
            </div>
          )}
        </div>
      )}

      {unscheduled.length > 0 && (
        <section
          aria-labelledby="unscheduled-tasks"
          className="border-brand-border mt-4 rounded-lg border border-dashed p-3"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="unscheduled-tasks" className="m-0 text-sm font-medium">
              Unscheduled ({unscheduled.length})
            </h3>
            {canManage && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={addAllToTimeline}>
                Add all to timeline
              </Button>
            )}
          </div>
          <p className="text-text-light mt-0 mb-2 text-xs">
            {canManage
              ? 'Adding a task puts a one-day bar at the start of the plan. Drag it to when it happens, drag its edge to set how long it takes, and drag the circle at its end onto whatever follows it.'
              : 'These tasks have no dates yet, so they are not on the timeline.'}
          </p>
          <ul className="m-0 flex flex-wrap gap-2 p-0">
            {unscheduled.map((t) => (
              <li
                key={t.id}
                className="border-brand-border bg-brand-bg flex items-center gap-1 rounded border px-2 py-1 text-sm"
              >
                <Link href={`/projects/${projectId}/tasks/${t.id}`} className="hover:underline">
                  {t.title}
                </Link>
                {canManage && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addToTimeline([t.id])}
                    aria-label={`Add ${t.title} to the timeline`}
                    title="Add to the timeline"
                    className="text-primary-text ml-1 rounded px-1 leading-none hover:underline"
                  >
                    + Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useRequireApproved()
  const queryClient = useQueryClient()

  const showToast = useToast()

  // Task section
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [newTaskEstimatedHours, setNewTaskEstimatedHours] = useState('')
  const [newTaskDeadline, setNewTaskDeadline] = useState('')
  const [newTaskStartDate, setNewTaskStartDate] = useState('')
  const [newTaskDurationDays, setNewTaskDurationDays] = useState('')
  const [newTaskFeatured, setNewTaskFeatured] = useState(false)
  const [orderedTasks, setOrderedTasks] = useState<ProjectTask[]>([])
  const [taskView, setTaskView] = useState<'list' | 'timeline'>('list')

  /**
   * The open tab lives in the URL hash, so `#timeline` is a shareable link straight to the
   * chart and the browser's Back button steps between the two views. The hash is read after
   * mount rather than in the initial state, because the server render cannot see it.
   */
  useEffect(() => {
    const readHash = () => {
      setTaskView(window.location.hash === '#timeline' ? 'timeline' : 'list')
    }
    readHash()
    window.addEventListener('popstate', readHash)
    window.addEventListener('hashchange', readHash)
    return () => {
      window.removeEventListener('popstate', readHash)
      window.removeEventListener('hashchange', readHash)
    }
  }, [])

  function selectTaskView(next: 'list' | 'timeline') {
    if (next === taskView) return
    setTaskView(next)
    // pushState rather than assigning location.hash: it adds the history entry without the
    // browser trying to scroll to an element named "timeline".
    const url =
      next === 'timeline' ? '#timeline' : `${window.location.pathname}${window.location.search}`
    window.history.pushState(null, '', url)
  }
  const [taskAssignSelections, setTaskAssignSelections] = useState<Record<number, string>>({})
  const [showBaselineDialog, setShowBaselineDialog] = useState(false)
  const [showPorting, setShowPorting] = useState(false)
  const taskDragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // Status section
  const [newStatus, setNewStatus] = useState('')
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)

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

  // Decline interest
  const [declineInterestId, setDeclineInterestId] = useState<number | null>(null)
  const [declineMessage, setDeclineMessage] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: projectRaw, isPending: loadingProject } = useQuery({
    ...orpc.projects.getById.queryOptions({ input: { id: parseInt(idParam, 10) } }),
    enabled: !!user,
  })
  const project = projectRaw
  const canClaimTasks = project?.canClaimTasks ?? false

  // Only loaded once the Timeline tab is opened — it carries the computed schedule and the
  // dependency edges the List view doesn't need.
  const { data: timeline } = useQuery({
    ...orpc.projects.listTasks.queryOptions({ input: { projectId: parseInt(idParam, 10) } }),
    enabled: !!user && !!project && taskView === 'timeline',
  })

  const setBaselineMutation = useMutation({
    ...orpc.projects.setBaseline.mutationOptions(),
    onSuccess: () => {
      showToast('Baseline updated', 'success')
      setShowBaselineDialog(false)
      void queryClient.invalidateQueries({ queryKey: orpc.projects.listTasks.key() })
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to update baseline', 'error'),
  })

  // The most recent baseline capture across the project's tasks — null until one is set.
  const baselineSetAt = (timeline?.tasks ?? []).reduce<Date | null>((latest, t) => {
    if (!t.baselineSetAt) return latest
    const at = new Date(t.baselineSetAt)
    return latest === null || at.getTime() > latest.getTime() ? at : latest
  }, null)
  const datedTaskCount = (timeline?.tasks ?? []).filter(
    (t) => t.startDate !== null || t.durationDays !== null,
  ).length

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

  // Redirect to the project list if project not found
  useEffect(() => {
    if (!loadingProject && !project && user) {
      router.replace('/projects')
    }
  }, [loadingProject, project, user, router])

  // A draft has no read-only view of its own — everything happens on its edit page.
  useEffect(() => {
    if (project?.status === 'draft') {
      router.replace(`/projects/${idParam}/edit`)
    }
  }, [project?.status, idParam, router])

  const { data: volunteersData } = useQuery({
    ...orpc.volunteers.list.queryOptions({ input: { limit: 100 } }),
    enabled: !!project && (!!user?.isAdmin || project.ownerId === user?.id),
  })
  const volunteers = volunteersData?.volunteers ?? []

  const ownerId = project?.ownerId ?? null
  const { data: ownerContactData } = useQuery({
    ...orpc.volunteers.getById.queryOptions({ input: { id: ownerId ?? 0 } }),
    enabled: ownerId !== null && showContactModal,
  })
  const ownerContact = ownerContactData

  // ── Mutations ────────────────────────────────────────────────────────────

  // Task writes change both the list view (getById) and the timeline (listTasks); the panel
  // on the Timeline tab reads assignment from the latter, so both are refreshed together.
  const invalidateProject = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.projects.listTasks.key() }),
    ])

  const createTaskMutation = useMutation({
    ...orpc.projects.createTask.mutationOptions(),
    onSuccess: () => {
      setNewTaskTitle('')
      setNewTaskDescription('')
      setNewTaskEstimatedHours('')
      setNewTaskDeadline('')
      setNewTaskFeatured(false)
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
      } else if (variables.data.status === TaskStatus.open) {
        showToast('Task unassigned!', 'success')
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
      setDeclineInterestId(null)
      setDeclineMessage('')
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

  function handleContactOwner(e: React.FormEvent, ownerId: number) {
    e.preventDefault()
    sendMessageMutation.mutate({
      recipientId: ownerId,
      subject: contactSubject.trim(),
      message: contactBody.trim(),
      relatedProjectId: parseInt(idParam, 10),
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
  if (project.status === 'draft') return null

  const isOwner = project.ownerId !== null && project.ownerId === user.id
  const isAdmin = user.isAdmin
  // Org-proposed projects are attributed to the org, not to the admin who filed them.
  const proposer = proposerDisplay(project)
  const isOwnerOrAdmin = isOwner || isAdmin
  // A draft has no owner yet, so its creator manages its own tasks until they publish it.
  const canManageTasks =
    isOwnerOrAdmin || (project.status === 'draft' && project.proposedById === user.id)
  // Members (accepted helpers / team members) may add tasks even though they can't manage
  // the project's schedule/baseline — server-computed in getById, see canCreateProjectTask.
  const canCreateTasks = canManageTasks || project.canCreateTasks

  const canSeeInterest =
    !isOwnerOrAdmin &&
    (project.isSeekingHelp || project.isSeekingOwner) &&
    !TERMINAL_STATUSES.includes(project.status)

  const pickableStatuses = isAdmin ? [...OWNER_STATUSES, ...ADMIN_EXTRA_STATUSES] : OWNER_STATUSES
  // Every status is pickable by someone now, but an owner viewing a project an admin put
  // into an admin-only status still needs the control to show its real current value.
  const statusOptions = pickableStatuses.some((o) => o.value === project.status)
    ? pickableStatuses
    : [{ value: project.status, label: projectStatusLabel(project.status) }, ...pickableStatuses]
  // newStatus is synced from the project in an effect, so it is empty for the first render.
  const shownStatus = newStatus || project.status

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
      description: newTaskDescription.trim() || undefined,
      estimatedHours: newTaskEstimatedHours ? parseFloat(newTaskEstimatedHours) : null,
      deadline: fromDateInputValue(newTaskDeadline),
      startDate: fromDateInputValue(newTaskStartDate),
      durationDays: newTaskDurationDays ? parseInt(newTaskDurationDays, 10) : null,
      featuredAsQuickTask: newTaskFeatured,
    })
  }

  function handleAssignTask(taskId: number) {
    assignTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      taskId,
      assigneeId: parseInt(taskAssignSelections[taskId], 10),
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

  function handleUnassignTask(taskId: number) {
    updateTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      taskId,
      data: { status: TaskStatus.open },
    })
  }

  function handleDeleteTask(taskId: number) {
    if (!window.confirm('Delete this task?')) return
    deleteTaskMutation.mutate({ projectId: parseInt(idParam, 10), taskId })
  }

  function handleSelectStatus(value: string) {
    const validStatuses = Object.values(ProjectStatus)
    const status = validStatuses.find((s) => s === value)
    if (!status || status === newStatus) return
    setPendingStatus(status)
  }

  function handleConfirmStatus(status: NonNullable<typeof pendingStatus>) {
    updateProjectMutation.mutate({ id: parseInt(idParam, 10), status })
    setNewStatus(status)
    setPendingStatus(null)
  }

  function handleExpressInterest(e: React.FormEvent) {
    e.preventDefault()
    expressInterestMutation.mutate({
      projectId: parseInt(idParam, 10),
      interestType: interestType as 'want_to_contribute' | 'want_to_own',
      message: interestMessage.trim() || null,
    })
  }

  function handleWithdrawInterest(isAccepted: boolean) {
    const message = isAccepted
      ? 'Withdraw from this project? Any tasks you hold on it will be released back to open.'
      : 'Withdraw your interest?'
    if (!window.confirm(message)) return
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
    setDeclineInterestId(interestId)
    setDeclineMessage('')
  }

  function confirmDeclineInterest(e: React.FormEvent, interestId: number) {
    e.preventDefault()
    respondToInterestMutation.mutate({
      projectId: parseInt(idParam, 10),
      interestId,
      status: 'declined',
      responseMessage: declineMessage.trim() || null,
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
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasDirectContact =
    ownerContact &&
    (ownerContact.discordHandle || ownerContact.signalNumber || ownerContact.whatsappNumber)

  return (
    <>
      {/* The timeline wants every pixel it can get, so the page drops its reading-width cap
          while that tab is open. Prose tabs keep the narrower measure. */}
      <main className={`${taskView === 'timeline' ? 'container-wide' : 'container'} py-5 pb-15`}>
        {/* [test hook] projectContent id used by action helpers to confirm page has loaded */}
        <h1 id="projectContent" role="heading" aria-level={1}>
          {project.title}
        </h1>

        {/* The sidebar is a third of the page normally. On the Timeline the page goes full
            width, where a third would be a huge column of unchanged detail — so it keeps roughly
            the pixel width it has in the List view and gives the rest to the chart. */}
        <div
          className={`grid grid-cols-1 gap-4 items-start ${
            taskView === 'timeline' ? 'lg:grid-cols-[minmax(0,1fr)_420px]' : 'lg:grid-cols-3'
          }`}
        >
          {/* Main column */}
          <div className={`min-w-0 ${taskView === 'timeline' ? '' : 'lg:col-span-2'}`}>
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
                      </span>
                    ))}
                  </div>
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
                <div className="flex items-center gap-2">
                  {taskView === 'timeline' && canManageTasks && (
                    <>
                      {baselineSetAt && (
                        <span className="text-text-light text-xs">
                          Baseline set {formatDateShort(baselineSetAt)}
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={setBaselineMutation.isPending}
                        onClick={() => setShowBaselineDialog(true)}
                      >
                        {baselineSetAt ? 'Re-baseline' : 'Set baseline'}
                      </Button>
                    </>
                  )}
                  {canCreateTasks && (
                    <Button variant="secondary" onClick={() => setShowTaskForm((v) => !v)}>
                      Add Task
                    </Button>
                  )}
                </div>
              </div>

              <Tabs
                className="mb-4"
                tabs={[
                  { key: 'list', label: 'List' },
                  { key: 'timeline', label: 'Timeline' },
                ]}
                activeTab={taskView}
                onChange={(k) => selectTaskView(k as 'list' | 'timeline')}
              />

              {showTaskForm && canCreateTasks && (
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
                    <div className="mb-3">
                      <label htmlFor="new-task-description">Description</label>
                      <textarea
                        id="new-task-description"
                        aria-label="Description"
                        rows={3}
                        value={newTaskDescription}
                        onChange={(e) => setNewTaskDescription(e.target.value)}
                        placeholder="Add any context, examples, or guidelines…"
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
                      <div>
                        <label htmlFor="new-task-start">Start date</label>
                        <input
                          id="new-task-start"
                          type="date"
                          aria-label="Start date"
                          value={newTaskStartDate}
                          onChange={(e) => setNewTaskStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="new-task-duration">Duration (days)</label>
                        <input
                          id="new-task-duration"
                          type="number"
                          min="1"
                          step="1"
                          aria-label="Duration (days)"
                          value={newTaskDurationDays}
                          onChange={(e) => setNewTaskDurationDays(e.target.value)}
                          placeholder="e.g. 5"
                          className="w-30"
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <Checkbox
                        checked={newTaskFeatured}
                        onChange={(e) => setNewTaskFeatured(e.target.checked)}
                      >
                        Add this task to the Quick Tasks page so volunteers can find and claim it
                        without first clicking into this project
                      </Checkbox>
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

              {taskView === 'timeline' && (
                <TaskTimeline
                  timeline={timeline}
                  projectId={parseInt(idParam, 10)}
                  loading={!timeline}
                  canAssignTasks={canManageTasks}
                  canClaimTasks={canClaimTasks}
                  assignOptions={assignVolunteerOptions}
                  onAssignTask={(taskId, volunteerId) =>
                    assignTaskMutation.mutate({
                      projectId: parseInt(idParam, 10),
                      taskId,
                      assigneeId: volunteerId,
                    })
                  }
                  onClaimTask={handleClaimTask}
                  onUnassignTask={handleUnassignTask}
                />
              )}

              {taskView === 'list' &&
                (orderedTasks.length === 0 ? (
                  <p className="text-text-light">No tasks yet.</p>
                ) : (
                  <DndContext
                    sensors={taskDragSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={canManageTasks ? handleTaskDragEnd : undefined}
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
                          const canUnassign =
                            isOwnerOrAdmin &&
                            task.assignedToId !== null &&
                            task.status === TaskStatus.in_progress

                          return (
                            <SortableTaskItem
                              key={task.id}
                              task={task}
                              draggable={canManageTasks}
                              title={
                                <Link
                                  href={`/projects/${idParam}/tasks/${task.id}`}
                                  className="hover:underline"
                                >
                                  {task.title}
                                </Link>
                              }
                              assigneeName={
                                task.status !== TaskStatus.completed ? task.assignedToName : null
                              }
                              chips={
                                <>
                                  {task.status === TaskStatus.completed && (
                                    <span className="text-success text-sm font-semibold">done</span>
                                  )}
                                  {task.featuredAsQuickTask && (
                                    <span
                                      className="text-xs whitespace-nowrap"
                                      title="Also shown on the Quick Tasks page"
                                    >
                                      ⚡ Quick Task
                                    </span>
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
                                  {task.commentCount > 0 && (
                                    <Link
                                      href={`/projects/${idParam}/tasks/${task.id}`}
                                      className="flex items-center gap-1 text-text-light text-xs whitespace-nowrap hover:underline"
                                      aria-label={`${task.commentCount} comment${task.commentCount !== 1 ? 's' : ''}`}
                                    >
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                      </svg>
                                      {task.commentCount}
                                    </Link>
                                  )}
                                </>
                              }
                              primaryAction={
                                <>
                                  {task.status === TaskStatus.open && canClaimTasks && (
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
                                (canAssign || canManageTasks || task.createdById === user.id) && (
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
                                        {canUnassign && (
                                          <button
                                            role="menuitem"
                                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer ${canAssign ? 'border-t border-brand-border mt-1' : ''}`}
                                            onClick={() => {
                                              handleUnassignTask(task.id)
                                              close()
                                            }}
                                          >
                                            Unassign
                                          </button>
                                        )}
                                        {(canManageTasks || task.createdById === user.id) && (
                                          <button
                                            role="menuitem"
                                            className={`w-full text-left px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-accent transition-colors cursor-pointer ${canAssign || canUnassign ? 'border-t border-brand-border mt-1' : ''}`}
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
                ))}
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
            {/* Status */}
            <div className={card}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="m-0">Status</h2>
                {canManageTasks && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button href={`/projects/${idParam}/edit`} variant="secondary" size="sm">
                      Edit Project
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setShowPorting(true)}>
                      Export / Import
                    </Button>
                    {isAdmin && (
                      <SaveAsTemplateButton projectId={project.id} defaultTitle={project.title} />
                    )}
                  </div>
                )}
              </div>
              {isOwnerOrAdmin ? (
                <FilterDropdown
                  id="change-status"
                  label="Status"
                  ariaLabel="project status"
                  value={shownStatus}
                  options={statusOptions}
                  onChange={handleSelectStatus}
                  triggerClassName={statusTriggerClasses(shownStatus)}
                  renderOption={(opt) => (
                    <span className={badgeClasses(projectStatusVariant(opt.value))}>
                      {opt.label}
                    </span>
                  )}
                  hideLabel
                />
              ) : (
                <Badge variant={projectStatusVariant(project.status)} aria-label="project status">
                  {projectStatusLabel(project.status)}
                </Badge>
              )}
              <div className="flex gap-1 flex-wrap mt-2">
                {project.isSeekingOwner && <Badge variant="caution">Seeking Owner</Badge>}
                {project.isSeekingHelp && <Badge variant="caution">Seeking Help</Badge>}
                {project.needsTasks && <Badge variant="warning">Needs Tasks</Badge>}
              </div>
              {(() => {
                const parts = projectLocationParts(
                  project.country,
                  project.localGroup,
                  project.remoteEligibility,
                )
                return (
                  parts.length > 0 && (
                    <p className="text-sm text-text-light mt-3 mb-0">📍 {parts.join(' · ')}</p>
                  )
                )
              })()}
              {project.team && (
                <p className="text-sm text-text-light mt-1 mb-0">🧑‍🤝‍🧑 {project.team.name}</p>
              )}
              {pendingStatus !== null && (
                <Modal
                  id="confirm-status-change"
                  title="Change project status?"
                  isOpen
                  onClose={() => setPendingStatus(null)}
                >
                  <p>
                    Change status from <strong>{projectStatusLabel(newStatus)}</strong> to{' '}
                    <strong>{projectStatusLabel(pendingStatus)}</strong>?
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setPendingStatus(null)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleConfirmStatus(pendingStatus)}
                      disabled={updateProjectMutation.isPending}
                    >
                      {updateProjectMutation.isPending ? 'Updating…' : 'Confirm'}
                    </Button>
                  </div>
                </Modal>
              )}

              {/* Ownership — same panel as Status/Team above */}
              <div className="mt-4 pt-4 border-t border-brand-border">
                <h2>Owner</h2>
                <div className="flex items-center justify-between gap-2">
                  {project.owner ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <TaskAvatar name={project.owner.name} />
                      <Link href={`/volunteers/${project.owner.id}`} className="underline truncate">
                        {project.owner.name}
                      </Link>
                    </div>
                  ) : isAdmin && proposer ? (
                    // Ownerless projects still have a proposer. Admins triaging the queue need
                    // to know who to talk to, so show them that name in place of the empty state.
                    <div className="flex items-center gap-2 min-w-0">
                      <TaskAvatar name={proposer.name} />
                      <span className="truncate">
                        Proposer:{' '}
                        {proposer.volunteerId ? (
                          <Link href={`/volunteers/${proposer.volunteerId}`} className="underline">
                            {proposer.name}
                          </Link>
                        ) : (
                          proposer.name
                        )}
                      </span>
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
                            <VolunteerSelect
                              id="transfer-to"
                              label="Transfer to"
                              ariaLabel="Transfer to"
                              value={transferTo}
                              onChange={(v) => setTransferTo(v)}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!transferTo || updateProjectMutation.isPending}
                              onClick={() => {
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

                {!isOwnerOrAdmin && canCreateTasks && Array.isArray(project.helpers) && (
                  <div className="mt-4 pt-4 border-t border-brand-border">
                    <h3 className="text-sm mb-2">Volunteers</h3>
                    {project.helpers.length === 0 ? (
                      <p className="text-text-light text-sm">No helpers yet.</p>
                    ) : (
                      <ul className="list-none p-0 m-0">
                        {project.helpers.map((helper) => (
                          <li
                            key={helper.id}
                            className="interest-card flex items-center gap-2 py-2 border-b border-brand-border last:border-0 flex-wrap"
                          >
                            <TaskAvatar name={helper.volunteerName} />
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{helper.volunteerName}</div>
                              <div className="text-text-light text-xs">
                                {helper.interestType === 'want_to_own' ? 'Owner' : 'Helper'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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
                              {isAdmin || interestedVolunteerIds.has(interest.volunteerId) ? (
                                <Link
                                  href={`/volunteers/${interest.volunteerId}`}
                                  className="underline truncate block"
                                >
                                  {interest.volunteerName}
                                </Link>
                              ) : (
                                <div className="truncate">{interest.volunteerName}</div>
                              )}
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
                                  {INTEREST_STATUS_LABELS[interest.status] ?? interest.status}
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
                                {INTEREST_STATUS_LABELS[interest.status] ?? interest.status}
                              </Badge>
                            )}
                            {interest.message && interest.status !== InterestStatus.accepted && (
                              <p className="text-sm text-text-light w-full m-0">
                                {interest.message}
                              </p>
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
                          <VolunteerSelect
                            id="assign-volunteer"
                            label=""
                            ariaLabel="Volunteer to assign"
                            value={assignTo}
                            onChange={(v) => setAssignTo(v)}
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
            </div>

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
                        {INTEREST_STATUS_LABELS[project.myInterest.status] ??
                          project.myInterest.status}
                      </span>
                    </p>
                    {project.myInterest.responseMessage && (
                      <p className="text-text-light text-sm">
                        {project.myInterest.responseMessage}
                      </p>
                    )}
                    {(project.myInterest.status === InterestStatus.pending ||
                      project.myInterest.status === InterestStatus.accepted) && (
                      <Button
                        variant="secondary"
                        className="mt-2"
                        onClick={() =>
                          handleWithdrawInterest(
                            project.myInterest?.status === InterestStatus.accepted,
                          )
                        }
                      >
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

      <Modal
        id="project-porting"
        title="Export and import"
        size="wide"
        isOpen={showPorting}
        onClose={() => setShowPorting(false)}
      >
        <ProjectPorting projectId={parseInt(idParam, 10)} onDone={() => setShowPorting(false)} />
      </Modal>

      <BaselineDialog
        isOpen={showBaselineDialog}
        existingSetAt={baselineSetAt}
        taskCount={datedTaskCount}
        busy={setBaselineMutation.isPending}
        onClose={() => setShowBaselineDialog(false)}
        onConfirm={() =>
          setBaselineMutation.mutate({
            projectId: parseInt(idParam, 10),
            includeTasks: true,
          })
        }
      />

      {/* Contact Owner modal */}
      {showContactModal && ownerId !== null && (
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

              <form onSubmit={(e) => handleContactOwner(e, ownerId)}>
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

      {/* Decline interest modal */}
      {declineInterestId !== null && (
        <Modal
          id="decline-interest"
          title="Decline Volunteer"
          isOpen
          onClose={() => setDeclineInterestId(null)}
        >
          <form onSubmit={(e) => confirmDeclineInterest(e, declineInterestId)}>
            <div className="mb-5">
              <label htmlFor="decline-message">Optional message for the volunteer</label>
              <textarea
                id="decline-message"
                rows={4}
                value={declineMessage}
                onChange={(e) => setDeclineMessage(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setDeclineInterestId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={respondToInterestMutation.isPending}>
                {respondToInterestMutation.isPending ? 'Declining…' : 'Decline'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
