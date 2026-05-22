'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useQuery, useMutation } from '@tanstack/react-query'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import SkillPicker from '@/components/SkillPicker'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

export default function ProfilePage() {
  const { user, loading, refreshUser } = useRequireAuth()
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
  const {
    value: contactPreference,
    onChange: setContactPreference,
    options: contactPrefOptions,
  } = useFilterOptions(
    [
      { value: '', label: 'Select…' },
      { value: 'email', label: 'Email' },
      { value: 'discord', label: 'Discord' },
      { value: 'signal', label: 'Signal' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ],
    '',
  )
  const [contactNotes, setContactNotes] = useState('')
  const {
    value: emailDigest,
    onChange: setEmailDigest,
    options: emailDigestOptions,
  } = useFilterOptions(
    [
      { value: 'none', label: "Don't email me" },
      { value: 'match', label: 'Email me when a project matches my skills' },
      { value: 'fortnightly', label: 'Send me a fortnightly digest' },
    ],
    'none',
  )
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [otherSkills, setOtherSkills] = useState('')
  const [initialized, setInitialized] = useState(false)

  const { data: me, isPending: loadingProfile } = useQuery({
    ...orpc.auth.me.queryOptions(),
    enabled: !!user,
  })

  useEffect(() => {
    if (!me || initialized) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true)
    setName(me.name ?? '')
    setBio(me.bio ?? '')
    setLocation(me.location ?? '')
    setHours(me.availabilityHoursPerWeek !== null ? String(me.availabilityHoursPerWeek) : '')
    setConsentMakeProfileVisibleInDirectory(!!me.consentMakeProfileVisibleInDirectory)
    setConsentContactableByProjectOwners(!!me.consentContactableByProjectOwners)
    setConsentShareContactInfoWithProjectOwner(!!me.consentShareContactInfoWithProjectOwner)
    setDiscordHandle(me.discordHandle ?? '')
    setSignalNumber(me.signalNumber ?? '')
    setWhatsappNumber(me.whatsappNumber ?? '')
    setContactPreference(me.contactPreference ?? '')
    setContactNotes(me.contactNotes ?? '')
    setEmailDigest(me.emailDigest ?? 'none')
    setOtherSkills(me.otherSkills ?? '')
    setSkills(
      ((me.skills ?? []) as { id: number; proficiencyLevel?: string | null }[]).map((s) => ({
        skillId: s.id,
        proficiencyLevel: s.proficiencyLevel ?? 'intermediate',
      })),
    )
  }, [me, initialized, setContactPreference, setEmailDigest])

  const updateMutation = useMutation({
    ...orpc.volunteers.updateMe.mutationOptions(),
    onSuccess: async () => {
      await refreshUser()
      showToast('Profile updated!', 'success')
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to save profile', 'error')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    updateMutation.mutate({
      name: name.trim(),
      bio: bio.trim() || null,
      location: location.trim() || null,
      availabilityHoursPerWeek: hours ? Number(hours) : null,
      consentMakeProfileVisibleInDirectory,
      consentContactableByProjectOwners,
      consentShareContactInfoWithProjectOwner,
      discordHandle: discordHandle.trim() || null,
      signalNumber: signalNumber.trim() || null,
      whatsappNumber: whatsappNumber.trim() || null,
      contactPreference: contactPreference || null,
      contactNotes: contactNotes.trim() || null,
      emailDigest,
      otherSkills: otherSkills.trim() || null,
      skillIds: skills.map((s) => s.skillId),
    })
  }

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

  return (
    <>
      <main className="container py-5 pb-15">
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
            <aside className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 mb-2 text-sm text-text-light">
              Shown to other volunteers in the directory if you choose to make your profile visible
              below.
            </aside>
            <textarea
              id="bio"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Your background and what brings you to PauseAI…"
            />
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
                options={contactPrefOptions}
                onChange={setContactPreference}
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
              options={emailDigestOptions}
              onChange={setEmailDigest}
            />
          </div>

          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
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
