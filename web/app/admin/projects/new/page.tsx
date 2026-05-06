'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

export default function AdminCreateProjectPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [wantToOwn, setWantToOwn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await apiRequest<{ id: number }>('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          want_to_own: wantToOwn,
        }),
      })
      router.push(`/projects/${result.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <h1 role="heading">Create Organisation Project</h1>

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
              aria-label="Project Title"
              type="text"
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
              rows={6}
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={wantToOwn}
                onChange={e => setWantToOwn(e.target.checked)}
              />
              I want to own this project
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Project'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </main>
    </>
  )
}
