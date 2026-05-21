'use client'

import { useState } from 'react'
import { useRequireAdmin } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import Button from '@/components/Button'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import {
  ProjectCard,
  type Project as CardProject,
  statusBadgeClasses,
  STATUS_LABELS,
  CARD_GRID_CLASSES,
} from '@/components/ProjectCard'
import Tabs from '@/components/Tabs'
import CommentThread from '@/components/CommentThread'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { InterestStatus, ProjectStatus } from '@/generated/prisma/enums'

interface Project extends CardProject {
  ownerId: number | null
  reviewNotes: string | null
}

interface ReviewModal {
  project: Project
}

export default function TriagePage() {
  const { user, loading } = useRequireAdmin()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'pending_review' | 'needs_discussion' | 'interests'>(
    'pending_review',
  )
  const [modal, setModal] = useState<ReviewModal | null>(null)
  const [decision, setDecision] = useState<'approved' | 'needs_discussion'>('approved')
  const [feedback, setFeedback] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  const {
    value: interestStatusFilter,
    onChange: setInterestStatusFilter,
    options: interestStatusOptions,
  } = useFilterOptions(
    [
      { value: 'pending', label: 'Pending' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'declined', label: 'Declined' },
      { value: 'withdrawn', label: 'Withdrawn' },
      { value: '', label: 'All' },
    ],
    'pending',
  )

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    ...orpc.admin.triage.list.queryOptions(),
    enabled: !!user?.isAdmin,
  })

  const { data: interests = [], isLoading: loadingInterests } = useQuery({
    ...orpc.admin.interests.list.queryOptions({
      input: interestStatusFilter ? { status: interestStatusFilter } : {},
    }),
    enabled: !!user?.isAdmin,
  })

  const reviewMutation = useMutation({
    ...orpc.admin.projects.review.mutationOptions(),
    onSuccess: (_, variables) => {
      showToast(
        `Project ${variables.status === 'approved' ? 'approved' : 'moved to discussion'}!`,
        'success',
      )
      setModal(null)
      void queryClient.invalidateQueries({ queryKey: orpc.admin.triage.list.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to submit review', 'error')
    },
  })

  const respondInterestMutation = useMutation({
    ...orpc.projects.respondToInterest.mutationOptions(),
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to respond to interest', 'error')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.admin.interests.list.key() })
    },
  })

  function openReview(project: Project) {
    setModal({ project })
    setDecision('approved')
    setFeedback('')
    setReviewNotes(project.reviewNotes || '')
  }

  function closeModal() {
    setModal(null)
  }

  function submitReview(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    reviewMutation.mutate({
      id: modal.project.id,
      status: decision,
      comment: decision === 'needs_discussion' ? feedback : null,
      reviewNotes: reviewNotes || null,
      targetStatus: modal.project.ownerId ? 'seeking_help' : 'seeking_owner',
    })
  }

  if (loading || !user) return null

  const pending = (projects as unknown as Project[]).filter(
    (p) => p.status === ProjectStatus.pending_review,
  )
  const discussion = (projects as unknown as Project[]).filter(
    (p) => p.status === ProjectStatus.needs_discussion,
  )
  const pendingInterests = interests.filter((i) => i.status === InterestStatus.pending)
  const visible = tab === 'pending_review' ? pending : discussion

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
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
            <div className="mb-5 flex items-end gap-3">
              <FilterDropdown
                id="interest-status-filter"
                label="Status"
                ariaLabel="Status"
                value={interestStatusFilter}
                options={interestStatusOptions}
                onChange={setInterestStatusFilter}
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
                            href={`/admin/volunteers/${i.volunteerId}`}
                            className="text-secondary-dark no-underline hover:text-primary"
                          >
                            {i.volunteerName}
                          </Link>
                          <span className="font-normal text-sm text-text-light">
                            {' '}
                            wants to{' '}
                            {i.interestType === 'want_to_own' ? 'own' : 'contribute to'}{' '}
                          </span>
                          <Link
                            href={`/projects/${i.projectId}`}
                            className="text-primary no-underline hover:underline"
                          >
                            {i.projectTitle}
                          </Link>
                        </p>
                        <p className="text-xs text-text-light m-0 mt-1">
                          {i.createdAt
                            ? new Date(i.createdAt).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : ''}
                          {' · '}Owner: {i.ownerName ?? 'None'}
                          {' · '}Project:{' '}
                          <span className={statusBadgeClasses(i.projectStatus)}>
                            {STATUS_LABELS[i.projectStatus] ?? i.projectStatus}
                          </span>
                        </p>
                      </div>
                      <span
                        className={statusBadgeClasses(
                          i.status === InterestStatus.pending
                            ? 'seeking_help'
                            : i.status === InterestStatus.accepted
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

                    {i.volunteerSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1 my-2">
                        {i.volunteerSkills.map((s: { id: number; name: string }) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center px-2 py-0.5 bg-accent text-secondary-dark rounded-full text-xs font-medium dark:bg-[#374151] dark:text-[#D1D5DB]"
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {i.status === InterestStatus.pending && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={() =>
                            respondInterestMutation.mutate({
                              projectId: i.projectId,
                              interestId: i.id,
                              status: InterestStatus.accepted,
                            })
                          }
                          disabled={respondInterestMutation.isPending}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            respondInterestMutation.mutate({
                              projectId: i.projectId,
                              interestId: i.id,
                              status: 'declined',
                            })
                          }
                          disabled={respondInterestMutation.isPending}
                        >
                          Decline
                        </Button>
                        <Button size="sm" variant="ghost" href={`/projects/${i.projectId}`}>
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
                {visible.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={{
                      ...p,
                      owner: p.proposedBy
                        ? {
                            name: `Proposed by: ${typeof p.proposedBy === 'string' ? p.proposedBy : p.proposedBy.name}`,
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

              <div className="mb-5">
                <label>Discussion</label>
                <div className="mt-2 max-h-60 overflow-auto">
                  <CommentThread
                    workItemId={modal.project.id}
                    canPost
                    placeholder="Reply to the proposer…"
                  />
                </div>
              </div>

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
                  <Button type="submit" disabled={reviewMutation.isPending}>
                    {reviewMutation.isPending ? 'Submitting…' : 'Submit Review'}
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
