'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

interface Task {
  title: string
  description: string
}

const PROJECT_TYPES = [
  { value: '', label: 'Select type…' },
  { value: 'research', label: 'Research' },
  { value: 'software', label: 'Software' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'advocacy', label: 'Advocacy' },
  { value: 'other', label: 'Other' },
]


export default function SuggestPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [country, setCountry] = useState('')
  const [localGroup, setLocalGroup] = useState('')
  const [duration, setDuration] = useState('')
  const [collaborationLink, setCollaborationLink] = useState('')
  const [seekingHelp, setSeekingHelp] = useState(true)
  const [wantToOwn, setWantToOwn] = useState(false)
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [tasks, setTasks] = useState<Task[]>([{ title: '', description: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  function updateTask(index: number, field: keyof Task, value: string) {
    setTasks(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t))
  }

  function addTask() {
    setTasks(prev => [...prev, { title: '', description: '' }])
  }

  function removeTask(index: number) {
    if (tasks.length > 1) setTasks(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const validTasks = tasks.filter(t => t.title.trim())
    if (!validTasks.length) {
      setError('At least one task is required')
      return
    }
    setSubmitting(true)
    try {
      await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          project_type: projectType || null,
          time_commitment_hours_per_week: hoursPerWeek ? Number(hoursPerWeek) : null,
          urgency,
          country: country.trim() || null,
          local_group: localGroup.trim() || null,
          estimated_duration: duration.trim() || null,
          collaboration_link: collaborationLink.trim() || null,
          is_seeking_help: seekingHelp,
          want_to_own: wantToOwn,
          skill_ids: skills.map(s => s.skillId),
          tasks: validTasks.map(t => ({ title: t.title.trim(), description: t.description.trim() || undefined })),
        }),
      })
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit proposal')
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Suggest a Project</h1>

        {error && (
          <div role="alert" className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]">
            {error}
          </div>
        )}

        <form className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="project-title" className="required">Project Title</label>
            <input id="project-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>

          <div className="mb-5">
            <label htmlFor="project-description" className="required">Description</label>
            <textarea
              id="project-description"
              rows={6}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the goal and impact, your approach, feasibility, the team needed, and why this matters…"
              required
            />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5 mb-5">
            <div>
              <label htmlFor="project-type">Project Type</label>
              <select id="project-type" value={projectType} onChange={e => setProjectType(e.target.value)}>
                {PROJECT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="hours-per-week">Hours per Week</label>
              <input
                id="hours-per-week"
                type="number"
                min={1}
                max={40}
                placeholder="e.g. 5"
                value={hoursPerWeek}
                onChange={e => setHoursPerWeek(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="urgency">Urgency</label>
              <select id="urgency" value={urgency} onChange={e => setUrgency(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label htmlFor="duration">Estimated Duration</label>
              <input
                id="duration"
                type="text"
                placeholder="e.g. 3 months"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="country">Country</label>
              <input
                id="country"
                type="text"
                placeholder="e.g. United Kingdom"
                value={country}
                onChange={e => setCountry(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="local-group">Local Group</label>
              <input
                id="local-group"
                type="text"
                placeholder="e.g. London"
                value={localGroup}
                onChange={e => setLocalGroup(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="collaboration-link">Collaboration Document Link</label>
            <input
              id="collaboration-link"
              type="url"
              placeholder="https://docs.google.com/…"
              value={collaborationLink}
              onChange={e => setCollaborationLink(e.target.value)}
            />
            <p className="text-sm text-text-light mt-1">Optional link to a planning doc, brief, or shared workspace.</p>
          </div>

          <div className="mb-5">
            <label>Skills Needed</label>
            <SkillPicker value={skills} onChange={setSkills} />
          </div>

          <div className="mb-5">
            <h3 style={{ marginTop: 0 }}>Ownership &amp; Help</h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2" style={{ fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={seekingHelp}
                  onChange={e => setSeekingHelp(e.target.checked)}
                />
                This project is seeking volunteer help
              </label>
              <label className="flex items-center gap-2" style={{ fontWeight: 400 }}>
                <input
                  type="radio"
                  name="ownership"
                  checked={wantToOwn}
                  onChange={() => setWantToOwn(true)}
                />
                I want to own and lead this project
              </label>
              <label className="flex items-center gap-2" style={{ fontWeight: 400 }}>
                <input
                  type="radio"
                  name="ownership"
                  checked={!wantToOwn}
                  onChange={() => setWantToOwn(false)}
                />
                I&apos;m looking for someone else to own this project
              </label>
            </div>
          </div>

          <div className="mb-5">
            <label>Initial Tasks</label>
            <p className="text-sm text-text-light mt-0 mb-2">
              Break your project into concrete tasks. At least one is required.
            </p>
            {tasks.map((task, i) => (
              <div key={i} className="bg-brand-bg rounded-lg p-4 mb-3 border border-brand-border">
                <div className="mb-3">
                  <label htmlFor={`task-title-${i}`} className="text-sm">Task title</label>
                  <input
                    id={`task-title-${i}`}
                    type="text"
                    aria-label="Task title"
                    placeholder="e.g. Set up project repository"
                    value={task.title}
                    onChange={e => updateTask(i, 'title', e.target.value)}
                  />
                </div>
                <div className="mb-2">
                  <label htmlFor={`task-desc-${i}`} className="text-sm">Details (optional)</label>
                  <textarea
                    id={`task-desc-${i}`}
                    aria-label="Task details"
                    placeholder="Any additional detail…"
                    value={task.description}
                    onChange={e => updateTask(i, 'description', e.target.value)}
                    style={{ minHeight: 60 }}
                  />
                </div>
                {tasks.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    icon
                    onClick={() => removeTask(i)}
                    aria-label="Remove task"
                  >×</Button>
                )}
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addTask}>
              + Add another task
            </Button>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-lg mb-5 bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD] dark:bg-[#1E3A5F] dark:text-[#93C5FD] dark:border-[#2563EB]">
            Your proposal will be reviewed by an admin before being published.
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Project Proposal'}
          </Button>
        </form>
      </main>
    </>
  )
}
