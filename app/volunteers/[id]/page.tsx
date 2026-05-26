'use client'

import { use } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import Button from '@/components/Button'
import { Badge } from '@/components/Badge'
import { STATUS_LABELS, projectStatusVariant } from '@/components/ProjectCard'
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
        <main className="container py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading profile…</div>
        </main>
      </>
    )
  }

  if (isError || !volunteer) {
    return (
      <>
        <main className="container py-5 pb-15">
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
      <main className="container py-5 pb-15">
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
                    className={`inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-gray-700 dark:text-gray-300${endorsedSkillIds.has(s.id) ? ' matched' : ''}`}
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

              <div id="contactInfo" className={hasContact ? 'block' : 'hidden'}>
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
                    className={`inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-gray-700 dark:text-gray-300 border-l-[3px] ${e.rating === 'strong' ? 'border-l-success' : 'border-l-secondary'}`}
                  >
                    {e.skillName}{' '}
                    <small className={e.rating === 'strong' ? 'text-success' : 'text-secondary'}>
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
                    <span className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-gray-700 dark:text-gray-300 mt-1">
                      {t.skillName}
                    </span>
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
                    <Badge variant={projectStatusVariant(p.status)}>
                      {STATUS_LABELS[p.status] ?? p.status.replace(/_/g, ' ')}
                    </Badge>
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
