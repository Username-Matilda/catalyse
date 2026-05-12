'use client'

import React, { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import FilterDropdown from '@/components/FilterDropdown'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { buildLocationOptions, type LocalGroupOption } from '@/lib/filter-options'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

interface ProjectData {
  id: number
  title: string
  description: string
  collaboration_link: string | null
  owner_id: number | null
  proposed_by_id: number | null
  project_type: string | null
  time_commitment_hours_per_week: number | null
  urgency: string | null
  country: string | null
  local_group: string | null
  estimated_duration: string | null
  is_seeking_help: boolean
  is_seeking_owner: boolean
  skills: Array<{ id: number; name: string; is_required: boolean | null }>
}

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low - Nice to have' },
  { value: 'medium', label: 'Medium - Should do soon' },
  { value: 'high', label: 'High - Urgent / time-sensitive' },
]

const PROJECT_TYPES = [
  { value: '', label: 'Select a project type…' },
  { value: 'sprint', label: 'Sprint (1-2 weeks)' },
  { value: 'container', label: 'Time-boxed (1-3 months)' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'one_off', label: 'One-off task' },
]

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()

  const [project, setProject] = useState<ProjectData | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
  const [allLocalGroups, setAllLocalGroups] = useState<LocalGroupOption[]>([])

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    apiRequest<{ groups: LocalGroupOption[] }>('/api/local-groups')
      .then((d) => setAllLocalGroups(d.groups))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    apiRequest<ProjectData>(`/api/projects/${idParam}`)
      .then((data) => {
        setProject(data)
        setTitle(data.title)
        setDescription(data.description)
        setCollaborationLink(data.collaboration_link ?? '')
        setSkills(
          (data.skills ?? []).map((s) => ({ skillId: s.id, proficiencyLevel: 'intermediate' })),
        )
        setProjectType(data.project_type ?? '')
        setHoursPerWeek(data.time_commitment_hours_per_week?.toString() ?? '')
        setUrgency(data.urgency ?? 'medium')
        const country = data.country ?? ''
        const localGroup = data.local_group ?? ''
        setLocationValue(country && localGroup ? `${country}:${localGroup}` : country)
        setEstimatedDuration(data.estimated_duration ?? '')
        setSeekingHelp(data.is_seeking_help)
        setSeekingOwner(data.is_seeking_owner)
        const isOwner = data.owner_id === user.id || data.proposed_by_id === user.id
        setCanEdit(isOwner || user.is_admin)
        setPermissionChecked(true)
      })
      .catch(() => setPermissionChecked(true))
      .finally(() => setLoadingProject(false))
  }, [user, idParam])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    setSubmitting(true)
    const [country, localGroup] = locationValue.split(':')
    try {
      await apiRequest(`/api/projects/${idParam}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          collaboration_link: collaborationLink.trim() || null,
          skill_ids: skills.map((s) => s.skillId),
          project_type: projectType || null,
          time_commitment_hours_per_week: hoursPerWeek ? Number(hoursPerWeek) : null,
          urgency,
          country: country || null,
          local_group: localGroup || null,
          estimated_duration: estimatedDuration.trim() || null,
          is_seeking_help: seekingHelp,
          is_seeking_owner: seekingOwner,
        }),
      })
      router.push(`/projects/${idParam}`)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save changes', 'error')
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.'))
      return
    setDeleting(true)
    try {
      await apiRequest(`/api/projects/${idParam}`, { method: 'DELETE' })
      router.push('/')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete project', 'error')
      setDeleting(false)
    }
  }

  if (loading || !user) return null

  if (loadingProject) {
    return (
      <>
        <Header />
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading project…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Edit Project</h1>

        {permissionChecked && !canEdit && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]"
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
              label="Country / Region"
              ariaLabel="Select country"
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
            <Button type="submit" disabled={!canEdit || submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>

            {user.is_admin && project && (
              <Button type="button" variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Project'}
              </Button>
            )}
          </div>
        </form>
      </main>
    </>
  )
}
