'use client'

import { useState, useEffect, Suspense, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import Button from '@/components/Button'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import SkillPicker from '@/components/SkillPicker'
import { orpc } from '@/lib/orpc'
import {
  COUNTRY_OPTIONS,
  NO_LOCAL_GROUP,
  buildLocalGroupOptionsForCountry,
  type LocalGroupOption,
} from '@/lib/filter-options'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

function UpdateApplicationForm({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [applicationMessage, setApplicationMessage] = useState('')
  const [bio, setBio] = useState('')
  const [discord, setDiscord] = useState('')
  const [signal, setSignal] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [availability, setAvailability] = useState('')
  const [location, setLocation] = useState('')
  const [countryValue, setCountryValue] = useState('')
  const [localGroupValue, setLocalGroupValue] = useState('')
  const [otherSkills, setOtherSkills] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [prefilled, setPrefilled] = useState(false)

  const {
    value: contactPref,
    onChange: setContactPref,
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

  const {
    data,
    isPending,
    error: loadError,
  } = useQuery(orpc.applicationUpdate.getByToken.queryOptions({ input: { token } }))
  const { data: localGroupsData } = useQuery(orpc.localGroups.list.queryOptions({ input: {} }))
  const allLocalGroups: LocalGroupOption[] = localGroupsData?.groups ?? []

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (data && !prefilled) {
      setName(data.name)
      setApplicationMessage(data.applicationMessage ?? '')
      setBio(data.bio ?? '')
      setDiscord(data.discordHandle ?? '')
      setSignal(data.signalNumber ?? '')
      setWhatsapp(data.whatsappNumber ?? '')
      setContactPref(data.contactPreference ?? '')
      setContactNotes(data.contactNotes ?? '')
      setAvailability(data.availabilityHoursPerWeek ? String(data.availabilityHoursPerWeek) : '')
      setLocation(data.location ?? '')
      setCountryValue(data.country ?? '')
      setLocalGroupValue(data.localGroup ?? '')
      setOtherSkills(data.otherSkills ?? '')
      setSkills(data.skillIds.map((skillId) => ({ skillId, proficiencyLevel: 'intermediate' })))
      setPrefilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, prefilled])
  /* eslint-enable react-hooks/set-state-in-effect */

  const localGroupOptions = countryValue
    ? buildLocalGroupOptionsForCountry(countryValue, allLocalGroups)
    : []
  const hasLocalGroups = localGroupOptions.some((o) => o.value && o.value !== NO_LOCAL_GROUP)
  const showCityInput = localGroupValue === NO_LOCAL_GROUP || (!!countryValue && !hasLocalGroups)

  function handleCountryChange(value: string) {
    setCountryValue(value)
    setLocalGroupValue('')
  }

  const submitMutation = useMutation({
    ...orpc.applicationUpdate.submit.mutationOptions(),
    onSuccess: () => router.push('/login'),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    submitMutation.mutate(
      {
        token,
        name,
        applicationMessage,
        bio: bio || undefined,
        discordHandle: discord || undefined,
        signalNumber: signal || undefined,
        whatsappNumber: whatsapp || undefined,
        contactPreference: contactPref || undefined,
        contactNotes: contactNotes || undefined,
        availabilityHoursPerWeek: availability ? Number(availability) : undefined,
        location: location || undefined,
        country: countryValue || undefined,
        localGroup:
          localGroupValue && localGroupValue !== NO_LOCAL_GROUP ? localGroupValue : undefined,
        otherSkills: otherSkills || undefined,
        skillIds: skills.map((s) => s.skillId),
      },
      {
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to submit'),
      },
    )
  }

  if (isPending) {
    return <div className="text-center py-10 text-text-light">Loading…</div>
  }

  if (loadError || !data) {
    return (
      <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
        <h3 className="text-error">Invalid Link</h3>
        <p className="text-text-light my-4">
          {loadError instanceof Error
            ? loadError.message
            : 'This link is invalid or has expired. Please contact us if you still need to update your application.'}
        </p>
      </div>
    )
  }

  return (
    <form
      className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
      onSubmit={handleSubmit}
    >
      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-600"
        >
          {error}
        </div>
      )}

      {data.applicationApplicantNotes && (
        <div className="mb-5">
          <h3>Message from the team</h3>
          <div className="bg-background rounded-lg p-4 whitespace-pre-wrap text-sm">
            {data.applicationApplicantNotes}
          </div>
        </div>
      )}

      <div className="mb-5">
        <label htmlFor="name" className="required">
          Your Name
        </label>
        <input
          type="text"
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="applicationMessage" className="required">
          Your Application
        </label>
        <textarea
          id="applicationMessage"
          required
          rows={5}
          value={applicationMessage}
          onChange={(e) => setApplicationMessage(e.target.value)}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="bio">Bio</label>
        <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>

      <h3 className="mt-6">Contact</h3>
      <div className="mb-5">
        <label htmlFor="discord">Discord Handle</label>
        <input
          type="text"
          id="discord"
          value={discord}
          onChange={(e) => setDiscord(e.target.value)}
        />
      </div>
      <div className="mb-5">
        <label htmlFor="signal">Signal Number</label>
        <input type="text" id="signal" value={signal} onChange={(e) => setSignal(e.target.value)} />
      </div>
      <div className="mb-5">
        <label htmlFor="whatsapp">WhatsApp Number</label>
        <input
          type="text"
          id="whatsapp"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
      </div>
      <div className="mb-5">
        <FilterDropdown
          id="contactPreference"
          label="Preferred Contact Method"
          ariaLabel="Select preferred contact method"
          value={contactPref}
          options={contactPrefOptions}
          onChange={setContactPref}
        />
      </div>
      <div className="mb-5">
        <label htmlFor="contactNotes">Contact Notes</label>
        <input
          type="text"
          id="contactNotes"
          value={contactNotes}
          onChange={(e) => setContactNotes(e.target.value)}
        />
      </div>

      <h3 className="mt-6">Availability</h3>
      <div className="mb-5">
        <label htmlFor="availability">Hours per Week</label>
        <input
          type="number"
          id="availability"
          min={1}
          max={40}
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
        />
      </div>
      <div className="mb-5">
        <FilterDropdown
          id="locationCountry"
          label="Country"
          ariaLabel="Select country"
          value={countryValue}
          options={COUNTRY_OPTIONS}
          onChange={handleCountryChange}
          searchable
        />
      </div>
      {countryValue && hasLocalGroups && (
        <div className="mb-5">
          <FilterDropdown
            id="locationGroup"
            label="Local Group"
            ariaLabel="Select local group"
            value={localGroupValue}
            options={localGroupOptions}
            onChange={setLocalGroupValue}
            searchable
          />
        </div>
      )}
      {showCityInput && (
        <div className="mb-5">
          <label htmlFor="location">City / Area</label>
          <input
            type="text"
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      )}

      <h3 className="mt-6">Your Skills</h3>
      <SkillPicker value={skills} onChange={setSkills} />
      <div className="mb-5 mt-4">
        <label htmlFor="otherSkills">Other Skills</label>
        <input
          type="text"
          id="otherSkills"
          value={otherSkills}
          onChange={(e) => setOtherSkills(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full mt-4" disabled={submitMutation.isPending}>
        {submitMutation.isPending ? 'Submitting…' : 'Resubmit Application'}
      </Button>
    </form>
  )
}

function UpdateApplicationContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  if (!token) {
    return (
      <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
        <h3 className="text-error">Invalid Link</h3>
        <p className="text-text-light my-4">This link is missing its token.</p>
      </div>
    )
  }

  return <UpdateApplicationForm token={token} />
}

export default function UpdateApplicationPage() {
  return (
    <main className="container py-5 pb-15">
      <div className="max-w-[500px] my-15 mx-auto">
        <h1 className="text-center mb-6">Update Your Application</h1>
        <Suspense fallback={<div className="text-center py-10 text-text-light">Loading…</div>}>
          <UpdateApplicationContent />
        </Suspense>
      </div>
    </main>
  )
}
