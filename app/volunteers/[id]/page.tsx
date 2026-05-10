'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Skill {
  id: number
  name: string
  category_name: string
}

interface Endorsement {
  id: number
  skill_id: number
  skill_name: string
  rating: string
}

interface Project {
  id: number
  title: string
  status: string
  role: string
}

interface CompletedTask {
  title: string
  review_rating: string
  feedback_to_volunteer: string | null
  reviewed_at: string | null
  skill_name: string | null
}

interface VolunteerDetail {
  id: number
  name: string
  bio: string | null
  location: string | null
  local_group: string | null
  availability_hours_per_week: number | null
  other_skills: string | null
  consent_share_contact_info_with_project_owner: boolean
  email: string | null
  discord_handle: string | null
  signal_number: string | null
  whatsapp_number: string | null
  contact_notes: string | null
  skills: Skill[]
  endorsements: Endorsement[]
  projects: Project[]
  completed_tasks: CompletedTask[]
}

export default function VolunteerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()
  const [volunteer, setVolunteer] = useState<VolunteerDetail | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<VolunteerDetail>(`/api/volunteers/${id}`)
      .then((data) => {
        setVolunteer(data)
        setLoadingProfile(false)
      })
      .catch(() => {
        setNotFound(true)
        setLoadingProfile(false)
      })
  }, [user, id])

  if (loading || !user) return null

  if (loadingProfile) {
    return (
      <>
        <Header />
        <main className="max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading profile…</div>
        </main>
      </>
    )
  }

  if (notFound || !volunteer) {
    return (
      <>
        <Header />
        <main className="max-w-350 mx-auto px-6 py-5 pb-15">
          <p className="text-[color:var(--error)]">Volunteer not found.</p>
          <Button href="/volunteers" variant="secondary" className="mt-4">
            Back to Volunteers
          </Button>
        </main>
      </>
    )
  }

  const endorsedSkillIds = new Set(volunteer.endorsements.map((e) => e.skill_id))
  const hasContact =
    volunteer.email ||
    volunteer.discord_handle ||
    volunteer.signal_number ||
    volunteer.whatsapp_number

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div className="mb-5">
          <Link href="/volunteers" className="text-text-light">
            &larr; Back to Volunteers
          </Link>
        </div>

        <div id="profileContent">
          <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
            <h1 id="volunteerName" className="m-0 mb-2">
              {volunteer.name}
            </h1>

            {(volunteer.location || volunteer.local_group) && (
              <p className="text-text-light mb-4 text-sm">
                {[volunteer.location, volunteer.local_group].filter(Boolean).join(' · ')}
              </p>
            )}

            <div id="volunteerBio" className="whitespace-pre-wrap mb-5">
              {volunteer.bio || <em className="text-text-light">No bio provided</em>}
            </div>

            <h3>Skills</h3>
            <div id="volunteerSkills" className="flex flex-wrap gap-1.5 mb-5">
              {volunteer.skills.length > 0 ? (
                volunteer.skills.map((s) => (
                  <span
                    key={s.id}
                    className={`inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]${endorsedSkillIds.has(s.id) ? ' matched' : ''}`}
                  >
                    {s.name}
                    {endorsedSkillIds.has(s.id) ? ' ✓' : ''}
                  </span>
                ))
              ) : (
                <em className="text-text-light">No skills listed</em>
              )}
            </div>

            {volunteer.other_skills && (
              <div className="mb-5">
                <h4 className="text-text-light">Other Skills</h4>
                <p>{volunteer.other_skills}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-5">
              {volunteer.availability_hours_per_week && (
                <div>
                  <h4 className="text-text-light">Availability</h4>
                  <p id="availabilityText">{volunteer.availability_hours_per_week} hours/week</p>
                </div>
              )}

              <div id="contactInfo" style={{ display: hasContact ? 'block' : 'none' }}>
                <h4 className="text-text-light">Contact</h4>
                <div>
                  {volunteer.email && <div>Email: {volunteer.email}</div>}
                  {volunteer.discord_handle && <div>Discord: {volunteer.discord_handle}</div>}
                  {volunteer.signal_number && <div>Signal: {volunteer.signal_number}</div>}
                  {volunteer.whatsapp_number && <div>WhatsApp: {volunteer.whatsapp_number}</div>}
                  {volunteer.contact_notes && (
                    <div>
                      <em>{volunteer.contact_notes}</em>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {volunteer.endorsements.length > 0 && (
            <div
              id="endorsementsSection"
              className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
            >
              <h2>Verified Skills</h2>
              <p className="text-text-light mb-3">
                Skills verified through completed work on the platform.
              </p>
              <div id="endorsementsList" className="flex flex-wrap gap-1.5">
                {volunteer.endorsements.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]"
                    style={{
                      borderLeft: `3px solid ${e.rating === 'strong' ? 'var(--success)' : 'var(--secondary)'}`,
                    }}
                  >
                    {e.skill_name}{' '}
                    <small
                      style={{
                        color: e.rating === 'strong' ? 'var(--success)' : 'var(--secondary)',
                      }}
                    >
                      {e.rating}
                    </small>
                  </span>
                ))}
              </div>
            </div>
          )}

          {volunteer.completed_tasks.length > 0 && (
            <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
              <h2>Completed Starter Tasks</h2>
              {volunteer.completed_tasks.map((t, i) => (
                <div key={i} className="py-3 border-b border-brand-border">
                  <div className="flex justify-between items-center">
                    <strong>{t.title}</strong>
                    <span
                      className={`text-sm font-medium ${t.review_rating === 'excellent' ? 'text-[color:var(--success)]' : 'text-secondary'}`}
                    >
                      {t.review_rating}
                    </span>
                  </div>
                  {t.skill_name && (
                    <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB] mt-1">
                      {t.skill_name}
                    </span>
                  )}
                  {t.feedback_to_volunteer && (
                    <p className="mt-2 text-sm text-text-light italic">
                      &ldquo;{t.feedback_to_volunteer}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {volunteer.projects.length > 0 && (
            <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
              <h2>Project History</h2>
              {volunteer.projects.map((p) => (
                <div key={p.id} className="py-3 border-b border-brand-border">
                  <div className="flex justify-between items-center">
                    <Link href={`/projects/${p.id}`} className="font-semibold text-primary-dark">
                      {p.title}
                    </Link>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${p.status === 'in_progress' || p.status === 'completed' ? 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]' : p.status === 'on_hold' ? 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]' : p.status === 'open' ? 'bg-[#E0E7FF] text-[#3730A3] dark:bg-[#312E81] dark:text-[#A5B4FC]' : p.status === 'assigned' || p.status === 'seeking_help' ? 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]' : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]'}`}
                    >
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-text-light mt-1">
                    {p.role === 'owner' ? 'Project owner' : 'Proposer'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
