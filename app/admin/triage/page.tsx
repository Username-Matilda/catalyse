'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import {
  ProjectCard,
  type Project as CardProject,
  statusBadgeClasses,
  STATUS_LABELS,
  CARD_GRID_CLASSES,
} from '@/components/ProjectCard'
import Tabs from '@/components/Tabs'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface Project extends CardProject {
  proposed_by_name?: string | null
  proposed_by_id?: number | null
  owner_id: number | null
  review_notes: string | null
}

interface Interest {
  id: number
  volunteer_id: number
  project_id: number
  interest_type: string
  message: string | null
  status: string
  response_message: string | null
  created_at: string
  project_title: string
  project_status: string
  volunteer_name: string
  owner_name: string | null
  volunteer_skills: Array<{ id: number; name: string }>
}

interface ReviewModal {
  project: Project
}

export default function TriagePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [tab, setTab] = useState<'pending_review' | 'needs_discussion' | 'interests'>(
    'pending_review',
  )
  const [modal, setModal] = useState<ReviewModal | null>(null)
  const [decision, setDecision] = useState<'approved' | 'needs_discussion'>('approved')
  const [feedback, setFeedback] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [interests, setInterests] = useState<Interest[]>([])
  const [loadingInterests, setLoadingInterests] = useState(true)
  const [interestStatusFilter, setInterestStatusFilter] = useState('pending')
  const [respondingId, setRespondingId] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    apiRequest<Project[]>('/api/admin/triage')
      .then((data) => {
        setProjects(data)
        setLoadingProjects(false)
      })
      .catch(() => setLoadingProjects(false))
  }, [user])

  useEffect(() => {
    if (!user?.is_admin) return
    const params = interestStatusFilter ? `?status=${interestStatusFilter}` : ''
    apiRequest<Interest[]>(`/api/admin/interests${params}`)
      .then((data) => {
        setInterests(data)
        setLoadingInterests(false)
      })
      .catch(() => setLoadingInterests(false))
  }, [user, interestStatusFilter])

  function openReview(project: Project) {
    setModal({ project })
    setDecision('approved')
    setFeedback('')
    setReviewNotes(project.review_notes || '')
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
      setProjects((prev) => prev.filter((p) => p.id !== modal.project.id))
      showToast(
        `Project ${decision === 'approved' ? 'approved' : 'moved to discussion'}!`,
        'success',
      )
      setModal(null)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to submit review', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function respondInterest(interest: Interest, status: 'accepted' | 'declined') {
    setRespondingId(interest.id)
    try {
      await apiRequest(`/api/projects/${interest.project_id}/interest/${interest.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      setInterests((prev) => prev.map((i) => (i.id === interest.id ? { ...i, status } : i)))
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to respond to interest', 'error')
    } finally {
      setRespondingId(null)
    }
  }

  if (loading || !user) return null

  const pending = projects.filter((p) => p.status === 'pending_review')
  const discussion = projects.filter((p) => p.status === 'needs_discussion')
  const pendingInterests = interests.filter((i) => i.status === 'pending')
  const visible = tab === 'pending_review' ? pending : discussion

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Project Triage</h1>

        <Tabs
          tabs={[
            {
              key: 'pending_review',
              label: (
                <>
                  {`Pending Review`}
                  {pending.length > 0 && (
                    <span className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-2">
                      {pending.length}
                    </span>
                  )}
                </>
              ),
            },
            {
              key: 'needs_discussion',
              label: (
                <>
                  {`Needs Discussion`}
                  {discussion.length > 0 && (
                    <span className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-2">
                      {discussion.length}
                    </span>
                  )}
                </>
              ),
            },
            {
              key: 'interests',
              label: (
                <>
                  Volunteer Interests
                  {pendingInterests.length > 0 && (
                    <span className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-2">
                      {pendingInterests.length}
                    </span>
                  )}
                </>
              ),
            },
          ]}
          activeTab={tab}
          onChange={setTab}
        />

        {tab === 'interests' ? (
          <>
            {/* TODO: add typeahead volunteer filtering so admins can search interests by volunteer name */}
            <div className="mb-5 flex items-end gap-3">
              <FilterDropdown
                id="interest-status-filter"
                label="Status"
                ariaLabel="Status"
                value={interestStatusFilter}
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'accepted', label: 'Accepted' },
                  { value: 'declined', label: 'Declined' },
                  { value: 'withdrawn', label: 'Withdrawn' },
                  { value: '', label: 'All' },
                ]}
                onChange={(v) => {
                  setLoadingInterests(true)
                  setInterestStatusFilter(v)
                }}
              />
            </div>

            {loadingInterests ? (
              <div className="text-center py-10 text-text-light">Loading…</div>
            ) : interests.length === 0 ? (
              <p>No {interestStatusFilter || ''} interests found.</p>
            ) : (
              <div className={CARD_GRID_CLASSES}>
                {interests.map((i) => (
                  <div
                    key={i.id}
                    className="card bg-surface rounded-xl shadow px-5 py-4 overflow-hidden wrap-break-word"
                  >
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div>
                        <p className="font-semibold m-0">
                          <Link
                            href={`/admin/volunteers/${i.volunteer_id}`}
                            className="text-secondary-dark no-underline hover:text-primary"
                          >
                            {i.volunteer_name}
                          </Link>
                          <span className="font-normal text-sm text-text-light">
                            {' '}
                            wants to{' '}
                            {i.interest_type === 'want_to_own' ? 'own' : 'contribute to'}{' '}
                          </span>
                          <Link
                            href={`/projects/${i.project_id}`}
                            className="text-primary no-underline hover:underline"
                          >
                            {i.project_title}
                          </Link>
                        </p>
                        <p className="text-xs text-text-light m-0 mt-1">
                          {new Date(i.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {' · '}Owner: {i.owner_name ?? 'None'}
                          {' · '}Project:{' '}
                          <span className={statusBadgeClasses(i.project_status)}>
                            {STATUS_LABELS[i.project_status] ?? i.project_status}
                          </span>
                        </p>
                      </div>
                      <span
                        className={statusBadgeClasses(
                          i.status === 'pending'
                            ? 'seeking_help'
                            : i.status === 'accepted'
                              ? 'completed'
                              : 'on_hold',
                        )}
                      >
                        {i.status}
                      </span>
                    </div>

                    {i.message && (
                      <p className="text-sm text-text-light italic my-2">
                        &ldquo;{i.message}&rdquo;
                      </p>
                    )}

                    {i.volunteer_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 my-2">
                        {i.volunteer_skills.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center px-2 py-0.5 bg-accent text-secondary-dark rounded-full text-xs font-medium dark:bg-[#374151] dark:text-[#D1D5DB]"
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {i.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={() => respondInterest(i, 'accepted')}
                          disabled={respondingId === i.id}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => respondInterest(i, 'declined')}
                          disabled={respondingId === i.id}
                        >
                          Decline
                        </Button>
                        <Button size="sm" variant="ghost" href={`/projects/${i.project_id}`}>
                          View Project
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {loadingProjects ? (
              <div className="text-center py-10 text-text-light">Loading…</div>
            ) : visible.length === 0 ? (
              <p>No projects awaiting {tab === 'pending_review' ? 'review' : 'discussion'}.</p>
            ) : (
              <div className={CARD_GRID_CLASSES}>
                {/* TODO: for needs_discussion projects, show the feedback message sent to the volunteer and allow admins to send follow-up messages */}
                {visible.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={{
                      ...p,
                      owner: p.proposed_by
                        ? {
                            name: `Proposed by: ${typeof p.proposed_by === 'string' ? p.proposed_by : p.proposed_by.name}`,
                          }
                        : null,
                    }}
                    action={
                      <Button size="sm" onClick={() => openReview(p)}>
                        Review
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {modal && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">Review Project</h2>
              <Button variant="ghost" icon onClick={closeModal} aria-label="Close">
                ×
              </Button>
            </div>

            <div className="p-6">
              <h3 style={{ marginBottom: 8 }}>{modal.project.title}</h3>
              <p
                className="text-text-light"
                style={{
                  whiteSpace: 'pre-wrap',
                  marginBottom: 16,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {modal.project.description}
              </p>

              <form onSubmit={submitReview}>
                <div className="mb-5">
                  <label>Decision</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    >
                      <input
                        type="radio"
                        name="decision"
                        value="approved"
                        checked={decision === 'approved'}
                        onChange={() => setDecision('approved')}
                      />
                      <span>
                        <strong>Approve</strong> — Make visible to volunteers
                      </span>
                    </label>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    >
                      <input
                        type="radio"
                        name="decision"
                        value="needs_discussion"
                        checked={decision === 'needs_discussion'}
                        onChange={() => setDecision('needs_discussion')}
                      />
                      <span>
                        <strong>Needs Discussion</strong> — Reach out to proposer
                      </span>
                    </label>
                  </div>
                </div>

                {decision === 'needs_discussion' && (
                  <div className="mb-5">
                    <label htmlFor="feedback-proposer">Message to Proposer</label>
                    <textarea
                      id="feedback-proposer"
                      aria-label="Message to Proposer"
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Explain what you'd like to discuss…"
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                <div className="mb-5">
                  <label htmlFor="review-notes">Internal Notes (not shared)</label>
                  <textarea
                    id="review-notes"
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Notes for other admins…"
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="px-6 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={closeModal}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
