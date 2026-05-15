'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface Application {
  id: number
  name: string
  email: string | null
  bio: string | null
  application_message: string | null
  approval_status: string
  created_at: string
  rejected_at: string | null
  anonymise_at: string | null
  admin_notes: string | null
  applicant_notes: string | null
  reviewer: { id: number; name: string } | null
  previous_rejections: Array<{
    rejected_at: string
    admin_notes: string | null
    applicant_notes: string | null
  }>
  availability_hours_per_week: number | null
  location: string | null
  country: string | null
  local_group: string | null
  signal_number: string | null
  whatsapp_number: string | null
  discord_handle: string | null
  contact_notes: string | null
  skills: Array<{ id: number; name: string; category_name: string }>
}

export default function ApplicationReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()

  const [app, setApp] = useState<Application | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [adminNotes, setAdminNotes] = useState('')
  const [applicantNotes, setApplicantNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_super_admin) router.push('/')
  }, [user, loading, router])

  const loadApplication = useCallback(async () => {
    setLoadingData(true)
    try {
      const data = await apiRequest<Application>(`/api/admin/applications/${id}`)
      setApp(data)
      setAdminNotes(data.admin_notes ?? '')
      setApplicantNotes(data.applicant_notes ?? '')
    } catch {
      showToast('Failed to load application', 'error')
    } finally {
      setLoadingData(false)
    }
  }, [id, showToast])

  useEffect(() => {
    if (user?.is_super_admin) loadApplication()
  }, [user, loadApplication])

  async function handleSaveNotes() {
    if (!app) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/applications/${app.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'update_notes', admin_notes: adminNotes, applicant_notes: applicantNotes }),
      })
      showToast('Notes saved', 'success')
      setApp({ ...app, admin_notes: adminNotes, applicant_notes: applicantNotes })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save notes', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirm() {
    if (!app || !confirmAction) return
    setSubmitting(true)
    setConfirmAction(null)
    try {
      await apiRequest(`/api/admin/applications/${app.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: confirmAction,
          admin_notes: adminNotes,
          applicant_notes: applicantNotes,
        }),
      })
      showToast(confirmAction === 'approve' ? 'Application approved' : 'Application rejected', 'success')
      router.push('/admin/applications')
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Failed to ${confirmAction}`, 'error')
      setSubmitting(false)
    }
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

  const anonymiseDate = app.anonymise_at ? new Date(app.anonymise_at) : null
  const daysUntilAnonymise = anonymiseDate
    ? Math.ceil((anonymiseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const locationParts = [app.local_group, app.country ?? app.location].filter(Boolean)
  const meta = [
    locationParts.length ? locationParts.join(' · ') : null,
    `Applied ${new Date(app.created_at).toLocaleDateString()}`,
    app.reviewer ? `Reviewer: ${app.reviewer.name}` : null,
  ].filter(Boolean)

  const canAction = app.approval_status === 'PENDING' || app.approval_status === 'UNDER_REVIEW'

  return (
    <main className="w-full max-w-2xl mx-auto px-6 py-5 pb-15">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/applications')}>
          ← Back to applications
        </Button>
      </div>

      <h1 className="mb-1">{app.name}</h1>
      <p className="text-sm text-text-light mb-6">{meta.join(' · ')}</p>

      {app.approval_status === 'REJECTED' && anonymiseDate && (
        <p className={`text-sm mb-4 ${daysUntilAnonymise !== null && daysUntilAnonymise <= 1 ? 'text-red-500' : 'text-amber-500'}`}>
          PII will be anonymised on {anonymiseDate.toLocaleDateString()}
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

      {(app.availability_hours_per_week ||
        app.email ||
        app.signal_number ||
        app.whatsapp_number ||
        app.discord_handle ||
        app.contact_notes) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {app.availability_hours_per_week && (
            <div>
              <h2 className="text-base font-semibold mb-1">Availability</h2>
              <p className="text-sm">{app.availability_hours_per_week} hours/week</p>
            </div>
          )}
          {(app.email || app.signal_number || app.whatsapp_number || app.discord_handle || app.contact_notes) && (
            <div>
              <h2 className="text-base font-semibold mb-1">Contact</h2>
              <div className="text-sm">
                {app.email && <div>Email: {app.email}</div>}
                {app.discord_handle && <div>Discord: {app.discord_handle}</div>}
                {app.signal_number && <div>Signal: {app.signal_number}</div>}
                {app.whatsapp_number && <div>WhatsApp: {app.whatsapp_number}</div>}
                {app.contact_notes && <div className="text-text-light mt-1 italic">{app.contact_notes}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {app.application_message && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-1">Application message</h2>
          <p className="text-sm whitespace-pre-wrap">{app.application_message}</p>
        </div>
      )}

      {app.previous_rejections.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3">
            {app.previous_rejections.length === 1 ? 'Previously rejected' : `Previously rejected ${app.previous_rejections.length} times`}
          </p>
          {app.previous_rejections.map((r, i) => (
            <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-amber-200 dark:border-amber-700' : ''}>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
                {new Date(r.rejected_at).toLocaleDateString()}
              </p>
              {r.admin_notes && (
                <div className="mb-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">Admin notes</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">{r.admin_notes}</p>
                </div>
              )}
              {r.applicant_notes && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">Message sent to applicant</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">{r.applicant_notes}</p>
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
          <span className="text-text-light font-normal ml-1">(only sent if applicant is rejected)</span>
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
              <Button variant="danger" onClick={() => setConfirmAction('reject')} disabled={submitting}>
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
