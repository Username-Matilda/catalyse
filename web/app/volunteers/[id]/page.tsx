'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
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
  share_contact_directly: boolean
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
      .then(data => {
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
        <main className="container page">
          <div className="loading">Loading profile…</div>
        </main>
      </>
    )
  }

  if (notFound || !volunteer) {
    return (
      <>
        <Header />
        <main className="container page">
          <p style={{ color: 'var(--error)' }}>Volunteer not found.</p>
          <Link href="/volunteers" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to Volunteers</Link>
        </main>
      </>
    )
  }

  const endorsedSkillIds = new Set(volunteer.endorsements.map(e => e.skill_id))
  const hasContact = volunteer.email || volunteer.discord_handle || volunteer.signal_number || volunteer.whatsapp_number

  return (
    <>
      <Header />
      <main className="container page">
        <div style={{ marginBottom: 20 }}>
          <Link href="/volunteers" style={{ color: 'var(--text-light)' }}>&larr; Back to Volunteers</Link>
        </div>

        <div id="profileContent">
          <div className="card">
            <h1 id="volunteerName" style={{ margin: '0 0 8px' }}>{volunteer.name}</h1>

            {(volunteer.location || volunteer.local_group) && (
              <p style={{ color: 'var(--text-light)', marginBottom: 16, fontSize: '0.875rem' }}>
                {[volunteer.location, volunteer.local_group].filter(Boolean).join(' · ')}
              </p>
            )}

            <div id="volunteerBio" style={{ whiteSpace: 'pre-wrap', marginBottom: 20 }}>
              {volunteer.bio || <em style={{ color: 'var(--text-light)' }}>No bio provided</em>}
            </div>

            <h3>Skills</h3>
            <div id="volunteerSkills" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
              {volunteer.skills.length > 0 ? volunteer.skills.map(s => (
                <span
                  key={s.id}
                  className={`skill-tag${endorsedSkillIds.has(s.id) ? ' matched' : ''}`}
                >
                  {s.name}{endorsedSkillIds.has(s.id) ? ' ✓' : ''}
                </span>
              )) : (
                <em style={{ color: 'var(--text-light)' }}>No skills listed</em>
              )}
            </div>

            {volunteer.other_skills && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ color: 'var(--text-light)' }}>Other Skills</h4>
                <p>{volunteer.other_skills}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
              {volunteer.availability_hours_per_week && (
                <div>
                  <h4 style={{ color: 'var(--text-light)' }}>Availability</h4>
                  <p id="availabilityText">{volunteer.availability_hours_per_week} hours/week</p>
                </div>
              )}

              <div id="contactInfo" style={{ display: hasContact ? 'block' : 'none' }}>
                <h4 style={{ color: 'var(--text-light)' }}>Contact</h4>
                <div>
                  {volunteer.email && <div>Email: {volunteer.email}</div>}
                  {volunteer.discord_handle && <div>Discord: {volunteer.discord_handle}</div>}
                  {volunteer.signal_number && <div>Signal: {volunteer.signal_number}</div>}
                  {volunteer.whatsapp_number && <div>WhatsApp: {volunteer.whatsapp_number}</div>}
                  {volunteer.contact_notes && <div><em>{volunteer.contact_notes}</em></div>}
                </div>
              </div>
            </div>
          </div>

          {volunteer.endorsements.length > 0 && (
            <div id="endorsementsSection" className="card">
              <h2>Verified Skills</h2>
              <p style={{ color: 'var(--text-light)', marginBottom: 12 }}>
                Skills verified through completed work on the platform.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {volunteer.endorsements.map(e => (
                  <span
                    key={e.id}
                    className="skill-tag"
                    style={{ borderLeft: `3px solid ${e.rating === 'strong' ? 'var(--success)' : 'var(--secondary)'}` }}
                  >
                    {e.skill_name} <small style={{ color: e.rating === 'strong' ? 'var(--success)' : 'var(--secondary)' }}>{e.rating}</small>
                  </span>
                ))}
              </div>
            </div>
          )}

          {volunteer.completed_tasks.length > 0 && (
            <div className="card">
              <h2>Completed Starter Tasks</h2>
              {volunteer.completed_tasks.map((t, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{t.title}</strong>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: t.review_rating === 'excellent' ? 'var(--success)' : 'var(--secondary)' }}>
                      {t.review_rating}
                    </span>
                  </div>
                  {t.skill_name && <span className="skill-tag" style={{ marginTop: 4 }}>{t.skill_name}</span>}
                  {t.feedback_to_volunteer && (
                    <p style={{ marginTop: 8, fontSize: '0.875rem', color: 'var(--text-light)', fontStyle: 'italic' }}>
                      &ldquo;{t.feedback_to_volunteer}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {volunteer.projects.length > 0 && (
            <div className="card">
              <h2>Project History</h2>
              {volunteer.projects.map(p => (
                <div key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href={`/projects/${p.id}`} style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>
                      {p.title}
                    </Link>
                    <span className={`status-badge status-${p.status}`}>
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginTop: 4 }}>
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
