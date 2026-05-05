'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

export default function SuggestPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [tasks, setTasks] = useState([''])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  function updateTask(index: number, value: string) {
    setTasks(prev => prev.map((t, i) => (i === index ? value : t)))
  }

  function addTask() {
    setTasks(prev => [...prev, ''])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const validTasks = tasks.filter(t => t.trim())
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
          skill_ids: skills.map(s => s.skillId),
          tasks: validTasks.map(t => ({ title: t.trim() })),
          want_to_own: false,
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
      <main className="container page">
        <h1 role="heading">Suggest a Project</h1>

        {error && (
          <div role="alert" className="message error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form className="card" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="project-title">Project Title</label>
            <input
              id="project-title"
              type="text"
              aria-label="Project Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="project-description">Description</label>
            <textarea
              id="project-description"
              aria-label="Description"
              rows={5}
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Skills needed</label>
            <SkillPicker value={skills} onChange={setSkills} />
          </div>

          <div className="form-group">
            <label>Tasks</label>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: 8 }}>
              Break your project into at least one concrete task.
            </p>
            {tasks.map((task, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <input
                  type="text"
                  aria-label="Task title"
                  placeholder="e.g. Set up project repository"
                  value={task}
                  onChange={e => updateTask(i, e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
            <button type="button" className="btn btn-secondary" onClick={addTask} style={{ marginTop: 4 }}>
              + Add another task
            </button>
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Project Proposal'}
          </button>
        </form>
      </main>
    </>
  )
}
