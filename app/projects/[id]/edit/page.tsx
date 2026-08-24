'use client'

import React, { use, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import Radio from '@/components/Radio'
import FilterDropdown from '@/components/FilterDropdown'
import DescriptionTips from '@/components/DescriptionTips'
import SkillPicker from '@/components/SkillPicker'
import Modal from '@/components/ui/Modal'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { buildLocationOptions } from '@/lib/filter-options'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low - Nice to have' },
  { value: 'medium', label: 'Medium - Should do soon' },
  { value: 'high', label: 'High - Urgent / time-sensitive' },
] as const

const PROJECT_TYPES = [
  { value: '', label: 'Select a project type…' },
  { value: 'sprint', label: 'Sprint (1-2 weeks) - Focused burst of work with clear deliverable' },
  { value: 'container', label: 'Time-boxed (1-3 months) - Defined scope with end date' },
  { value: 'ongoing', label: 'Ongoing - Continuous work without fixed end date' },
  { value: 'one_off', label: 'One-off task - Single deliverable, minimal coordination' },
] as const

const REMOTE_ELIGIBILITY_OPTIONS = [
  { value: 'NONE', label: 'No - in-person / local only' },
  { value: 'COUNTRY', label: 'Yes - remote OK, within the same country' },
  { value: 'GLOBAL', label: 'Yes - remote OK, from any country' },
] as const

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useRequireAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const [canEdit, setCanEdit] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showDeleteDraftModal, setShowDeleteDraftModal] = useState(false)
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [taskDrafts, setTaskDrafts] = useState<
    Record<number, { title: string; description: string }>
  >({})

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [collaborationLink, setCollaborationLink] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [projectType, setProjectType] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [locationValue, setLocationValue] = useState('') // 'UK' or 'UK:London'
  const [teamId, setTeamId] = useState('')
  const [remoteEligibility, setRemoteEligibility] = useState<'NONE' | 'COUNTRY' | 'GLOBAL'>('NONE')
  const [estimatedDuration, setEstimatedDuration] = useState('')
  const [seekingHelp, setSeekingHelp] = useState(true)
  const [wantToOwn, setWantToOwn] = useState(false)

  const { data: localGroupsData } = useQuery({
    ...orpc.localGroups.list.queryOptions({ input: {} }),
    enabled: true,
  })
  const allLocalGroups = localGroupsData?.groups ?? []

  const { data: teamsData } = useQuery(orpc.teams.list.queryOptions())
  const teams = teamsData?.teams ?? []

  const { data: projectData, isPending: loadingProject } = useQuery({
    ...orpc.projects.getById.queryOptions({ input: { id: parseInt(idParam, 10) } }),
    enabled: !!user,
  })

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
    setEstimatedDuration(data.estimatedDuration ?? '')
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

  const updateMutation = useMutation({
    ...orpc.projects.update.mutationOptions(),
    onSuccess: () => {
      // Redirecting a draft to its own /projects/[id] would just bounce straight back
      // here, since that page redirects away from drafts.
      if (isDraft) {
        showToast('Draft saved', 'success')
        queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
      } else {
        router.push(`/projects/${idParam}`)
      }
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to save changes', 'error')
    },
  })

  const deleteMutation = useMutation({
    ...orpc.projects.delete.mutationOptions(),
    onSuccess: () => router.push('/projects'),
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to delete project', 'error')
      setShowDeleteProjectModal(false)
    },
  })

  const publishMutation = useMutation({
    ...orpc.projects.publishDraft.mutationOptions(),
    onSuccess: () => {
      showToast(isOrgDraft ? 'Project published!' : 'Draft submitted for review!', 'success')
      setShowPublishModal(false)
      // Otherwise the project page picks up the pre-publish cached `draft` status and
      // immediately redirects back here.
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
      const destination = isOrgDraft ? `/projects/${idParam}` : '/dashboard#tab-proposed'
      setTimeout(() => router.push(destination), 1500)
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to publish draft', 'error')
      setShowPublishModal(false)
    },
  })

  const deleteDraftMutation = useMutation({
    ...orpc.projects.deleteDraft.mutationOptions(),
    onSuccess: () => {
      showToast('Draft deleted', 'success')
      router.push('/suggest')
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to delete draft', 'error')
      setShowDeleteDraftModal(false)
    },
  })

  const createTaskMutation = useMutation({
    ...orpc.projects.createTask.mutationOptions(),
    onSuccess: () => {
      setNewTaskTitle('')
      setNewTaskDescription('')
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to create task', 'error')
    },
  })

  const deleteTaskMutation = useMutation({
    ...orpc.projects.deleteTask.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to delete task', 'error')
    },
  })

  const updateTaskMutation = useMutation({
    ...orpc.projects.updateTask.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to update task', 'error')
    },
  })

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    createTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim() || undefined,
    })
  }

  function handleDeleteTask(taskId: number) {
    if (!window.confirm('Delete this task?')) return
    deleteTaskMutation.mutate({ projectId: parseInt(idParam, 10), taskId })
  }

  // Saves a task's title/description on blur, only if it actually changed from what's
  // currently persisted — otherwise every click into and out of a field would fire a
  // mutation.
  function handleTaskFieldBlur(task: { id: number; title: string; description: string | null }) {
    const draft = taskDrafts[task.id]
    if (!draft || !draft.title.trim()) return
    const newTitle = draft.title.trim()
    const newDescription = draft.description.trim()
    if (newTitle === task.title && newDescription === (task.description ?? '')) return
    updateTaskMutation.mutate({
      projectId: parseInt(idParam, 10),
      taskId: task.id,
      data: { title: newTitle, description: newDescription || null },
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    const [country, localGroup] = locationValue.split(':')
    updateMutation.mutate({
      id: parseInt(idParam, 10),
      title: title.trim(),
      description: description.trim(),
      collaborationLink: collaborationLink.trim() || null,
      skillIds: skills.map((s) => s.skillId),
      projectType: projectType || null,
      timeCommitmentHoursPerWeek: hoursPerWeek ? Number(hoursPerWeek) : null,
      urgency,
      country: country || null,
      localGroup: localGroup || null,
      teamId: teamId ? Number(teamId) : null,
      remoteEligibility,
      estimatedDuration: estimatedDuration.trim() || null,
      isSeekingHelp: seekingHelp,
      // Ownership is only settable here while it's still a draft — once live, it's
      // changed from the project page's owner menu instead.
      ...(isDraft ? { assigneeId: wantToOwn ? (user?.id ?? null) : null } : {}),
    })
  }

  if (loading || !user) return null

  const isDraft = projectData?.status === 'draft'
  const isOrgDraft = projectData?.isOrgProposed === true

  if (loadingProject) {
    return (
      <>
        <main className="container py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading project…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <main className="container py-5 pb-15">
        <h1 role="heading">Edit Project</h1>

        {permissionChecked && !canEdit && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-600"
          >
            You do not have permission to edit this project.
          </div>
        )}

        <form
          className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
          onSubmit={handleSubmit}
        >
          <div className="mb-5">
            <label htmlFor="edit-title" className="required">
              Project Title
            </label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              required
              placeholder="A clear, descriptive name for the project"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="edit-description" className="required">
              Description
            </label>
            <DescriptionTips />
            <textarea
              id="edit-description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
              placeholder="Describe the project: goals, approach, what success looks like, and what kind of help is needed."
            />
            <p className="text-sm text-text-light mt-1">
              The more detail you provide, the easier it is to find the right contributors and get
              started.
            </p>
          </div>

          <div className="mb-5">
            <FilterDropdown
              id="project-type"
              label="Project Type"
              ariaLabel="Select project type"
              value={projectType}
              options={PROJECT_TYPES}
              onChange={setProjectType}
            />
            <p className="text-sm text-text-light mt-1">
              This helps contributors understand the commitment involved
            </p>
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
                onChange={(e) => setHoursPerWeek(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-sm text-text-light mt-1">
                Estimated weekly time from each contributor
              </p>
            </div>
            <div>
              <FilterDropdown
                id="urgency"
                label="Urgency"
                ariaLabel="Select urgency"
                value={urgency}
                options={URGENCY_OPTIONS}
                onChange={setUrgency}
              />
            </div>
          </div>

          {['sprint', 'container'].includes(projectType) && (
            <div className="mb-5">
              <label htmlFor="duration">Estimated Duration</label>
              <input
                id="duration"
                type="text"
                placeholder="e.g., 6 weeks, 2 months"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-sm text-text-light mt-1">
                Roughly how long do you expect this to take?
              </p>
            </div>
          )}

          <div className="mb-5">
            <FilterDropdown
              id="country"
              label="Country/Group"
              ariaLabel="Select country/group"
              value={locationValue}
              options={buildLocationOptions(allLocalGroups)}
              onChange={setLocationValue}
              searchable
            />
            <p className="text-sm text-text-light mt-1">
              Where is this project based? Local groups appear indented under their country.{' '}
              <a href="/suggest-local-group" className="underline">
                Don&apos;t see your group? Suggest one.
              </a>
            </p>
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
              onChange={setTeamId}
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
              onChange={setRemoteEligibility}
            />
            <p className="text-sm text-text-light mt-1">
              Controls who gets project-match alerts outside the country above.
            </p>
          </div>

          <div className="mb-5">
            <label htmlFor="edit-collab">Collaboration Doc / Link (optional)</label>
            <input
              id="edit-collab"
              type="text"
              placeholder="e.g., https://docs.google.com/… or 'Will create a shared doc once team forms'"
              value={collaborationLink}
              onChange={(e) => setCollaborationLink(e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-sm text-text-light mt-1">
              A URL to a planning doc or workspace, or just describe your plans for collaboration
            </p>
          </div>

          <div className="mb-5">
            <label>Skills Needed</label>
            <p className="text-sm text-text-light mt-0 mb-2">
              What skills would be helpful for this project?
            </p>
            <SkillPicker value={skills} onChange={canEdit ? setSkills : () => {}} />
          </div>

          <div className="mb-5">
            <p className="font-medium mb-2">This project needs:</p>
            <div className="flex flex-col gap-2">
              <Checkbox
                checked={seekingHelp}
                onChange={(e) => setSeekingHelp(e.target.checked)}
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
                  onChange={() => setWantToOwn(false)}
                  disabled={!canEdit}
                >
                  This project needs an owner / lead
                </Radio>
                <Radio
                  name="ownership"
                  checked={wantToOwn}
                  onChange={() => setWantToOwn(true)}
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
              <label>Initial Tasks</label>
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
                  disabled={createTaskMutation.isPending || !newTaskTitle.trim()}
                >
                  {createTaskMutation.isPending ? 'Adding…' : 'Add Task'}
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
            <Button type="submit" disabled={!canEdit || updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : isDraft ? 'Save draft' : 'Save Changes'}
            </Button>

            {!isDraft && (
              <Button href={`/projects/${idParam}`} variant="secondary">
                View Project
              </Button>
            )}

            {isDraft && canEdit && (
              <Button
                type="button"
                onClick={() => setShowPublishModal(true)}
                disabled={publishMutation.isPending}
              >
                {isOrgDraft ? 'Publish' : 'Submit'}
              </Button>
            )}

            {isDraft && canEdit && (
              <Button
                type="button"
                variant="danger"
                onClick={() => setShowDeleteDraftModal(true)}
                disabled={deleteDraftMutation.isPending}
              >
                Delete Draft
              </Button>
            )}

            {user.isAdmin && projectData && !isDraft && (
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
        </form>

        <Modal
          id="confirm-delete-project"
          title="Delete this project?"
          isOpen={showDeleteProjectModal}
          onClose={() => setShowDeleteProjectModal(false)}
        >
          <p>
            This will permanently delete <strong>{title || 'this project'}</strong>, including its
            tasks, comments, and interest history. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteProjectModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteMutation.mutate({ id: parseInt(idParam, 10) })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Project'}
            </Button>
          </div>
        </Modal>

        <Modal
          id="confirm-publish-draft"
          title={isOrgDraft ? 'Publish this project?' : 'Submit draft for review?'}
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
        >
          <p>
            {isOrgDraft ? (
              <>
                This will publish <strong>{title || 'this project'}</strong> immediately. It will be
                visible to volunteers straight away, and you won&apos;t be able to edit it as a
                draft anymore.
              </>
            ) : (
              <>
                This will submit <strong>{title || 'this project'}</strong> to PauseAI team leads
                for review. You won&apos;t be able to edit it as a draft anymore.
              </>
            )}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => publishMutation.mutate({ id: parseInt(idParam, 10) })}
              disabled={publishMutation.isPending}
            >
              {isOrgDraft
                ? publishMutation.isPending
                  ? 'Publishing…'
                  : 'Publish'
                : publishMutation.isPending
                  ? 'Submitting…'
                  : 'Submit for Review'}
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
            This will permanently delete <strong>{title || 'this draft'}</strong>, including any
            tasks you&apos;ve added. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteDraftModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteDraftMutation.mutate({ id: parseInt(idParam, 10) })}
              disabled={deleteDraftMutation.isPending}
            >
              {deleteDraftMutation.isPending ? 'Deleting…' : 'Delete Draft'}
            </Button>
          </div>
        </Modal>
      </main>
    </>
  )
}
