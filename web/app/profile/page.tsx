'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

interface ProfileData {
  name: string
  bio: string | null
  location: string | null
  availability_hours_per_week: number | null
  profile_visible: boolean
  email_digest: string
  other_skills: string | null
  skills: Array<{ id: number; proficiency_level: string | null }>
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [hours, setHours] = useState('')
  const [profileVisible, setProfileVisible] = useState(false)
  const [emailDigest, setEmailDigest] = useState('none')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [otherSkills, setOtherSkills] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<ProfileData>('/api/auth/me')
      .then(d => {
        setName(d.name ?? '')
        setBio(d.bio ?? '')
        setLocation(d.location ?? '')
        setHours(d.availability_hours_per_week != null ? String(d.availability_hours_per_week) : '')
        setProfileVisible(!!d.profile_visible)
        setEmailDigest(d.email_digest ?? 'none')
        setOtherSkills(d.other_skills ?? '')
        setSkills(
          (d.skills ?? []).map(s => ({
            skillId: s.id,
            proficiencyLevel: s.proficiency_level ?? 'intermediate',
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false))
  }, [user])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setAlert(null)
    setSubmitting(true)
    try {
      await apiRequest('/api/volunteers/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim() || null,
          location: location.trim() || null,
          availability_hours_per_week: hours ? Number(hours) : null,
          profile_visible: profileVisible,
          email_digest: emailDigest,
          other_skills: otherSkills.trim() || null,
          skill_ids: skills.map(s => s.skillId),
        }),
      })
      setAlert({ type: 'success', message: 'Profile updated!' })
    } catch (err: unknown) {
      setAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save profile' })
    } finally {
      setSubmitting(false)
    }
  }

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

  return (
    <>
      <Header />
      <main className="container page">
        <h1>Your Profile</h1>

        {alert && (
          <div role="alert" className={`message ${alert.type === 'success' ? 'success' : 'error'}`} style={{ marginBottom: 16 }}>
            {alert.message}
          </div>
        )}

        <form className="card" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="bio">About You</label>
            <textarea
              id="bio"
              rows={4}
              value={bio}
              onChange={e => setBio(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="hours">Hours per Week</label>
            <input
              type="number"
              id="hours"
              min={0}
              max={168}
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                id="profile_visible"
                checked={profileVisible}
                onChange={e => setProfileVisible(e.target.checked)}
              />
              Show my profile in the volunteer directory
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="email_digest">Email Digest</label>
            <select
              id="email_digest"
              value={emailDigest}
              onChange={e => setEmailDigest(e.target.value)}
            >
              <option value="none">No email digest</option>
              <option value="match">Email me when a project matches my skills</option>
              <option value="fortnightly">Fortnightly digest</option>
            </select>
          </div>

          <div className="form-group">
            <label>Skills</label>
            <SkillPicker value={skills} onChange={setSkills} />
          </div>

          <div className="form-group">
            <label htmlFor="other_skills">Other Skills</label>
            <input
              type="text"
              id="other_skills"
              placeholder="Any skills not listed above…"
              value={otherSkills}
              onChange={e => setOtherSkills(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </main>
    </>
  )
}
