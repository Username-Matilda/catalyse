'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

type FilterKey = 'mine' | 'others' | 'approved' | 'rejected' | 'rejected_anonymised'

interface AnonymisedApplication {
  id: number
  rejected_at: string
  admin_notes: string | null
  applicant_notes: string | null
}

interface NotesModalState {
  id: number
  name: string
  action: 'approve' | 'reject' | 'edit_notes'
  adminNotes: string
  applicantNotes: string
}

export default function ApplicationsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [applications, setApplications] = useState<Application[]>([])
  const [anonymisedApplications, setAnonymisedApplications] = useState<AnonymisedApplication[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('mine')
  const [submitting, setSubmitting] = useState<number | null>(null)
  const [modal, setModal] = useState<NotesModalState | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  const loadApplications = useCallback(
    async function (f: FilterKey) {
      setLoadingData(true)
      try {
        if (f === 'rejected_anonymised') {
          const data = await apiRequest<AnonymisedApplication[]>(`/api/admin/applications?filter=${f}`)
          setAnonymisedApplications(data)
          setApplications([])
        } else {
          const data = await apiRequest<Application[]>(`/api/admin/applications?filter=${f}`)
          setApplications(data)
          setAnonymisedApplications([])
        }
      } catch {
        showToast('Failed to load applications', 'error')
      } finally {
        setLoadingData(false)
      }
    },
    [showToast],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.is_admin) loadApplications(filter)
  }, [user, filter, loadApplications])

  async function handleAction(
    id: number,
    action: 'start_review' | 'approve' | 'reject' | 'update_notes',
    adminNotes?: string,
    applicantNotes?: string,
  ) {
    setSubmitting(id)
    setModal(null)
    try {
      await apiRequest(`/api/admin/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          ...(adminNotes !== undefined && { admin_notes: adminNotes }),
          ...(applicantNotes !== undefined && { applicant_notes: applicantNotes }),
        }),
      })
      const label =
        action === 'start_review'
          ? 'Review started'
          : action === 'approve'
            ? 'Application approved'
            : action === 'reject'
              ? 'Application rejected'
              : 'Notes updated'
      showToast(label, 'success')
      await loadApplications(filter)
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Failed to ${action}`, 'error')
    } finally {
      setSubmitting(null)
    }
  }

  function openModal(app: Application, action: 'approve' | 'reject' | 'edit_notes') {
    setModal({
      id: app.id,
      name: app.name,
      action,
      adminNotes: app.admin_notes ?? '',
      applicantNotes: app.applicant_notes ?? '',
    })
  }

  if (loading || !user) return null

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: 'mine', label: 'Pending & Under Review by Me' },
    { key: 'others', label: 'Under Review by Others' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'rejected_anonymised', label: 'Rejected – Anonymised' },
  ]

  const emptyLabel = filterOptions.find((o) => o.key === filter)?.label.toLowerCase() ?? ''
  const isEmpty =
    filter === 'rejected_anonymised' ? anonymisedApplications.length === 0 : applications.length === 0

  return (
    <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
      <h1>Applications</h1>
      <p className="text-text-light mb-6">Review new volunteer applications.</p>

      <div className="mb-6">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterKey)}
          className="w-auto"
        >
          {filterOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loadingData ? (
        <p className="text-text-light mt-6">Loading…</p>
      ) : isEmpty ? (
        <p className="text-text-light mt-6">No applications in &ldquo;{emptyLabel}&rdquo;.</p>
      ) : filter === 'rejected_anonymised' ? (
        <div className="flex flex-col gap-4 mt-6">
          {anonymisedApplications.map((a) => (
            <AnonymisedCard key={a.id} app={a} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-6">
          {applications.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              submitting={submitting}
              onStartReview={(id) => handleAction(id, 'start_review')}
              onOpenModal={openModal}
            />
          ))}
        </div>
      )}

      {modal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-surface rounded-xl shadow-lg p-6 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4">
              {modal.action === 'approve'
                ? 'Approve'
                : modal.action === 'reject'
                  ? 'Reject'
                  : 'Edit Notes'}{' '}
              — {modal.name}
            </h2>

            <label className="block text-sm font-medium mb-1">
              Internal admin notes
              <span className="text-text-light font-normal ml-1">(not sent to applicant)</span>
            </label>
            <textarea
              className="w-full border border-border rounded-lg p-3 text-sm mb-4 bg-background"
              rows={3}
              value={modal.adminNotes}
              onChange={(e) => setModal({ ...modal, adminNotes: e.target.value })}
              placeholder="Notes visible only to admins…"
            />

            {(modal.action === 'reject' || modal.action === 'edit_notes') && (
              <>
                <label className="block text-sm font-medium mb-1">
                  Message to applicant
                  <span className="text-text-light font-normal ml-1">
                    {modal.action === 'reject'
                      ? '(included in rejection email)'
                      : '(only sent if applicant is later rejected)'}
                  </span>
                </label>
                <textarea
                  className="w-full border border-border rounded-lg p-3 text-sm mb-4 bg-background"
                  rows={3}
                  value={modal.applicantNotes}
                  onChange={(e) => setModal({ ...modal, applicantNotes: e.target.value })}
                  placeholder="Optional message to applicant…"
                />
              </>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                variant={modal.action === 'reject' ? 'danger' : 'primary'}
                disabled={submitting === modal.id}
                onClick={() =>
                  handleAction(
                    modal.id,
                    modal.action === 'edit_notes' ? 'update_notes' : modal.action,
                    modal.adminNotes,
                    modal.applicantNotes,
                  )
                }
              >
                {modal.action === 'approve'
                  ? 'Approve'
                  : modal.action === 'reject'
                    ? 'Reject'
                    : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ApplicationCard({
  app,
  submitting,
  onStartReview,
  onOpenModal,
}: {
  app: Application
  submitting: number | null
  onStartReview: (id: number) => void
  onOpenModal: (app: Application, action: 'approve' | 'reject' | 'edit_notes') => void
}) {
  const anonymiseDate = app.anonymise_at ? new Date(app.anonymise_at) : null
  const daysUntilAnonymise = anonymiseDate
    ? Math.ceil((anonymiseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const hasActions =
    app.approval_status === 'PENDING' || app.approval_status === 'UNDER_REVIEW'

  const locationParts = [app.local_group, app.country ?? app.location].filter(Boolean)
  const meta = [
    locationParts.length ? locationParts.join(' · ') : null,
    `Applied ${new Date(app.created_at).toLocaleDateString()}`,
    app.reviewer ? `Reviewer: ${app.reviewer.name}` : null,
  ].filter(Boolean)

  return (
    <div role="article" className="bg-surface rounded-xl shadow p-6">
      <h3 className="m-0 mb-1">{app.name}</h3>
      <p className="text-sm text-text-light mb-4">{meta.join(' · ')}</p>

      {app.approval_status === 'REJECTED' && anonymiseDate && (
        <p className={`text-sm mb-3 ${daysUntilAnonymise !== null && daysUntilAnonymise <= 1 ? 'text-red-500' : 'text-amber-500'}`}>
          PII will be anonymised on {anonymiseDate.toLocaleDateString()}
          {daysUntilAnonymise !== null && daysUntilAnonymise >= 0
            ? ` (${daysUntilAnonymise === 0 ? 'today' : `${daysUntilAnonymise} day${daysUntilAnonymise === 1 ? '' : 's'}`})`
            : ''}
        </p>
      )}

      {app.bio && <p className="text-sm whitespace-pre-wrap mb-4">{app.bio}</p>}

      {app.skills.length > 0 && (
        <div className="mb-4">
          <h4 className="text-text-light">Skills</h4>
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
        <div className="grid grid-cols-2 gap-4 mb-4">
          {app.availability_hours_per_week && (
            <div>
              <h4 className="text-text-light">Availability</h4>
              <p className="text-sm">{app.availability_hours_per_week} hours/week</p>
            </div>
          )}
          {(app.email || app.signal_number || app.whatsapp_number || app.discord_handle || app.contact_notes) && (
            <div>
              <h4 className="text-text-light">Contact</h4>
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
        <div className="border-t border-brand-border pt-4 mb-4">
          <h4 className="text-text-light">Application</h4>
          <p className="text-sm whitespace-pre-wrap">{app.application_message}</p>
        </div>
      )}

      {app.admin_notes && (
        <div className="mb-4">
          <h4 className="text-text-light">Admin notes</h4>
          <p className="text-sm whitespace-pre-wrap">{app.admin_notes}</p>
        </div>
      )}

      {app.applicant_notes && (
        <div className="mb-4">
          <h4 className="text-text-light">Message to applicant <span className="font-normal normal-case text-xs">(sent on rejection only)</span></h4>
          <p className="text-sm whitespace-pre-wrap">{app.applicant_notes}</p>
        </div>
      )}

      {app.previous_rejections.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3">
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

      <div className="flex gap-2 justify-end border-t border-brand-border pt-4 mt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenModal(app, 'edit_notes')}
          disabled={submitting === app.id}
        >
          Edit Notes
        </Button>
        {hasActions && (
          <>
            {app.approval_status === 'PENDING' && (
              <Button
                variant="secondary"
                onClick={() => onStartReview(app.id)}
                disabled={submitting === app.id}
              >
                Start Review
              </Button>
            )}
            <Button onClick={() => onOpenModal(app, 'approve')} disabled={submitting === app.id}>
              Approve
            </Button>
            <Button
              variant="danger"
              onClick={() => onOpenModal(app, 'reject')}
              disabled={submitting === app.id}
            >
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function AnonymisedCard({ app }: { app: AnonymisedApplication }) {
  return (
    <div role="article" className="bg-surface rounded-xl shadow p-6 opacity-75">
      <p className="text-sm text-text-light mb-4">
        [Identity anonymised] · Rejected {new Date(app.rejected_at).toLocaleDateString()}
      </p>
      {app.admin_notes && (
        <div className="mb-4">
          <h4 className="text-text-light">Admin notes</h4>
          <p className="text-sm whitespace-pre-wrap">{app.admin_notes}</p>
        </div>
      )}
      {app.applicant_notes && (
        <div className="mb-4">
          <h4 className="text-text-light">
            Message to applicant <span className="font-normal normal-case text-xs">(sent on rejection only)</span>
          </h4>
          <p className="text-sm whitespace-pre-wrap">{app.applicant_notes}</p>
        </div>
      )}
    </div>
  )
}
