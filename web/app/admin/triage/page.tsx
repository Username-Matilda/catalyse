'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Project {
  id: number
  title: string
  description: string
  status: string
  proposed_by_name: string | null
  owner_id: number | null
  review_notes: string | null
}

interface ReviewModal {
  project: Project
}

export default function TriagePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [tab, setTab] = useState<'pending_review' | 'needs_discussion'>('pending_review')
  const [modal, setModal] = useState<ReviewModal | null>(null)
  const [decision, setDecision] = useState<'approved' | 'needs_discussion'>('approved')
  const [feedback, setFeedback] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    apiRequest<Project[]>('/api/admin/triage')
      .then(data => { setProjects(data); setLoadingProjects(false) })
      .catch(() => setLoadingProjects(false))
  }, [user])

  function openReview(project: Project) {
    setModal({ project })
    setDecision('approved')
    setFeedback('')
    setReviewNotes(project.review_notes || '')
    setAlert(null)
  }

  function closeModal() {
    setModal(null)
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/projects/${modal.project.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: decision,
          feedback_to_proposer: decision === 'needs_discussion' ? feedback : null,
          review_notes: reviewNotes || null,
          target_status: modal.project.owner_id ? 'seeking_help' : 'seeking_owner',
        }),
      })
      setProjects(prev => prev.filter(p => p.id !== modal.project.id))
      setAlert(`Project ${decision === 'approved' ? 'approved' : 'moved to discussion'}!`)
      setModal(null)
    } catch (err: unknown) {
      setAlert(err instanceof Error ? err.message : 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  const pending = projects.filter(p => p.status === 'pending_review')
  const discussion = projects.filter(p => p.status === 'needs_discussion')
  const visible = tab === 'pending_review' ? pending : discussion

  return (
    <>
      <Header />
      <main className="container page">
        <h1>Project Triage</h1>

        {alert && (
          <div role="alert" className="message success" style={{ marginBottom: 16 }}>
            {alert}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button
            role="button"
            className={`btn ${tab === 'pending_review' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('pending_review')}
          >
            Pending Review {pending.length > 0 && `(${pending.length})`}
          </button>
          <button
            role="button"
            className={`btn ${tab === 'needs_discussion' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('needs_discussion')}
          >
            Needs Discussion {discussion.length > 0 && `(${discussion.length})`}
          </button>
        </div>

        {loadingProjects ? (
          <div className="loading">Loading…</div>
        ) : visible.length === 0 ? (
          <p>No projects awaiting {tab === 'pending_review' ? 'review' : 'discussion'}.</p>
        ) : (
          visible.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 8px' }}>{p.title}</h3>
                  {p.proposed_by_name && (
                    <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', margin: '0 0 8px' }}>
                      Proposed by {p.proposed_by_name}
                    </p>
                  )}
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'hidden' }}>
                    {p.description}
                  </p>
                </div>
                <button
                  role="button"
                  className="btn btn-primary"
                  style={{ marginLeft: 16, whiteSpace: 'nowrap' }}
                  onClick={() => openReview(p)}
                >
                  Review
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div style={{ background: 'var(--card-bg, white)', borderRadius: 12, padding: 32, maxWidth: 600, width: '90%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 role="heading">Review Project</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>&times;</button>
            </div>

            <h3 style={{ marginBottom: 8 }}>{modal.project.title}</h3>
            <p style={{ whiteSpace: 'pre-wrap', marginBottom: 16, maxHeight: 200, overflow: 'auto', color: 'var(--text-light)' }}>
              {modal.project.description}
            </p>

            <form onSubmit={submitReview}>
              <div className="form-group">
                <label>Decision</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="decision"
                      value="approved"
                      checked={decision === 'approved'}
                      onChange={() => setDecision('approved')}
                    />
                    <span><strong>Approve</strong> — Make visible to volunteers</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="decision"
                      value="needs_discussion"
                      checked={decision === 'needs_discussion'}
                      onChange={() => setDecision('needs_discussion')}
                    />
                    <span><strong>Needs Discussion</strong> — Reach out to proposer</span>
                  </label>
                </div>
              </div>

              {decision === 'needs_discussion' && (
                <div className="form-group">
                  <label htmlFor="feedback-proposer">Message to Proposer</label>
                  <textarea
                    id="feedback-proposer"
                    aria-label="Message to Proposer"
                    rows={3}
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="Explain what you'd like to discuss…"
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="review-notes">Internal Notes (not shared)</label>
                <textarea
                  id="review-notes"
                  rows={2}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Notes for other admins…"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
