'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
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
  discord_handle: string | null
  signal_number: string | null
  whatsapp_number: string | null
  share_contact_directly: boolean | null
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [hours, setHours] = useState('')
  const [profileVisible, setProfileVisible] = useState(false)
  const [shareContactDirectly, setShareContactDirectly] = useState(false)
  const [discordHandle, setDiscordHandle] = useState('')
  const [signalNumber, setSignalNumber] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
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
        setShareContactDirectly(!!d.share_contact_directly)
        setDiscordHandle(d.discord_handle ?? '')
        setSignalNumber(d.signal_number ?? '')
        setWhatsappNumber(d.whatsapp_number ?? '')
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
          share_contact_directly: shareContactDirectly,
          discord_handle: discordHandle.trim() || null,
          signal_number: signalNumber.trim() || null,
          whatsapp_number: whatsappNumber.trim() || null,
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
        <main className="max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading profile…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Your Profile</h1>

        {alert && (
          <div role="alert" className={alert.type === 'success' ? 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] dark:bg-[#064E3B] dark:text-[#6EE7B7] dark:border-[#059669]' : 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]'}>
            {alert.message}
          </div>
        )}

        <form className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="name">Your Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="mb-5">
            <label htmlFor="bio">About You</label>
            <textarea
              id="bio"
              rows={4}
              value={bio}
              onChange={e => setBio(e.target.value)}
            />
          </div>

          <div className="mb-5">
            <label htmlFor="location">Location</label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>

          <div className="mb-5">
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

          <div className="mb-5">
            <label htmlFor="discord_handle">Discord Handle</label>
            <input
              type="text"
              id="discord_handle"
              value={discordHandle}
              onChange={e => setDiscordHandle(e.target.value)}
              placeholder="e.g. username#1234"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="signal_number">Signal</label>
            <input
              type="text"
              id="signal_number"
              value={signalNumber}
              onChange={e => setSignalNumber(e.target.value)}
              placeholder="e.g. +44…"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="whatsapp_number">WhatsApp</label>
            <input
              type="text"
              id="whatsapp_number"
              value={whatsappNumber}
              onChange={e => setWhatsappNumber(e.target.value)}
              placeholder="e.g. +44…"
            />
          </div>

          <div className="mb-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="profile_visible"
                checked={profileVisible}
                onChange={e => setProfileVisible(e.target.checked)}
              />
              Make my profile visible to other volunteers
            </label>
          </div>

          <div className="mb-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="share_contact_directly"
                checked={shareContactDirectly}
                onChange={e => setShareContactDirectly(e.target.checked)}
              />
              Share my contact info directly with project owners
            </label>
          </div>

          <div className="mb-5">
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

          <div className="mb-5">
            <label>Skills</label>
            <SkillPicker value={skills} onChange={setSkills} />
          </div>

          <div className="mb-5">
            <label htmlFor="other_skills">Other Skills</label>
            <input
              type="text"
              id="other_skills"
              placeholder="Any skills not listed above…"
              value={otherSkills}
              onChange={e => setOtherSkills(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </form>
      </main>
    </>
  )
}
