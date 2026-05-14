'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import FilterDropdown from '@/components/FilterDropdown'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

interface ProfileData {
  name: string
  bio: string | null
  location: string | null
  availability_hours_per_week: number | null
  consent_make_profile_visible_in_directory: boolean
  consent_contactable_by_project_owners: boolean
  consent_share_contact_info_with_project_owner: boolean
  email_digest: string
  other_skills: string | null
  skills: Array<{ id: number; proficiency_level: string | null }>
  discord_handle: string | null
  signal_number: string | null
  whatsapp_number: string | null
  contact_preference: string | null
  contact_notes: string | null
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading, refreshUser } = useAuth()
  const showToast = useToast()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [hours, setHours] = useState('')
  const [consentMakeProfileVisibleInDirectory, setConsentMakeProfileVisibleInDirectory] =
    useState(true)
  const [consentContactableByProjectOwners, setConsentContactableByProjectOwners] = useState(true)
  const [consentShareContactInfoWithProjectOwner, setConsentShareContactInfoWithProjectOwner] =
    useState(false)
  const [discordHandle, setDiscordHandle] = useState('')
  const [signalNumber, setSignalNumber] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [contactPreference, setContactPreference] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [emailDigest, setEmailDigest] = useState('none')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [otherSkills, setOtherSkills] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<ProfileData>('/api/auth/me')
      .then((d) => {
        setName(d.name ?? '')
        setBio(d.bio ?? '')
        setLocation(d.location ?? '')
        setHours(d.availability_hours_per_week != null ? String(d.availability_hours_per_week) : '')
        setConsentMakeProfileVisibleInDirectory(!!d.consent_make_profile_visible_in_directory)
        setConsentContactableByProjectOwners(!!d.consent_contactable_by_project_owners)
        setConsentShareContactInfoWithProjectOwner(
          !!d.consent_share_contact_info_with_project_owner,
        )
        setDiscordHandle(d.discord_handle ?? '')
        setSignalNumber(d.signal_number ?? '')
        setWhatsappNumber(d.whatsapp_number ?? '')
        setContactPreference(d.contact_preference ?? '')
        setContactNotes(d.contact_notes ?? '')
        setEmailDigest(d.email_digest ?? 'none')
        setOtherSkills(d.other_skills ?? '')
        setSkills(
          (d.skills ?? []).map((s) => ({
            skillId: s.id,
            proficiencyLevel: s.proficiency_level ?? 'intermediate',
          })),
        )
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false))
  }, [user])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest('/api/volunteers/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim() || null,
          location: location.trim() || null,
          availability_hours_per_week: hours ? Number(hours) : null,
          consent_make_profile_visible_in_directory: consentMakeProfileVisibleInDirectory,
          consent_contactable_by_project_owners: consentContactableByProjectOwners,
          consent_share_contact_info_with_project_owner: consentShareContactInfoWithProjectOwner,
          discord_handle: discordHandle.trim() || null,
          signal_number: signalNumber.trim() || null,
          whatsapp_number: whatsappNumber.trim() || null,
          contact_preference: contactPreference || null,
          contact_notes: contactNotes.trim() || null,
          email_digest: emailDigest,
          other_skills: otherSkills.trim() || null,
          skill_ids: skills.map((s) => s.skillId),
        }),
      })
      await refreshUser()
      showToast('Profile updated!', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save profile', 'error')
    } finally {
      setSubmitting(false)
    }
  }

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

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Your Profile</h1>

        <form
          className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word max-w-4xl"
          onSubmit={handleSubmit}
        >
          {/* Basic info */}
          <div className="mb-5">
            <label htmlFor="name" className="required">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mb-5">
            <label htmlFor="bio">About You</label>
            <textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>

          {/* Contact Information */}
          <h3 className="mt-6 mb-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-5 mb-5 max-sm:grid-cols-1">
            <div>
              <label htmlFor="discord_handle">Discord Handle</label>
              <input
                type="text"
                id="discord_handle"
                value={discordHandle}
                onChange={(e) => setDiscordHandle(e.target.value)}
                placeholder="e.g. username#1234"
              />
            </div>
            <div>
              <label htmlFor="signal_number">Signal</label>
              <input
                type="text"
                id="signal_number"
                value={signalNumber}
                onChange={(e) => setSignalNumber(e.target.value)}
                placeholder="e.g. +44…"
              />
            </div>
            <div>
              <label htmlFor="whatsapp_number">WhatsApp</label>
              <input
                type="text"
                id="whatsapp_number"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. +44…"
              />
            </div>
            <div>
              <FilterDropdown
                id="contact_preference"
                label="Preferred Contact Method"
                ariaLabel="Preferred Contact Method"
                value={contactPreference}
                options={[
                  { value: '', label: 'Select…' },
                  { value: 'email', label: 'Email' },
                  { value: 'discord', label: 'Discord' },
                  { value: 'signal', label: 'Signal' },
                  { value: 'whatsapp', label: 'WhatsApp' },
                ]}
                onChange={(v) => setContactPreference(v)}
              />
            </div>
          </div>
          <div className="mb-5">
            <label htmlFor="contact_notes">Contact Notes</label>
            <input
              type="text"
              id="contact_notes"
              value={contactNotes}
              onChange={(e) => setContactNotes(e.target.value)}
              placeholder="e.g. Best to DM me on Discord first"
            />
          </div>

          {/* Availability */}
          <h3 className="mt-6 mb-4">Availability</h3>
          <div className="grid grid-cols-2 gap-5 mb-5 max-sm:grid-cols-1">
            <div>
              <label htmlFor="hours">Hours per Week</label>
              <input
                type="number"
                id="hours"
                min={0}
                max={168}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="location">Location</label>
              <input
                type="text"
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. London, UK"
              />
            </div>
          </div>

          {/* Skills */}
          <h3 className="mt-6 mb-4">Your Skills</h3>
          <div className="mb-5">
            <SkillPicker value={skills} onChange={setSkills} />
          </div>
          <div className="mb-5">
            <label htmlFor="other_skills">Other Skills</label>
            <input
              type="text"
              id="other_skills"
              placeholder="Any skills not listed above…"
              value={otherSkills}
              onChange={(e) => setOtherSkills(e.target.value)}
            />
          </div>

          {/* Privacy Settings */}
          <h3 className="mt-6 mb-4">Privacy Settings</h3>
          <div className="mb-5 flex flex-col gap-3">
            <Checkbox
              id="consent_make_profile_visible_in_directory"
              checked={consentMakeProfileVisibleInDirectory}
              onChange={(e) => setConsentMakeProfileVisibleInDirectory(e.target.checked)}
            >
              Make my profile visible in the volunteer directory
            </Checkbox>
            <Checkbox
              id="consent_contactable_by_project_owners"
              checked={consentContactableByProjectOwners}
              onChange={(e) => setConsentContactableByProjectOwners(e.target.checked)}
            >
              Allow project owners to contact me about opportunities
            </Checkbox>
            <div className="ml-7">
              <Checkbox
                id="consent_share_contact_info_with_project_owner"
                checked={consentShareContactInfoWithProjectOwner}
                disabled={!consentContactableByProjectOwners}
                onChange={(e) => setConsentShareContactInfoWithProjectOwner(e.target.checked)}
              >
                <span className={consentContactableByProjectOwners ? '' : 'opacity-50'}>
                  Share my contact info directly with project owners (otherwise they use the contact
                  form)
                </span>
              </Checkbox>
            </div>
          </div>

          {/* Email Notifications */}
          <h3 className="mt-6 mb-4">Email Notifications</h3>
          <div className="mb-5">
            <FilterDropdown
              id="email_digest"
              label="Keep me in the loop about new projects"
              ariaLabel="Keep me in the loop about new projects"
              value={emailDigest}
              options={[
                { value: 'none', label: "Don't email me" },
                { value: 'match', label: 'Email me when a project matches my skills' },
                { value: 'fortnightly', label: 'Send me a fortnightly digest' },
              ]}
              onChange={(v) => setEmailDigest(v)}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </form>

        <div className="bg-surface rounded-xl shadow p-6 mb-4 border-2 border-brand-border">
          <h3>Local Groups</h3>
          <p className="text-text-light mb-4">
            Don&apos;t see your local group listed? Suggest a new one.
          </p>
          <Button href="/suggest-local-group" variant="outline">
            Suggest a Local Group
          </Button>
        </div>

        <div className="bg-surface rounded-xl shadow p-6 mb-4 border-2 border-brand-border">
          <h3>Data &amp; Privacy</h3>
          <p className="text-text-light mb-4">Manage your data or delete your account.</p>
          <Button href="/privacy" variant="outline">
            Privacy Settings
          </Button>
        </div>
      </main>
    </>
  )
}
