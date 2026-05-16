'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
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

export default function ApplicationsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [applications, setApplications] = useState<Application[]>([])
  const [anonymisedApplications, setAnonymisedApplications] = useState<AnonymisedApplication[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('mine')
  const [startingReview, setStartingReview] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_super_admin) router.push('/')
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

  async function handleStartReview(id: number) {
    setStartingReview(id)
    try {
      await apiRequest(`/api/admin/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'start_review' }),
      })
    } catch {
      // ignore — navigate anyway, page will show current status
    } finally {
      setStartingReview(null)
      router.push(`/admin/applications/${id}`)
    }
  }

  if (loading || !user) return null

  const filterOptions = [
    { value: 'mine', label: 'Pending & Under Review by Me' },
    { value: 'others', label: 'Under Review by Others' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'rejected_anonymised', label: 'Rejected – Anonymised' },
  ]

  const emptyLabel = filterOptions.find((o) => o.value === filter)?.label.toLowerCase() ?? ''
  const isEmpty =
    filter === 'rejected_anonymised' ? anonymisedApplications.length === 0 : applications.length === 0

  return (
    <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
      <h1>Applications</h1>
      <p className="text-text-light mb-6">Review new volunteer applications.</p>

      <div className="mb-6">
        <FilterDropdown
          id="applications-filter"
          label="Show"
          ariaLabel="Filter applications"
          value={filter}
          options={filterOptions}
          onChange={(v) => setFilter(v as FilterKey)}
        />
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
              startingReview={startingReview}
              onStartReview={handleStartReview}
              onNavigate={(id) => router.push(`/admin/applications/${id}`)}
            />
          ))}
        </div>
      )}

    </main>
  )
}

function ApplicationCard({
  app,
  startingReview,
  onStartReview,
  onNavigate,
}: {
  app: Application
  startingReview: number | null
  onStartReview: (id: number) => void
  onNavigate: (id: number) => void
}) {
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

  return (
    <div role="article" className="bg-surface rounded-xl shadow p-6">
      <h3 className="m-0 mb-1">{app.name}</h3>
      <p className="text-sm text-text-light mb-4">{meta.join(' · ')}</p>

      {app.approval_status === 'REJECTED' && anonymiseDate && (
        <p className={`text-sm mb-3 ${daysUntilAnonymise !== null && daysUntilAnonymise <= 1 ? 'text-red-500' : 'text-amber-500'}`}>
          Personally Identifiable Information will be anonymised on {anonymiseDate.toLocaleDateString()}
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
        {app.approval_status === 'PENDING' ? (
          <Button
            onClick={() => onStartReview(app.id)}
            disabled={startingReview === app.id}
          >
            Start Review
          </Button>
        ) : app.approval_status === 'UNDER_REVIEW' ? (
          <Button onClick={() => onNavigate(app.id)}>
            Continue Review
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => onNavigate(app.id)}>
            View
          </Button>
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
