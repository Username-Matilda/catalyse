'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferRouterInputs } from '@orpc/server'
import { useRequireAuth } from '@/lib/hooks/auth'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import Radio from '@/components/Radio'
import FilterDropdown from '@/components/FilterDropdown'
import DescriptionTips from '@/components/DescriptionTips'
import SkillPicker from '@/components/SkillPicker'
import Modal from '@/components/ui/Modal'
import { buildLocationOptions, type LocalGroupOption } from '@/lib/filter-options'
import { useToast } from '@/lib/toast'
import { useCookieConsent } from '@/lib/cookie-consent-context'
import { orpc } from '@/lib/orpc'
import type { AppRouter } from '@/server/router'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low - Nice to have' },
  { value: 'medium', label: 'Medium - Should do soon' },
  { value: 'high', label: 'High - Urgent / time-sensitive' },
]

const PROJECT_TYPES = [
  { value: '', label: 'Select a project type…' },
  { value: 'sprint', label: 'Sprint (1-2 weeks) - Focused burst of work with clear deliverable' },
  { value: 'container', label: 'Time-boxed (1-3 months) - Defined scope with end date' },
  { value: 'ongoing', label: 'Ongoing - Continuous work without fixed end date' },
  { value: 'one_off', label: 'One-off task - Single deliverable, minimal coordination' },
]

const REMOTE_ELIGIBILITY_OPTIONS = [
  { value: 'NONE', label: 'No - in-person / local only' },
  { value: 'COUNTRY', label: 'Yes - remote OK, within the same country' },
  { value: 'GLOBAL', label: 'Yes - remote OK, from any country' },
]

type CreateProjectInput = InferRouterInputs<AppRouter>['projects']['create']
type UpdateProjectInput = InferRouterInputs<AppRouter>['projects']['update']
type FieldPatch = Partial<Omit<UpdateProjectInput, 'id'>>

type ProjectEditorProps =
  | { projectId: number; variant?: undefined; onCancel?: never }
  | { projectId?: undefined; variant: 'volunteer' | 'admin'; onCancel?: () => void }

export default function ProjectEditor(props: ProjectEditorProps) {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useRequireAuth()
  const { bannerVisible } = useCookieConsent()

  // Which variant created this screen — only meaningful before a project id exists, to
  // pick the create endpoint and review-notice wording. Once an id exists (from the
  // start, or from a lazy create below), org-ness comes from the loaded project instead.
  const initialVariant = props.projectId === undefined ? props.variant : undefined

  const [projectId, setProjectId] = useState<number | undefined>(props.projectId)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [canEdit, setCanEdit] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showDeleteDraftModal, setShowDeleteDraftModal] = useState(false)
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [taskDrafts, setTaskDrafts] = useState<
    Record<number, { title: string; description: string }>
  >({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [locationValue, setLocationValue] = useState('') // 'UK' or 'UK:London'
  const [teamId, setTeamId] = useState('')
  const [remoteEligibility, setRemoteEligibility] = useState<'NONE' | 'COUNTRY' | 'GLOBAL'>('NONE')
  const [duration, setDuration] = useState('')
  const [collaborationLink, setCollaborationLink] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [seekingHelp, setSeekingHelp] = useState(true)
  const [wantToOwn, setWantToOwn] = useState(false)

  const { data: localGroupsData } = useQuery(orpc.localGroups.list.queryOptions({ input: {} }))
  const allLocalGroups: LocalGroupOption[] = localGroupsData?.groups ?? []

  const { data: teamsData } = useQuery(orpc.teams.list.queryOptions())
  const teams = teamsData?.teams ?? []

  const { data: projectData, isPending: loadingProject } = useQuery({
    ...orpc.projects.getById.queryOptions({ input: { id: projectId ?? 0 } }),
    enabled: !!user && projectId !== undefined,
  })

  const isDraft = projectId === undefined ? true : projectData?.status === 'draft'
  const isOrgDraft =
    projectId === undefined ? initialVariant === 'admin' : projectData?.isOrgProposed === true

  useEffect(() => {
    if (!projectData || initialized) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true)
    const data = projectData
    setTitle(data.title)
    setDescription(data.description ?? '')
    setCollaborationLink(data.collaborationLink ?? '')
    setSkills((data.skills ?? []).map((s) => ({ skillId: s.id, proficiencyLevel: 'intermediate' })))
    setProjectType(data.projectType ?? '')
    setHoursPerWeek(data.timeCommitmentHoursPerWeek?.toString() ?? '')
    setUrgency(data.urgency ?? 'medium')
    const country = data.country ?? ''
    const localGroup = data.localGroup ?? ''
    setLocationValue(country && localGroup ? `${country}:${localGroup}` : country)
    setTeamId(data.teamId ? String(data.teamId) : '')
    setRemoteEligibility(data.remoteEligibility ?? 'NONE')
    setDuration(data.estimatedDuration ?? '')
    setSeekingHelp(data.isSeekingHelp ?? false)
    setWantToOwn(data.ownerId === user?.id)
    const isOwner = data.ownerId === user?.id || data.proposedById === user?.id
    setCanEdit(isOwner || (user?.isAdmin ?? false))
    setPermissionChecked(true)
  }, [projectData, initialized, user])

  // Seeds local editable copies of each task, without clobbering one mid-edit — a task
  // added or deleted elsewhere (or a save round-tripping through the server) should show
  // up or disappear, but a field the volunteer is still typing into shouldn't reset.
  useEffect(() => {
    if (!projectData?.tasks) return
    const tasks = projectData.tasks
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTaskDrafts((prev) => {
      const next: typeof prev = {}
      for (const t of tasks) {
        next[t.id] = prev[t.id] ?? { title: t.title, description: t.description ?? '' }
      }
      return next
    })
  }, [projectData?.tasks])

  const volunteerCreateMutation = useMutation(orpc.projects.create.mutationOptions())
  const adminCreateMutation = useMutation(orpc.admin.projects.create.mutationOptions())

  const updateMutation = useMutation({
    ...orpc.projects.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to save changes', 'error')
    },
  })

  const deleteMutation = useMutation({
    ...orpc.projects.delete.mutationOptions(),
    onSuccess: () => router.push('/projects'),
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to delete project', 'error')
      setShowDeleteProjectModal(false)
    },
  })

  const publishMutation = useMutation({
    ...orpc.projects.publishDraft.mutationOptions(),
    // Uses `variables.id` rather than the closed-over `projectId` state — when this
    // mutation follows a same-click lazy create, the id wasn't known yet when this render's
    // callback closures were captured.
    onSuccess: (_data, variables) => {
      toast(isOrgDraft ? 'Project published!' : 'Draft submitted for review!', 'success')
      setShowPublishModal(false)
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
      invalidateMyDrafts()
      const destination = isOrgDraft ? `/projects/${variables.id}` : '/dashboard#tab-proposed'
      setTimeout(() => router.push(destination), 1500)
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to publish draft', 'error')
      setShowPublishModal(false)
    },
  })

  const deleteDraftMutation = useMutation({
    ...orpc.projects.deleteDraft.mutationOptions(),
    onSuccess: () => {
      toast('Draft deleted', 'success')
      invalidateMyDrafts()
      router.push(initialVariant === 'admin' || isOrgDraft ? '/admin/projects' : '/suggest')
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to delete draft', 'error')
      setShowDeleteDraftModal(false)
    },
  })

  const createTaskMutation = useMutation({
    ...orpc.projects.createTask.mutationOptions(),
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to create task', 'error')
    },
  })

  const deleteTaskMutation = useMutation({
    ...orpc.projects.deleteTask.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to delete task', 'error')
    },
  })

  const updateTaskMutation = useMutation({
    ...orpc.projects.updateTask.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to update task', 'error')
    },
  })

  // Drives the fixed autosave indicator — covers the silent field/task-field saves, not
  // create/delete task (those already show their own button-level "Adding…"/disabled state).
  const isSaving = updateMutation.isPending || updateTaskMutation.isPending
  const [showSaved, setShowSaved] = useState(false)
  const wasSavingRef = useRef(false)
  useEffect(() => {
    if (wasSavingRef.current && !isSaving) {
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 2000)
      wasSavingRef.current = isSaving
      return () => clearTimeout(timer)
    }
    wasSavingRef.current = isSaving
  }, [isSaving])

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function fe(field: string) {
    return fieldErrors[field]
  }

  function buildCreatePayload(): CreateProjectInput {
    const [country, localGroup] = locationValue.split(':')
    return {
      title: title.trim(),
      description: description.trim(),
      projectType: projectType || null,
      timeCommitmentHoursPerWeek: hoursPerWeek ? Number(hoursPerWeek) : null,
      urgency,
      country: country || null,
      localGroup: localGroup || null,
      teamId: teamId ? Number(teamId) : null,
      remoteEligibility: remoteEligibility as CreateProjectInput['remoteEligibility'],
      estimatedDuration: duration.trim() || null,
      collaborationLink: collaborationLink.trim() || null,
      skillIds: skills.map((s) => s.skillId),
      skillRequiredMap: Object.fromEntries(skills.map((s) => [s.skillId, true])),
      isSeekingHelp: seekingHelp,
      wantToOwn,
      tasks: [],
      saveAsDraft: true,
    }
  }

  // The /suggest and /admin/projects list pages cache their own "My Drafts" query — stale
  // after this component creates, publishes, or deletes a draft unless told to refetch.
  function invalidateMyDrafts() {
    queryClient.invalidateQueries({ queryKey: orpc.projects.myDrafts.key() })
    queryClient.invalidateQueries({ queryKey: orpc.admin.projects.myDrafts.key() })
  }

  // Creates the project the first time it's needed — on an explicit "Save draft" click, or
  // implicitly when the first task is added (a task needs a parent project id). A no-op
  // once an id already exists.
  async function ensureProjectExists(): Promise<number | null> {
    if (projectId !== undefined) return projectId
    if (!title.trim()) {
      toast('A title is required, even for a draft.', 'error')
      return null
    }
    setCreatingDraft(true)
    try {
      const mutation = initialVariant === 'admin' ? adminCreateMutation : volunteerCreateMutation
      const result = await mutation.mutateAsync(buildCreatePayload())
      setProjectId(result.id)
      invalidateMyDrafts()
      return result.id
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to save draft', 'error')
      return null
    } finally {
      setCreatingDraft(false)
    }
  }

  async function handleSaveDraftClick() {
    const id = await ensureProjectExists()
    if (id !== null) router.replace(`/projects/${id}/edit`)
  }

  function handleOpenPublishModal() {
    if (projectId === undefined && !title.trim()) {
      toast('A title is required, even for a draft.', 'error')
      return
    }
    setShowPublishModal(true)
  }

  // In new mode this lazily creates the draft first (same as Save draft/Add Task), then
  // publishes it immediately — a one-click shortcut past the separate draft-editing step.
  async function handleConfirmPublish() {
    const id = await ensureProjectExists()
    if (id === null) return
    publishMutation.mutate({ id })
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    const wasNew = projectId === undefined
    const id = await ensureProjectExists()
    if (id === null) return
    try {
      await createTaskMutation.mutateAsync({
        projectId: id,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
      })
      setNewTaskTitle('')
      setNewTaskDescription('')
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
      if (wasNew) router.replace(`/projects/${id}/edit`)
    } catch {
      // createTaskMutation's onError already toasted.
    }
  }

  function handleDeleteTask(taskId: number) {
    if (projectId === undefined) return
    if (!window.confirm('Delete this task?')) return
    deleteTaskMutation.mutate({ projectId, taskId })
  }

  // Saves a task's title/description on blur, only if it actually changed from what's
  // currently persisted — otherwise every click into and out of a field would fire a
  // mutation.
  function handleTaskFieldBlur(task: { id: number; title: string; description: string | null }) {
    if (projectId === undefined) return
    const draft = taskDrafts[task.id]
    if (!draft || !draft.title.trim()) return
    const newTitle = draft.title.trim()
    const newDescription = draft.description.trim()
    if (newTitle === task.title && newDescription === (task.description ?? '')) return
    updateTaskMutation.mutate({
      projectId,
      taskId: task.id,
      data: { title: newTitle, description: newDescription || null },
    })
  }

  // Commits a single changed field once a project id exists — a no-op in new mode, where
  // fields just live in local state until the project is created.
  function commitField(patch: FieldPatch) {
    if (projectId === undefined) return
    updateMutation.mutate({ id: projectId, ...patch })
  }

  if (projectId !== undefined && loadingProject) {
    return <div className="text-center py-10 text-text-light">Loading project…</div>
  }

  return (
    <>
      {permissionChecked && !canEdit && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-600"
        >
          You do not have permission to edit this project.
        </div>
      )}

      <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
        <div className="mb-5">
          <label htmlFor="project-title" className="required">
            Project Title
          </label>
          <input
            id="project-title"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              clearFieldError('title')
            }}
            onBlur={() => {
              const next = title.trim()
              if (next === (projectData?.title ?? '')) return
              commitField({ title: next })
            }}
            disabled={!canEdit}
            required
            placeholder="A clear, descriptive name for the project"
            aria-invalid={!!fe('title') || undefined}
          />
          {fe('title') && <p className="text-sm mt-1 text-error">{fe('title')}</p>}
        </div>

        <div className="mb-5">
          <label htmlFor="project-description" className="required">
            Description
          </label>
          <DescriptionTips />
          <textarea
            id="project-description"
            rows={6}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              clearFieldError('description')
            }}
            onBlur={() => {
              const next = description.trim()
              if (next === (projectData?.description ?? '')) return
              commitField({ description: next })
            }}
            disabled={!canEdit}
            required
            placeholder="Describe the project: goals, approach, what success looks like, and what kind of help is needed."
            aria-invalid={!!fe('description') || undefined}
          />
          {fe('description') ? (
            <p className="text-sm mt-1 text-error">{fe('description')}</p>
          ) : (
            <p className="text-sm text-text-light mt-1">
              The more detail you provide, the easier it is to find the right contributors and get
              started.
            </p>
          )}
        </div>

        <div className="mb-5">
          <FilterDropdown
            id="project-type"
            label="Project Type"
            ariaLabel="Select project type"
            value={projectType}
            options={PROJECT_TYPES}
            onChange={(v) => {
              setProjectType(v)
              clearFieldError('project_type')
              commitField({ projectType: v || null })
            }}
          />
          {fe('project_type') ? (
            <p className="text-sm mt-1 text-error">{fe('project_type')}</p>
          ) : (
            <p className="text-sm text-text-light mt-1">
              This helps contributors understand the commitment involved
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-5 mb-5 max-[600px]:grid-cols-1">
          <div>
            <label htmlFor="hours-per-week">Hours per Week</label>
            <input
              id="hours-per-week"
              type="number"
              min={1}
              max={40}
              placeholder="e.g., 5"
              value={hoursPerWeek}
              onChange={(e) => {
                setHoursPerWeek(e.target.value)
                clearFieldError('time_commitment_hours_per_week')
              }}
              onBlur={() => {
                const next = hoursPerWeek ? Number(hoursPerWeek) : null
                if (next === (projectData?.timeCommitmentHoursPerWeek ?? null)) return
                commitField({ timeCommitmentHoursPerWeek: next })
              }}
              disabled={!canEdit}
              aria-invalid={!!fe('time_commitment_hours_per_week') || undefined}
            />
            {fe('time_commitment_hours_per_week') ? (
              <p className="text-sm mt-1 text-error">{fe('time_commitment_hours_per_week')}</p>
            ) : (
              <p className="text-sm text-text-light mt-1">
                Estimated weekly time from each contributor
              </p>
            )}
          </div>

          <div>
            <FilterDropdown
              id="urgency"
              label="Urgency"
              ariaLabel="Select urgency"
              value={urgency}
              options={URGENCY_OPTIONS}
              onChange={(v) => {
                setUrgency(v)
                clearFieldError('urgency')
                commitField({ urgency: v })
              }}
            />
            {fe('urgency') && <p className="text-sm mt-1 text-error">{fe('urgency')}</p>}
          </div>
        </div>

        {['sprint', 'container'].includes(projectType) && (
          <div className="mb-5">
            <label htmlFor="duration">Estimated Duration</label>
            <input
              id="duration"
              type="text"
              placeholder="e.g., 6 weeks, 2 months"
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value)
                clearFieldError('estimated_duration')
              }}
              onBlur={() => {
                const next = duration.trim()
                if (next === (projectData?.estimatedDuration ?? '')) return
                commitField({ estimatedDuration: next })
              }}
              disabled={!canEdit}
              aria-invalid={!!fe('estimated_duration') || undefined}
            />
            {fe('estimated_duration') ? (
              <p className="text-sm mt-1 text-error">{fe('estimated_duration')}</p>
            ) : (
              <p className="text-sm text-text-light mt-1">
                Roughly how long do you expect this to take?
              </p>
            )}
          </div>
        )}

        <div className="mb-5">
          <FilterDropdown
            id="country"
            label="Country/Group"
            ariaLabel="Select country/group"
            value={locationValue}
            options={buildLocationOptions(allLocalGroups)}
            onChange={(v) => {
              setLocationValue(v)
              clearFieldError('country')
              clearFieldError('local_group')
              const [country, localGroup] = v.split(':')
              commitField({ country: country || null, localGroup: localGroup || null })
            }}
            searchable
          />
          {fe('country') || fe('local_group') ? (
            <p className="text-sm mt-1 text-error">{fe('country') ?? fe('local_group')}</p>
          ) : (
            <p className="text-sm text-text-light mt-1">
              Where is this project based? Local groups appear indented under their country.{' '}
              <a href="/suggest-local-group" className="underline">
                Don&apos;t see your group? Suggest one.
              </a>
            </p>
          )}
        </div>

        <div className="mb-5">
          <FilterDropdown
            id="team"
            label="Team"
            ariaLabel="Select team"
            value={teamId}
            options={[
              { value: '', label: 'No team: visible to everyone' },
              ...teams.map((t) => ({ value: String(t.id), label: t.name })),
            ]}
            onChange={(v) => {
              setTeamId(v)
              commitField({ teamId: v ? Number(v) : null })
            }}
            searchable
          />
          <p className="text-sm text-text-light mt-1">
            Assigning a team restricts visibility to that team, plus the owner and proposer.
          </p>
        </div>

        <div className="mb-5">
          <FilterDropdown
            id="remote-eligibility"
            label="Can this be done remotely?"
            ariaLabel="Select remote eligibility"
            value={remoteEligibility}
            options={REMOTE_ELIGIBILITY_OPTIONS}
            onChange={(v) => {
              setRemoteEligibility(v as 'NONE' | 'COUNTRY' | 'GLOBAL')
              commitField({ remoteEligibility: v as UpdateProjectInput['remoteEligibility'] })
            }}
          />
          <p className="text-sm text-text-light mt-1">
            Controls who gets project-match alerts outside the country above.
          </p>
        </div>

        <div className="mb-5">
          <label htmlFor="collaboration-link">Collaboration Doc / Link (optional)</label>
          <input
            id="collaboration-link"
            type="text"
            placeholder="e.g., https://docs.google.com/… or 'Will create a shared doc once team forms'"
            value={collaborationLink}
            onChange={(e) => {
              setCollaborationLink(e.target.value)
              clearFieldError('collaboration_link')
            }}
            onBlur={() => {
              const next = collaborationLink.trim()
              if (next === (projectData?.collaborationLink ?? '')) return
              commitField({ collaborationLink: next || null })
            }}
            disabled={!canEdit}
            aria-invalid={!!fe('collaboration_link') || undefined}
          />
          {fe('collaboration_link') ? (
            <p className="text-sm mt-1 text-error">{fe('collaboration_link')}</p>
          ) : (
            <p className="text-sm text-text-light mt-1">
              A URL to a planning doc or workspace, or just describe your plans for collaboration
            </p>
          )}
        </div>

        <div className="mb-5">
          <label>Skills Needed</label>
          <p className="text-sm text-text-light mt-0 mb-2">
            What skills would be helpful for this project?
          </p>
          <SkillPicker
            value={skills}
            onChange={
              canEdit
                ? (next) => {
                    setSkills(next)
                    commitField({
                      skillIds: next.map((s) => s.skillId),
                      skillRequiredMap: Object.fromEntries(next.map((s) => [s.skillId, true])),
                    })
                  }
                : () => {}
            }
          />
        </div>

        <div className="mb-5">
          <p className="font-medium mb-2">This project needs:</p>
          <div className="flex flex-col gap-2">
            <Checkbox
              checked={seekingHelp}
              onChange={(e) => {
                setSeekingHelp(e.target.checked)
                commitField({ isSeekingHelp: e.target.checked })
              }}
              disabled={!canEdit}
            >
              Help / contributors
            </Checkbox>
          </div>
        </div>

        {/* Ownership is only settable here while it's still a draft. Once live, it's
            changed from the project page's owner menu instead. */}
        {isDraft && (
          <div className="mb-5">
            <p className="font-medium mb-2">Project ownership:</p>
            <div className="flex flex-col gap-2">
              <Radio
                name="ownership"
                checked={!wantToOwn}
                onChange={() => {
                  setWantToOwn(false)
                  commitField({ assigneeId: null })
                }}
                disabled={!canEdit}
              >
                This project needs an owner / lead
              </Radio>
              <Radio
                name="ownership"
                checked={wantToOwn}
                onChange={() => {
                  setWantToOwn(true)
                  commitField({ assigneeId: user?.id ?? null })
                }}
                disabled={!canEdit}
              >
                <span>
                  <strong>I want to lead this project</strong> &mdash; I&apos;ll be the owner and
                  coordinate the work
                </span>
              </Radio>
            </div>
          </div>
        )}

        {isDraft && canEdit && (
          <div className="mb-5">
            <label>Tasks</label>
            <p className="text-sm text-text-light mt-0 mb-2">
              Break the project into concrete tasks. This helps contributors understand the scope
              and gives them something to pick up.
            </p>
            {(projectData?.tasks ?? []).map((task) => {
              const draft = taskDrafts[task.id] ?? {
                title: task.title,
                description: task.description ?? '',
              }
              return (
                <div
                  key={task.id}
                  className="bg-brand-bg rounded-lg p-4 mb-3 border border-brand-border"
                >
                  <div className="mb-3">
                    <label htmlFor={`task-title-${task.id}`} className="text-sm required">
                      Task title
                    </label>
                    <input
                      id={`task-title-${task.id}`}
                      type="text"
                      value={draft.title}
                      onChange={(e) =>
                        setTaskDrafts((prev) => ({
                          ...prev,
                          [task.id]: { ...draft, title: e.target.value },
                        }))
                      }
                      onBlur={() => handleTaskFieldBlur(task)}
                      placeholder="e.g. Draft copy for homepage"
                    />
                  </div>
                  <div className="mb-2">
                    <label htmlFor={`task-desc-${task.id}`} className="text-sm">
                      Details (optional)
                    </label>
                    <textarea
                      id={`task-desc-${task.id}`}
                      value={draft.description}
                      onChange={(e) =>
                        setTaskDrafts((prev) => ({
                          ...prev,
                          [task.id]: { ...draft, description: e.target.value },
                        }))
                      }
                      onBlur={() => handleTaskFieldBlur(task)}
                      placeholder="More detail about what needs doing…"
                      className="min-h-14"
                    />
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteTask(task.id)}
                      disabled={deleteTaskMutation.isPending}
                    >
                      Delete task
                    </Button>
                  </div>
                </div>
              )
            })}
            <div className="bg-brand-bg rounded-lg p-3 border border-brand-border">
              <div className="mb-2">
                <label htmlFor="new-task-title" className="text-sm required">
                  Task title
                </label>
                <input
                  id="new-task-title"
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Draft copy for homepage"
                />
              </div>
              <div className="mb-2">
                <label htmlFor="new-task-description" className="text-sm">
                  Details (optional)
                </label>
                <textarea
                  id="new-task-description"
                  rows={2}
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="More detail about what needs doing…"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddTask}
                disabled={creatingDraft || createTaskMutation.isPending || !newTaskTitle.trim()}
              >
                {creatingDraft || createTaskMutation.isPending ? 'Adding…' : 'Add Task'}
              </Button>
            </div>
          </div>
        )}

        {isDraft && !isOrgDraft && (
          <div className="flex items-center gap-3 p-4 rounded-lg mb-5 bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD] dark:bg-[#1E3A5F] dark:text-[#93C5FD] dark:border-[#2563EB]">
            Your project will be reviewed by PauseAI team leads before being published. We&apos;ll
            reach out if we have questions or suggestions.
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {projectId === undefined && (
            <Button
              type="button"
              variant="secondary"
              disabled={creatingDraft}
              onClick={handleSaveDraftClick}
            >
              {creatingDraft ? 'Saving…' : 'Save draft'}
            </Button>
          )}

          {projectId === undefined && (
            <Button
              type="button"
              onClick={handleOpenPublishModal}
              disabled={creatingDraft || publishMutation.isPending}
            >
              {isOrgDraft ? 'Publish' : 'Submit'}
            </Button>
          )}

          {projectId === undefined && (
            <Button
              type="button"
              variant="danger"
              onClick={props.onCancel ?? (() => router.back())}
            >
              Delete
            </Button>
          )}

          {projectId !== undefined && !isDraft && (
            <Button href={`/projects/${projectId}`} variant="secondary">
              View Project
            </Button>
          )}

          {projectId !== undefined && isDraft && canEdit && (
            <Button
              type="button"
              onClick={() => setShowPublishModal(true)}
              disabled={publishMutation.isPending}
            >
              {isOrgDraft ? 'Publish' : 'Submit'}
            </Button>
          )}

          {projectId !== undefined && isDraft && canEdit && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setShowDeleteDraftModal(true)}
              disabled={deleteDraftMutation.isPending}
            >
              Delete Draft
            </Button>
          )}

          {projectId !== undefined && user?.isAdmin && projectData && !isDraft && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setShowDeleteProjectModal(true)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Project'}
            </Button>
          )}
        </div>
      </div>

      <Modal
        id="confirm-publish-draft"
        title={isOrgDraft ? 'Publish this project?' : 'Submit draft for review?'}
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
      >
        <p>
          {isOrgDraft ? (
            <>
              This will publish <strong className="italic">{title || 'this project'}</strong>{' '}
              immediately. It will be visible to volunteers straight away.
            </>
          ) : (
            <>
              This will submit <strong className="italic">{title || 'this project'}</strong> to
              PauseAI team leads for review.
            </>
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmPublish}
            disabled={creatingDraft || publishMutation.isPending}
          >
            {isOrgDraft
              ? creatingDraft || publishMutation.isPending
                ? 'Publishing…'
                : 'Publish'
              : creatingDraft || publishMutation.isPending
                ? 'Submitting…'
                : 'Submit for Review'}
          </Button>
        </div>
      </Modal>

      {projectId !== undefined && (
        <>
          <Modal
            id="confirm-delete-project"
            title="Delete this project?"
            isOpen={showDeleteProjectModal}
            onClose={() => setShowDeleteProjectModal(false)}
          >
            <p>
              This will permanently delete{' '}
              <strong className="italic">{title || 'this project'}</strong>, including its tasks,
              comments, and interest history. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteProjectModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate({ id: projectId })}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Project'}
              </Button>
            </div>
          </Modal>

          <Modal
            id="confirm-delete-draft"
            title="Delete this draft?"
            isOpen={showDeleteDraftModal}
            onClose={() => setShowDeleteDraftModal(false)}
          >
            <p>
              This will permanently delete{' '}
              <strong className="italic">{title || 'this draft'}</strong>, including any tasks
              you&apos;ve added. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteDraftModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteDraftMutation.mutate({ id: projectId })}
                disabled={deleteDraftMutation.isPending}
              >
                {deleteDraftMutation.isPending ? 'Deleting…' : 'Delete Draft'}
              </Button>
            </div>
          </Modal>
        </>
      )}

      {projectId !== undefined && (isSaving || showSaved) && (
        <div
          role="status"
          className={`fixed left-4 z-[200] px-3 py-2 rounded-lg shadow-lg border border-brand-border bg-surface text-sm text-text-light ${bannerVisible ? 'bottom-20' : 'bottom-4'}`}
        >
          {isSaving ? 'Saving…' : 'Saved'}
        </div>
      )}
    </>
  )
}
