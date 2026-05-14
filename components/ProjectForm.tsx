'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import Radio from '@/components/Radio'
import FilterDropdown from '@/components/FilterDropdown'
import DescriptionTips from '@/components/DescriptionTips'
import SkillPicker from '@/components/SkillPicker'
import { buildLocationOptions, type LocalGroupOption } from '@/lib/filter-options'
import { useToast } from '@/lib/toast'
import { apiRequest, ApiError } from '@/lib/api'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

interface Task {
  title: string
  description: string
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

interface ProjectFormProps {
  action: string
  submitLabel?: string
  showReviewNotice?: boolean
  requireTasks?: boolean
  onSuccess: (id: number) => void
  onCancel?: () => void
}

export default function ProjectForm({
  action,
  submitLabel = 'Submit',
  showReviewNotice = false,
  requireTasks = false,
  onSuccess,
  onCancel,
}: ProjectFormProps) {
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [locationValue, setLocationValue] = useState('') // 'UK' or 'UK:London'
  const [duration, setDuration] = useState('')
  const [collaborationLink, setCollaborationLink] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [seekingHelp, setSeekingHelp] = useState(true)
  const [wantToOwn, setWantToOwn] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([{ title: '', description: '' }])
  const [allLocalGroups, setAllLocalGroups] = useState<LocalGroupOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    apiRequest<{ groups: LocalGroupOption[] }>('/api/local-groups')
      .then((data) => setAllLocalGroups(data.groups))
      .catch(() => {})
  }, [])

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

  function updateTask(index: number, field: keyof Task, value: string) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)))
  }

  function addTask() {
    setTasks((prev) => [...prev, { title: '', description: '' }])
  }

  function removeTask(index: number) {
    if (tasks.length > 1) setTasks((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validTasks = tasks.filter((t) => t.title.trim())
    if (requireTasks && !validTasks.length) {
      toast('At least one task with a title is required.', 'error')
      return
    }
    setSubmitting(true)
    const [country, localGroup] = locationValue.split(':')
    try {
      const result = await apiRequest<{ id: number }>(action, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          project_type: projectType || null,
          time_commitment_hours_per_week: hoursPerWeek ? Number(hoursPerWeek) : null,
          urgency,
          country: country || null,
          local_group: localGroup || null,
          estimated_duration: duration.trim() || null,
          collaboration_link: collaborationLink.trim() || null,
          skill_ids: skills.map((s) => s.skillId),
          skill_required_map: Object.fromEntries(skills.map((s) => [s.skillId, true])),
          is_seeking_help: seekingHelp,
          is_seeking_owner: !wantToOwn,
          want_to_own: wantToOwn,
          tasks: validTasks.map((t) => ({
            title: t.title.trim(),
            description: t.description.trim() || undefined,
          })),
        }),
      })
      onSuccess(result.id)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors)
        toast('Please correct the highlighted fields.', 'error')
      } else {
        toast(err instanceof Error ? err.message : 'Failed to submit', 'error')
      }
      setSubmitting(false)
    }
  }

  return (
    <form
      className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
      onSubmit={handleSubmit}
    >
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
          required
          placeholder="A clear, descriptive name for the project"
          aria-invalid={!!fe('title') || undefined}
        />
        {fe('title') && (
          <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
            {fe('title')}
          </p>
        )}
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
          required
          placeholder="Describe the project: goals, approach, what success looks like, and what kind of help is needed."
          aria-invalid={!!fe('description') || undefined}
        />
        {fe('description') ? (
          <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
            {fe('description')}
          </p>
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
          }}
        />
        {fe('project_type') ? (
          <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
            {fe('project_type')}
          </p>
        ) : (
          <p className="text-sm text-text-light mt-1">
            This helps contributors understand the commitment involved
          </p>
        )}
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
            onChange={(e) => {
              setHoursPerWeek(e.target.value)
              clearFieldError('time_commitment_hours_per_week')
            }}
            aria-invalid={!!fe('time_commitment_hours_per_week') || undefined}
          />
          {fe('time_commitment_hours_per_week') ? (
            <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
              {fe('time_commitment_hours_per_week')}
            </p>
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
            }}
          />
          {fe('urgency') && (
            <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
              {fe('urgency')}
            </p>
          )}
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
            aria-invalid={!!fe('estimated_duration') || undefined}
          />
          {fe('estimated_duration') ? (
            <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
              {fe('estimated_duration')}
            </p>
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
          }}
          searchable
        />
        {fe('country') || fe('local_group') ? (
          <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
            {fe('country') ?? fe('local_group')}
          </p>
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
          aria-invalid={!!fe('collaboration_link') || undefined}
        />
        {fe('collaboration_link') ? (
          <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
            {fe('collaboration_link')}
          </p>
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
        <SkillPicker value={skills} onChange={setSkills} />
      </div>

      <div className="mb-5">
        <p className="font-medium mb-2">This project needs:</p>
        <div className="flex flex-col gap-2 mb-4">
          <Checkbox checked={seekingHelp} onChange={(e) => setSeekingHelp(e.target.checked)}>
            Help / contributors
          </Checkbox>
        </div>
        <p className="font-medium mb-2">Project ownership:</p>
        <div className="flex flex-col gap-2">
          <Radio name="ownership" checked={!wantToOwn} onChange={() => setWantToOwn(false)}>
            This project needs an owner / lead
          </Radio>
          <Radio name="ownership" checked={wantToOwn} onChange={() => setWantToOwn(true)}>
            <span>
              <strong>I want to lead this project</strong> &mdash; I&apos;ll be the owner and
              coordinate the work
            </span>
          </Radio>
        </div>
      </div>

      <div className="mb-5">
        <label>
          Initial Tasks{' '}
          {!requireTasks && <span className="font-normal text-text-light">(optional)</span>}
        </label>
        <p className="text-sm text-text-light mt-0 mb-2">
          Break the project into concrete tasks. This helps contributors understand the scope and
          gives them something to pick up.
        </p>
        {tasks.map((task, i) => (
          <div key={i} className="bg-brand-bg rounded-lg p-4 mb-3 border border-brand-border">
            <div className="mb-3">
              <label
                htmlFor={`task-title-${i}`}
                className={`text-sm${requireTasks ? ' required' : ''}`}
              >
                Task title
              </label>
              <input
                id={`task-title-${i}`}
                type="text"
                aria-label="Task title"
                placeholder="e.g. Draft copy for homepage"
                value={task.title}
                onChange={(e) => updateTask(i, 'title', e.target.value)}
              />
            </div>
            <div className="mb-2">
              <label htmlFor={`task-desc-${i}`} className="text-sm">
                Details (optional)
              </label>
              <textarea
                id={`task-desc-${i}`}
                placeholder="More detail about what needs doing…"
                value={task.description}
                onChange={(e) => updateTask(i, 'description', e.target.value)}
                style={{ minHeight: 60 }}
              />
            </div>
            {tasks.length > 1 && (
              <div className="flex justify-end mt-2">
                <Button type="button" variant="danger" size="sm" onClick={() => removeTask(i)}>
                  Delete task
                </Button>
              </div>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={addTask}>
          + Add another task
        </Button>
      </div>

      {showReviewNotice && (
        <div className="flex items-center gap-3 p-4 rounded-lg mb-5 bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD] dark:bg-[#1E3A5F] dark:text-[#93C5FD] dark:border-[#2563EB]">
          Your project will be reviewed by PauseAI UK team leads before being published. We&apos;ll
          reach out if we have questions or suggestions.
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
