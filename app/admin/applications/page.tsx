'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { client } from '@/lib/client'
import { useToast } from '@/lib/toast'

interface Application {
  id: number
  name: string
  email: string | null
  bio: string | null
  applicationMessage: string | null
  approvalStatus: string
  createdAt: string
  rejectedAt: string | null
  anonymiseAt: string | null
  adminNotes: string | null
  applicantNotes: string | null
  reviewer: { id: number; name: string } | null
  previousRejections: Array<{
    rejectedAt: string
    adminNotes: string | null
    applicantNotes: string | null
  }>
  availabilityHoursPerWeek: number | null
  location: string | null
  country: string | null
  localGroup: string | null
  signalNumber: string | null
  whatsappNumber: string | null
  discordHandle: string | null
  contactNotes: string | null
  skills: Array<{ id: number; name: string; categoryName: string }>
}

type FilterKey = 'mine' | 'others' | 'approved' | 'rejected' | 'rejected_anonymised'

interface AnonymisedApplication {
  id: number
  rejectedAt: string
  adminNotes: string | null
  applicantNotes: string | null
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
    if (!loading && user && !user.isSuperAdmin) router.push('/')
  }, [user, loading, router])

  const loadApplications = useCallback(
    async function (f: FilterKey) {
      setLoadingData(true)
      try {
        if (f === 'rejected_anonymised') {
          const data = await client.admin.applications.list({ filter: f })
          setAnonymisedApplications(data as unknown as AnonymisedApplication[])
          setApplications([])
        } else {
          const data = await client.admin.applications.list({ filter: f })
          setApplications(data as unknown as Application[])
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
    if (user?.isAdmin) loadApplications(filter)
  }, [user, filter, loadApplications])

  async function handleStartReview(id: number) {
    setStartingReview(id)
    try {
      await client.admin.applications.action({ id: Number(id), action: 'start_review' })
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
    filter === 'rejected_anonymised'
      ? anonymisedApplications.length === 0
      : applications.length === 0

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
    `Applied ${new Date(app.createdAt).toLocaleDateString()}`,
    app.reviewer ? `Reviewer: ${app.reviewer.name}` : null,
  ].filter(Boolean)

  return (
    <div role="article" className="bg-surface rounded-xl shadow p-6">
      <h3 className="m-0 mb-1">{app.name}</h3>
      <p className="text-sm text-text-light mb-4">{meta.join(' · ')}</p>

      {app.approvalStatus === 'REJECTED' && anonymiseDate && (
        <p
          className={`text-sm mb-3 ${daysUntilAnonymise !== null && daysUntilAnonymise <= 1 ? 'text-red-500' : 'text-amber-500'}`}
        >
          Personally Identifiable Information will be anonymised on{' '}
          {anonymiseDate.toLocaleDateString()}
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

      {(app.availabilityHoursPerWeek ||
        app.email ||
        app.signalNumber ||
        app.whatsappNumber ||
        app.discordHandle ||
        app.contactNotes) && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          {app.availabilityHoursPerWeek && (
            <div>
              <h4 className="text-text-light">Availability</h4>
              <p className="text-sm">{app.availabilityHoursPerWeek} hours/week</p>
            </div>
          )}
          {(app.email ||
            app.signalNumber ||
            app.whatsappNumber ||
            app.discordHandle ||
            app.contactNotes) && (
            <div>
              <h4 className="text-text-light">Contact</h4>
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
        <div className="border-t border-brand-border pt-4 mb-4">
          <h4 className="text-text-light">Application</h4>
          <p className="text-sm whitespace-pre-wrap">{app.applicationMessage}</p>
        </div>
      )}

      {app.adminNotes && (
        <div className="mb-4">
          <h4 className="text-text-light">Admin notes</h4>
          <p className="text-sm whitespace-pre-wrap">{app.adminNotes}</p>
        </div>
      )}

      {app.applicantNotes && (
        <div className="mb-4">
          <h4 className="text-text-light">
            Message to applicant{' '}
            <span className="font-normal normal-case text-xs">(sent on rejection only)</span>
          </h4>
          <p className="text-sm whitespace-pre-wrap">{app.applicantNotes}</p>
        </div>
      )}

      {app.previousRejections.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3">
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

      <div className="flex gap-2 justify-end border-t border-brand-border pt-4 mt-2">
        {app.approvalStatus === 'PENDING' ? (
          <Button onClick={() => onStartReview(app.id)} disabled={startingReview === app.id}>
            Start Review
          </Button>
        ) : app.approvalStatus === 'UNDER_REVIEW' ? (
          <Button onClick={() => onNavigate(app.id)}>Continue Review</Button>
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
        [Identity anonymised] · Rejected {new Date(app.rejectedAt).toLocaleDateString()}
      </p>
      {app.adminNotes && (
        <div className="mb-4">
          <h4 className="text-text-light">Admin notes</h4>
          <p className="text-sm whitespace-pre-wrap">{app.adminNotes}</p>
        </div>
      )}
      {app.applicantNotes && (
        <div className="mb-4">
          <h4 className="text-text-light">
            Message to applicant{' '}
            <span className="font-normal normal-case text-xs">(sent on rejection only)</span>
          </h4>
          <p className="text-sm whitespace-pre-wrap">{app.applicantNotes}</p>
        </div>
      )}
    </div>
  )
}
