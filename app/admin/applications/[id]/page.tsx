'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

export default function ApplicationReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const [adminNotes, setAdminNotes] = useState('')
  const [applicantNotes, setApplicantNotes] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.isSuperAdmin) router.push('/')
  }, [user, loading, router])

  const { data: app, isPending: loadingData } = useQuery({
    ...orpc.admin.applications.getById.queryOptions({ input: { id: Number(id) } }),
    enabled: !!user?.isSuperAdmin,
  })

  useEffect(() => {
    if (!app || initialized) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true)
    setAdminNotes(app.adminNotes ?? '')
    setApplicantNotes(app.applicantNotes ?? '')
  }, [app, initialized])

  const saveNotesMutation = useMutation({
    ...orpc.admin.applications.action.mutationOptions(),
    onSuccess: () => {
      showToast('Notes saved', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.admin.applications.getById.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to save notes', 'error')
    },
  })

  const actionMutation = useMutation({
    ...orpc.admin.applications.action.mutationOptions(),
    onSuccess: (_, variables) => {
      showToast(
        variables.action === 'approve' ? 'Application approved' : 'Application rejected',
        'success',
      )
      router.push('/admin/applications')
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to action application', 'error')
    },
  })

  const submitting = saveNotesMutation.isPending || actionMutation.isPending

  function handleSaveNotes() {
    if (!app) return
    saveNotesMutation.mutate({ id: app.id, action: 'update_notes', adminNotes, applicantNotes })
  }

  function handleConfirm() {
    if (!app || !confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    actionMutation.mutate({ id: app.id, action, adminNotes, applicantNotes })
  }

  if (loading || !user) return null

  if (loadingData) {
    return (
      <main className="w-full max-w-350 mx-auto px-6 py-5">
        <p className="text-text-light">Loading…</p>
      </main>
    )
  }

  if (!app) {
    return (
      <main className="w-full max-w-350 mx-auto px-6 py-5">
        <p className="text-text-light">Application not found.</p>
      </main>
    )
  }

  const anonymiseDate = app.anonymiseAt ? new Date(app.anonymiseAt) : null
  // Date.now() is intentionally impure here — we want the current wall-clock
  // time to compute days remaining. Alternatives (prop drilling, context, ref)
  // would be disproportionate for a read-only display calculation.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const daysUntilAnonymise = anonymiseDate
    ? Math.ceil((anonymiseDate.getTime() - now) / (1000 * 60 * 60 * 24))
    : null

  const locationParts = [app.localGroup, app.country ?? app.location].filter(Boolean)
  const meta = [
    locationParts.length ? locationParts.join(' · ') : null,
    app.createdAt ? `Applied ${app.createdAt.toLocaleDateString()}` : null,
    app.reviewer ? `Reviewer: ${app.reviewer.name}` : null,
  ].filter(Boolean)

  const canAction = app.approvalStatus === 'PENDING' || app.approvalStatus === 'UNDER_REVIEW'

  return (
    <main className="w-full max-w-2xl mx-auto px-6 py-5 pb-15">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/applications')}>
          ← Back to applications
        </Button>
      </div>

      <h1 className="mb-1">{app.name}</h1>
      <p className="text-sm text-text-light mb-6">{meta.join(' · ')}</p>

      {app.approvalStatus === 'REJECTED' && anonymiseDate && (
        <p
          className={`text-sm mb-4 ${daysUntilAnonymise !== null && daysUntilAnonymise <= 1 ? 'text-red-500' : 'text-amber-500'}`}
        >
          Personally Identifiable Information will be anonymised on{' '}
          {anonymiseDate.toLocaleDateString()}
          {daysUntilAnonymise !== null && daysUntilAnonymise >= 0
            ? ` (${daysUntilAnonymise === 0 ? 'today' : `${daysUntilAnonymise} day${daysUntilAnonymise === 1 ? '' : 's'}`})`
            : ''}
        </p>
      )}

      {app.bio && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-1">Bio</h2>
          <p className="text-sm whitespace-pre-wrap">{app.bio}</p>
        </div>
      )}

      {app.skills.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-2">Skills</h2>
          <div className="flex flex-wrap gap-1.5">
            {app.skills.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]"
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {(app.availabilityHoursPerWeek ||
        app.email ||
        app.signalNumber ||
        app.whatsappNumber ||
        app.discordHandle ||
        app.contactNotes) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {app.availabilityHoursPerWeek && (
            <div>
              <h2 className="text-base font-semibold mb-1">Availability</h2>
              <p className="text-sm">{app.availabilityHoursPerWeek} hours/week</p>
            </div>
          )}
          {(app.email ||
            app.signalNumber ||
            app.whatsappNumber ||
            app.discordHandle ||
            app.contactNotes) && (
            <div>
              <h2 className="text-base font-semibold mb-1">Contact</h2>
              <div className="text-sm">
                {app.email && <div>Email: {app.email}</div>}
                {app.discordHandle && <div>Discord: {app.discordHandle}</div>}
                {app.signalNumber && <div>Signal: {app.signalNumber}</div>}
                {app.whatsappNumber && <div>WhatsApp: {app.whatsappNumber}</div>}
                {app.contactNotes && (
                  <div className="text-text-light mt-1 italic">{app.contactNotes}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {app.applicationMessage && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-1">Application message</h2>
          <p className="text-sm whitespace-pre-wrap">{app.applicationMessage}</p>
        </div>
      )}

      {app.previousRejections.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3">
            {app.previousRejections.length === 1
              ? 'Previously rejected'
              : `Previously rejected ${app.previousRejections.length} times`}
          </p>
          {app.previousRejections.map((r, i) => (
            <div
              key={i}
              className={i > 0 ? 'mt-3 pt-3 border-t border-amber-200 dark:border-amber-700' : ''}
            >
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
                {new Date(r.rejectedAt).toLocaleDateString()}
              </p>
              {r.adminNotes && (
                <div className="mb-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">
                    Admin notes
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">
                    {r.adminNotes}
                  </p>
                </div>
              )}
              {r.applicantNotes && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">
                    Message sent to applicant
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">
                    {r.applicantNotes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-brand-border pt-6 mt-6">
        <h2 className="text-base font-semibold mb-4">Notes</h2>

        <label htmlFor="admin-notes" className="block text-sm font-medium mb-1">
          Internal admin notes
          <span className="text-text-light font-normal ml-1">(not sent to applicant)</span>
        </label>
        <textarea
          id="admin-notes"
          className="w-full border border-border rounded-lg p-3 text-sm mb-4 bg-background"
          rows={4}
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Notes visible only to admins…"
        />

        <label htmlFor="applicant-notes" className="block text-sm font-medium mb-1">
          Message to applicant
          <span className="text-text-light font-normal ml-1">
            (only sent if applicant is rejected)
          </span>
        </label>
        <textarea
          id="applicant-notes"
          className="w-full border border-border rounded-lg p-3 text-sm mb-6 bg-background"
          rows={4}
          value={applicantNotes}
          onChange={(e) => setApplicantNotes(e.target.value)}
          placeholder="Optional message to applicant…"
        />

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={handleSaveNotes} disabled={submitting}>
            Save Notes
          </Button>
          {canAction && (
            <>
              <Button
                variant="danger"
                onClick={() => setConfirmAction('reject')}
                disabled={submitting}
              >
                Reject
              </Button>
              <Button onClick={() => setConfirmAction('approve')} disabled={submitting}>
                Approve
              </Button>
            </>
          )}
        </div>
      </div>

      {confirmAction && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmAction(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-surface rounded-xl shadow-lg p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2">
              {confirmAction === 'approve' ? 'Approve' : 'Reject'} application?
            </h2>
            <p className="text-sm text-text-light mb-6">
              {confirmAction === 'approve'
                ? `${app.name} will be approved and notified by email.`
                : `${app.name} will be rejected${applicantNotes ? ' and sent your message' : ''} by email.`}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmAction === 'reject' ? 'danger' : 'primary'}
                disabled={submitting}
                onClick={handleConfirm}
              >
                {confirmAction === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
