'use client'

import { use } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'

export default function VolunteerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user, loading } = useRequireAuth()

  const {
    data: volunteer,
    isLoading: loadingProfile,
    isError,
  } = useQuery({
    ...orpc.volunteers.getById.queryOptions({ input: { id: parseInt(id, 10) } }),
    enabled: !!user,
  })

  if (loading || !user) return null

  if (loadingProfile) {
    return (
      <>
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading profile…</div>
        </main>
      </>
    )
  }

  if (isError || !volunteer) {
    return (
      <>
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <p className="text-[color:var(--error)]">Volunteer not found.</p>
          <Button href="/volunteers" variant="secondary" className="mt-4">
            Back to Volunteers
          </Button>
        </main>
      </>
    )
  }

  const skills = volunteer.skills ?? []
  const endorsements = volunteer.endorsements ?? []
  const endorsedSkillIds = new Set(endorsements.map((e) => e.skillId))
  const hasContact =
    volunteer.email || volunteer.discordHandle || volunteer.signalNumber || volunteer.whatsappNumber

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
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

            {(volunteer.location || volunteer.localGroup) && (
              <p className="text-text-light mb-4 text-sm">
                {[volunteer.location, volunteer.localGroup].filter(Boolean).join(' · ')}
              </p>
            )}

            <div id="volunteerBio" className="whitespace-pre-wrap mb-5">
              {volunteer.bio || <em className="text-text-light">No bio provided</em>}
            </div>

            <h3>Skills</h3>
            <div id="volunteerSkills" className="flex flex-wrap gap-1.5 mb-5">
              {skills.length > 0 ? (
                skills.map((s) => (
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

            {volunteer.otherSkills && (
              <div className="mb-5">
                <h4 className="text-text-light">Other Skills</h4>
                <p>{volunteer.otherSkills}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-5">
              {volunteer.availabilityHoursPerWeek && (
                <div>
                  <h4 className="text-text-light">Availability</h4>
                  <p id="availabilityText">{volunteer.availabilityHoursPerWeek} hours/week</p>
                </div>
              )}

              <div id="contactInfo" style={{ display: hasContact ? 'block' : 'none' }}>
                <h4 className="text-text-light">Contact</h4>
                <div>
                  {volunteer.email && <div>Email: {volunteer.email}</div>}
                  {volunteer.discordHandle && <div>Discord: {volunteer.discordHandle}</div>}
                  {volunteer.signalNumber && <div>Signal: {volunteer.signalNumber}</div>}
                  {volunteer.whatsappNumber && <div>WhatsApp: {volunteer.whatsappNumber}</div>}
                  {volunteer.contactNotes && (
                    <div>
                      <em>{volunteer.contactNotes}</em>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {endorsements.length > 0 && (
            <div
              id="endorsementsSection"
              className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
            >
              <h2>Verified Skills</h2>
              <p className="text-text-light mb-3">
                Skills verified through completed work on the platform.
              </p>
              <div id="endorsementsList" className="flex flex-wrap gap-1.5">
                {endorsements.map((e) => (
                  <span
                    key={e.skillId}
                    className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]"
                    style={{
                      borderLeft: `3px solid ${e.rating === 'strong' ? 'var(--success)' : 'var(--secondary)'}`,
                    }}
                  >
                    {e.skillName}{' '}
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

          {volunteer.completedTasks.length > 0 && (
            <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
              <h2>Completed Starter Tasks</h2>
              {volunteer.completedTasks.map((t, i) => (
                <div key={i} className="py-3 border-b border-brand-border">
                  <div className="flex justify-between items-center">
                    <strong>{t.title}</strong>
                    <span
                      className={`text-sm font-medium ${t.reviewRating === 'excellent' ? 'text-[color:var(--success)]' : 'text-secondary'}`}
                    >
                      {t.reviewRating}
                    </span>
                  </div>
                  {t.skillName && (
                    <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB] mt-1">
                      {t.skillName}
                    </span>
                  )}
                  {t.feedbackToVolunteer && (
                    <p className="mt-2 text-sm text-text-light italic">
                      &ldquo;{t.feedbackToVolunteer}&rdquo;
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
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${p.status === 'in_progress' || p.status === 'completed' ? 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]' : p.status === 'on_hold' ? 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]' : p.status === 'seeking_help' ? 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]' : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]'}`}
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
