'use client'

import React, { use, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import FilterDropdown from '@/components/FilterDropdown'
import SkillPicker from '@/components/SkillPicker'
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
  { value: 'sprint', label: 'Sprint (1-2 weeks)' },
  { value: 'container', label: 'Time-boxed (1-3 months)' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'one_off', label: 'One-off task' },
] as const

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useRequireAuth()
  const showToast = useToast()

  const [canEdit, setCanEdit] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [collaborationLink, setCollaborationLink] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [projectType, setProjectType] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [locationValue, setLocationValue] = useState('') // 'UK' or 'UK:London'
  const [estimatedDuration, setEstimatedDuration] = useState('')
  const [seekingHelp, setSeekingHelp] = useState(true)
  const [seekingOwner, setSeekingOwner] = useState(true)

  const { data: localGroupsData } = useQuery({
    ...orpc.localGroups.list.queryOptions({ input: {} }),
    enabled: true,
  })
  const allLocalGroups = localGroupsData?.groups ?? []

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
    setEstimatedDuration(data.estimatedDuration ?? '')
    setSeekingHelp(data.isSeekingHelp ?? false)
    setSeekingOwner(data.isSeekingOwner ?? false)
    const isOwner = data.ownerId === user?.id || data.proposedById === user?.id
    setCanEdit(isOwner || (user?.isAdmin ?? false))
    setPermissionChecked(true)
  }, [projectData, initialized, user])

  const updateMutation = useMutation({
    ...orpc.projects.update.mutationOptions(),
    onSuccess: () => router.push(`/projects/${idParam}`),
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to save changes', 'error')
    },
  })

  const deleteMutation = useMutation({
    ...orpc.projects.delete.mutationOptions(),
    onSuccess: () => router.push('/'),
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to delete project', 'error')
    },
  })

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
      estimatedDuration: estimatedDuration.trim() || null,
      isSeekingHelp: seekingHelp,
      isSeekingOwner: seekingOwner,
    })
  }

  function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.'))
      return
    deleteMutation.mutate({ id: parseInt(idParam, 10) })
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
            <label htmlFor="edit-title">Project Title</label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>

          <div className="mb-5">
            <label htmlFor="edit-description">Description</label>
            <textarea
              id="edit-description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
            />
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
          </div>

          <div className="grid grid-cols-2 gap-5 mb-5">
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
              Local groups appear indented under their country.
            </p>
          </div>

          <div className="mb-5">
            <label htmlFor="edit-collab">Collaboration Doc / Link</label>
            <input
              id="edit-collab"
              type="text"
              placeholder="https://…"
              value={collaborationLink}
              onChange={(e) => setCollaborationLink(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="mb-5">
            <label>Skills needed</label>
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
              <Checkbox
                checked={seekingOwner}
                onChange={(e) => setSeekingOwner(e.target.checked)}
                disabled={!canEdit}
              >
                An owner / lead
              </Checkbox>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button type="submit" disabled={!canEdit || updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>

            {user.isAdmin && projectData && (
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Project'}
              </Button>
            )}
          </div>
        </form>
      </main>
    </>
  )
}
